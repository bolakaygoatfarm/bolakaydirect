-- BOLAKAY DIRECT · 0002 · бизнес-логика
-- Все изменения остатков идут только через эти функции и фиксируются в stock_movements.

-- Каталог конкретной точки: товары + доступные партии (или null, если нет в наличии → предзаказ)
create or replace function public.fridge_catalog(p_code text)
returns table (
  product_id uuid, slug text, category text,
  name_uz text, name_ru text, description_uz text, description_ru text,
  composition_uz text, composition_ru text, storage_uz text, storage_ru text,
  size_label text, net_amount numeric, net_unit text, price int, image_url text, sort int,
  batch_id uuid, produced_at timestamptz, expires_at timestamptz, sell_until timestamptz, available int
)
language sql stable security definer set search_path = public as $$
  with f as (select id from public.fridges where code = p_code and status <> 'inactive')
  select p.id, p.slug, p.category,
         p.name_uz, p.name_ru, p.description_uz, p.description_ru,
         p.composition_uz, p.composition_ru, p.storage_uz, p.storage_ru,
         p.size_label, p.net_amount, p.net_unit, p.price, p.image_url, p.sort,
         b.id, b.produced_at, b.expires_at, b.sell_until, (b.qty_on_hand - b.qty_reserved)
  from public.products p
  cross join f
  left join public.batches b
    on b.product_id = p.id and b.fridge_id = f.id and b.status = 'active'
   and b.sell_until > now() and b.qty_on_hand - b.qty_reserved > 0
  where p.is_active
  order by p.sort, p.name_ru, b.produced_at desc;
$$;

-- Снять резерв заказа (внутренняя)
create or replace function public._release_order(p_order_id uuid, p_status public.order_status, p_reason text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare it record;
begin
  for it in select oi.batch_id, sum(oi.qty)::int as qty from public.order_items oi
            where oi.order_id = p_order_id group by oi.batch_id order by oi.batch_id loop
    update public.batches set qty_reserved = greatest(qty_reserved - it.qty, 0) where id = it.batch_id;
    insert into public.stock_movements(batch_id, kind, qty, order_id, actor, note)
    values (it.batch_id, 'release', it.qty, p_order_id, p_actor, p_reason);
  end loop;
  update public.orders set status = p_status, cancelled_at = now(), cancel_reason = p_reason where id = p_order_id;
end $$;

-- Оформление заказа: атомарный резерв с блокировкой партий
create or replace function public.create_order(
  p_fridge_code text, p_phone text, p_name text, p_items jsonb,
  p_pickup_date date, p_pickup_slot text,
  p_payment_method public.payment_method default 'on_pickup', p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_fridge public.fridges%rowtype;
  v_settings public.settings%rowtype;
  v_customer_id uuid;
  v_order_id uuid; v_number bigint; v_token uuid; v_code text;
  v_total int := 0;
  v_item record;
  v_batch public.batches%rowtype;
  v_product public.products%rowtype;
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_slot_start time; v_slot_end time;
  v_pickup_start timestamptz; v_reserved_until timestamptz;
  v_status public.order_status;
begin
  select * into v_settings from public.settings where id = 1;
  select * into v_fridge from public.fridges where code = p_fridge_code and status = 'active';
  if not found then raise exception 'FRIDGE_UNAVAILABLE'; end if;
  if p_phone is null or p_phone !~ '^\+998[0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  if p_name is not null and length(p_name) > 60 then raise exception 'INVALID_NAME'; end if;
  if p_comment is not null and length(p_comment) > 300 then raise exception 'INVALID_COMMENT'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'INVALID_ITEMS';
  end if;
  if p_pickup_date is null or p_pickup_date < v_today or p_pickup_date > v_today + 1 then raise exception 'INVALID_DATE'; end if;
  if p_pickup_slot is null or p_pickup_slot !~ '^[0-2][0-9]:[0-5][0-9]-[0-2][0-9]:[0-5][0-9]$' then raise exception 'INVALID_SLOT'; end if;
  v_slot_start := split_part(p_pickup_slot, '-', 1)::time;
  v_slot_end   := split_part(p_pickup_slot, '-', 2)::time;
  if v_slot_start >= v_slot_end or v_slot_start < v_fridge.open_time or v_slot_end > v_fridge.close_time then
    raise exception 'INVALID_SLOT';
  end if;
  v_pickup_start := (p_pickup_date + v_slot_start) at time zone 'Asia/Tashkent';
  if ((p_pickup_date + v_slot_end) at time zone 'Asia/Tashkent') <= now() then raise exception 'SLOT_PASSED'; end if;
  if (p_payment_method = 'click' and not v_settings.click_enabled)
     or (p_payment_method = 'payme' and not v_settings.payme_enabled) then
    raise exception 'PAYMENT_METHOD_DISABLED';
  end if;

  insert into public.customers(phone) values (p_phone)
  on conflict (phone) do update set phone = excluded.phone
  returning id into v_customer_id;

  if (select count(*) from public.orders
      where customer_id = v_customer_id and status in ('pending_payment','confirmed')) >= 3 then
    raise exception 'TOO_MANY_OPEN_ORDERS';
  end if;

  if p_payment_method = 'on_pickup' then
    v_status := 'confirmed';
    v_reserved_until := ((p_pickup_date + v_slot_end) at time zone 'Asia/Tashkent')
                        + make_interval(mins => v_settings.pickup_grace_minutes);
  else
    v_status := 'pending_payment';
    v_reserved_until := now() + make_interval(mins => v_settings.payment_hold_minutes);
  end if;

  v_code := lpad(floor(random() * 10000)::int::text, 4, '0');

  insert into public.orders(pickup_code, customer_id, customer_name, fridge_id, status, payment_method,
                            pickup_date, pickup_slot, reserved_until, comment)
  values (v_code, v_customer_id, nullif(trim(p_name), ''), v_fridge.id, v_status, p_payment_method,
          p_pickup_date, p_pickup_slot, v_reserved_until, nullif(trim(p_comment), ''))
  returning id, number, public_token into v_order_id, v_number, v_token;

  -- одинаковые партии суммируем; блокируем строки в постоянном порядке (без взаимоблокировок)
  for v_item in
    select (e->>'batch_id')::uuid as batch_id, sum((e->>'qty')::int)::int as qty
    from jsonb_array_elements(p_items) e group by 1 order by 1
  loop
    if v_item.qty is null or v_item.qty < 1 or v_item.qty > 20 then raise exception 'INVALID_QTY'; end if;

    select * into v_batch from public.batches where id = v_item.batch_id for update;
    if not found or v_batch.fridge_id <> v_fridge.id or v_batch.status <> 'active'
       or v_batch.sell_until <= greatest(now(), v_pickup_start) then
      raise exception 'BATCH_UNAVAILABLE';
    end if;
    if v_batch.qty_on_hand - v_batch.qty_reserved < v_item.qty then
      raise exception 'INSUFFICIENT_STOCK';
    end if;

    select * into v_product from public.products where id = v_batch.product_id and is_active;
    if not found then raise exception 'BATCH_UNAVAILABLE'; end if;

    update public.batches set qty_reserved = qty_reserved + v_item.qty where id = v_batch.id;
    insert into public.stock_movements(batch_id, kind, qty, order_id, note)
    values (v_batch.id, 'reserve', v_item.qty, v_order_id, 'order #' || v_number);
    insert into public.order_items(order_id, batch_id, product_id, qty, price)
    values (v_order_id, v_batch.id, v_product.id, v_item.qty, v_product.price);
    v_total := v_total + v_product.price * v_item.qty;
  end loop;

  update public.orders set total = v_total where id = v_order_id;

  return jsonb_build_object('number', v_number, 'token', v_token, 'pickup_code', v_code,
                            'status', v_status, 'total', v_total, 'reserved_until', v_reserved_until);
end $$;

-- Статус заказа по секретной ссылке
create or replace function public.get_order(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'number', o.number, 'token', o.public_token, 'pickup_code', o.pickup_code,
    'status', o.status, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
    'total', o.total, 'pickup_date', o.pickup_date, 'pickup_slot', o.pickup_slot,
    'reserved_until', o.reserved_until, 'created_at', o.created_at, 'issued_at', o.issued_at,
    'customer_name', o.customer_name,
    'fridge', jsonb_build_object('code', f.code, 'name', f.name, 'address_uz', f.address_uz,
                                 'address_ru', f.address_ru, 'lat', f.lat, 'lng', f.lng),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name_uz', p.name_uz, 'name_ru', p.name_ru, 'size_label', p.size_label,
        'qty', oi.qty, 'price', oi.price, 'produced_at', b.produced_at, 'expires_at', b.expires_at)
        order by oi.id)
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      join public.batches b on b.id = oi.batch_id
      where oi.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o join public.fridges f on f.id = o.fridge_id
  where o.public_token = p_token;
$$;

-- Покупатель отменяет неоплаченный заказ
create or replace function public.cancel_order_by_token(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.orders
  where public_token = p_token and status in ('pending_payment','confirmed') and payment_status = 'unpaid'
  for update;
  if not found then raise exception 'CANNOT_CANCEL'; end if;
  perform public._release_order(v_id, 'cancelled', 'customer', null);
  return public.get_order(p_token);
end $$;

-- Предзаказ на товар, которого нет в наличии
create or replace function public.create_preorder(p_fridge_code text, p_phone text, p_product_id uuid, p_qty int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_fridge uuid; v_customer uuid; v_id uuid;
begin
  select id into v_fridge from public.fridges where code = p_fridge_code and status <> 'inactive';
  if not found then raise exception 'FRIDGE_UNAVAILABLE'; end if;
  if p_phone is null or p_phone !~ '^\+998[0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 20 then raise exception 'INVALID_QTY'; end if;
  if not exists (select 1 from public.products where id = p_product_id and is_active) then raise exception 'PRODUCT_UNAVAILABLE'; end if;

  insert into public.customers(phone) values (p_phone)
  on conflict (phone) do update set phone = excluded.phone returning id into v_customer;

  if (select count(*) from public.preorders where customer_id = v_customer and status = 'waiting') >= 5 then
    raise exception 'TOO_MANY_PREORDERS';
  end if;

  insert into public.preorders(customer_id, fridge_id, product_id, qty)
  values (v_customer, v_fridge, p_product_id, p_qty) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- Автоматическое снятие просроченных резервов (вызывается pg_cron каждую минуту)
create or replace function public.expire_orders()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from public.orders
           where status in ('pending_payment','confirmed') and payment_status = 'unpaid' and reserved_until < now()
           for update skip locked loop
    perform public._release_order(r.id, 'expired', 'reservation timeout', null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ===== Функции сотрудников =====

-- Выдача заказа по номеру/коду
create or replace function public.issue_order(p_order_id uuid, p_payment_provider text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype; it record;
begin
  if not public.has_role(array['admin','operator','courier']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'confirmed' then raise exception 'ORDER_NOT_ISSUABLE'; end if;

  if v_order.payment_status <> 'paid' then
    if v_order.payment_method = 'on_pickup' and p_payment_provider in ('cash','card_terminal') then
      insert into public.payments(order_id, provider, amount, status, actor)
      values (v_order.id, p_payment_provider, v_order.total, 'paid', auth.uid());
      update public.orders set payment_status = 'paid' where id = v_order.id;
    else
      raise exception 'NOT_PAID';
    end if;
  end if;

  for it in select oi.batch_id, sum(oi.qty)::int as qty from public.order_items oi
            where oi.order_id = v_order.id group by oi.batch_id order by oi.batch_id loop
    update public.batches
       set qty_on_hand = qty_on_hand - it.qty, qty_reserved = qty_reserved - it.qty
     where id = it.batch_id;
    insert into public.stock_movements(batch_id, kind, qty, order_id, actor, note)
    values (it.batch_id, 'issue', it.qty, v_order.id, auth.uid(), 'order #' || v_order.number);
  end loop;

  update public.orders set status = 'issued', issued_at = now(), issued_by = auth.uid() where id = v_order.id;
  insert into public.audit_logs(actor, action, entity, entity_id, data)
  values (auth.uid(), 'issue', 'order', v_order.id::text, jsonb_build_object('payment', p_payment_provider));
  return jsonb_build_object('ok', true, 'number', v_order.number);
end $$;

-- Отмена заказа сотрудником (с отметкой возврата, если оплачен)
create or replace function public.staff_cancel_order(p_order_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype;
begin
  if not public.has_role(array['admin','operator']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status not in ('pending_payment','confirmed') then raise exception 'CANNOT_CANCEL'; end if;

  perform public._release_order(v_order.id, 'cancelled', p_reason, auth.uid());
  if v_order.payment_status = 'paid' then
    insert into public.payments(order_id, provider, amount, status, actor, raw)
    select v_order.id, p.provider, v_order.total, 'refunded', auth.uid(), jsonb_build_object('reason', p_reason)
    from public.payments p where p.order_id = v_order.id and p.status = 'paid' order by p.created_at desc limit 1;
    update public.orders set payment_status = 'refunded' where id = v_order.id;
  end if;
  insert into public.audit_logs(actor, action, entity, entity_id, data)
  values (auth.uid(), 'cancel', 'order', v_order.id::text, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

-- Приёмка партии в холодильник (доставка)
create or replace function public.receive_batch(
  p_fridge_id uuid, p_product_id uuid, p_produced_at timestamptz, p_qty int,
  p_lot_code text default null, p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_product public.products%rowtype; v_sell_until timestamptz; v_expires timestamptz; v_id uuid;
begin
  if not public.has_role(array['admin','operator','courier']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 1000 then raise exception 'INVALID_QTY'; end if;
  if p_produced_at is null or p_produced_at > now() + interval '1 hour' then raise exception 'INVALID_PRODUCED_AT'; end if;
  select * into v_product from public.products where id = p_product_id;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if not exists (select 1 from public.fridges where id = p_fridge_id and status <> 'inactive') then raise exception 'FRIDGE_UNAVAILABLE'; end if;

  -- продавать можно до начала дня (produced + sell_days) по Ташкенту.
  -- Пример: молоко sell_days = 2 → сегодня и завтра, на третий день блокируется.
  v_sell_until := (date_trunc('day', p_produced_at at time zone 'Asia/Tashkent')
                   + make_interval(days => v_product.sell_days)) at time zone 'Asia/Tashkent';
  v_expires := coalesce(p_expires_at, v_sell_until);
  if v_expires < p_produced_at then raise exception 'INVALID_EXPIRES_AT'; end if;
  v_sell_until := least(v_sell_until, v_expires);

  insert into public.batches(product_id, fridge_id, lot_code, produced_at, expires_at, sell_until,
                             qty_received, qty_on_hand, created_by)
  values (p_product_id, p_fridge_id, nullif(trim(p_lot_code), ''), p_produced_at, v_expires, v_sell_until,
          p_qty, p_qty, auth.uid())
  returning id into v_id;
  insert into public.stock_movements(batch_id, kind, qty, actor, note) values (v_id, 'receipt', p_qty, auth.uid(), p_lot_code);
  insert into public.audit_logs(actor, action, entity, entity_id, data)
  values (auth.uid(), 'receive', 'batch', v_id::text, jsonb_build_object('qty', p_qty));
  return v_id;
end $$;

-- Изъятие (возврат на ферму) или списание
create or replace function public.remove_stock(p_batch_id uuid, p_qty int, p_kind public.movement_kind, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_batch public.batches%rowtype;
begin
  if not public.has_role(array['admin','operator','courier']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  if p_kind not in ('withdraw','write_off') then raise exception 'INVALID_KIND'; end if;
  select * into v_batch from public.batches where id = p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if p_qty is null or p_qty < 1 or p_qty > v_batch.qty_on_hand - v_batch.qty_reserved then raise exception 'INVALID_QTY'; end if;

  update public.batches set qty_on_hand = qty_on_hand - p_qty,
    status = case when qty_on_hand - p_qty = 0
                  then (case when p_kind = 'write_off' then 'written_off' else 'withdrawn' end)::public.batch_status
                  else status end
  where id = p_batch_id;
  insert into public.stock_movements(batch_id, kind, qty, actor, note) values (p_batch_id, p_kind, p_qty, auth.uid(), p_note);
  insert into public.audit_logs(actor, action, entity, entity_id, data)
  values (auth.uid(), p_kind::text, 'batch', p_batch_id::text, jsonb_build_object('qty', p_qty, 'note', p_note));
  return jsonb_build_object('ok', true);
end $$;

-- Права на функции
revoke all on function public.fridge_catalog(text) from public;
revoke all on function public._release_order(uuid, public.order_status, text, uuid) from public, anon, authenticated;
revoke all on function public.create_order(text, text, text, jsonb, date, text, public.payment_method, text) from public;
revoke all on function public.get_order(uuid) from public;
revoke all on function public.cancel_order_by_token(uuid) from public;
revoke all on function public.create_preorder(text, text, uuid, int) from public;
revoke all on function public.expire_orders() from public, anon, authenticated;
revoke all on function public.issue_order(uuid, text) from public, anon;
revoke all on function public.staff_cancel_order(uuid, text) from public, anon;
revoke all on function public.receive_batch(uuid, uuid, timestamptz, int, text, timestamptz) from public, anon;
revoke all on function public.remove_stock(uuid, int, public.movement_kind, text) from public, anon;

grant execute on function public.fridge_catalog(text) to anon, authenticated;
grant execute on function public.create_order(text, text, text, jsonb, date, text, public.payment_method, text) to anon, authenticated;
grant execute on function public.get_order(uuid) to anon, authenticated;
grant execute on function public.cancel_order_by_token(uuid) to anon, authenticated;
grant execute on function public.create_preorder(text, text, uuid, int) to anon, authenticated;
grant execute on function public.issue_order(uuid, text) to authenticated;
grant execute on function public.staff_cancel_order(uuid, text) to authenticated;
grant execute on function public.receive_batch(uuid, uuid, timestamptz, int, text, timestamptz) to authenticated;
grant execute on function public.remove_stock(uuid, int, public.movement_kind, text) to authenticated;
