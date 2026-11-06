-- BOLAKAY DIRECT · 0009 · надёжность брони и выдачи
-- 1. Выдача: код получения проверяется на сервере; просроченную партию выдать нельзя.
-- 2. Оформление: интервал получения обязан закончиться до конца срока продажи партии,
--    а резерв не держится дольше этого срока.

-- ===== Выдача =====
drop function if exists public.issue_order(uuid, text);
create function public.issue_order(p_order_id uuid, p_code text, p_payment_provider text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype; it record;
begin
  if not public.has_role(array['admin','operator','courier']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'confirmed' then raise exception 'ORDER_NOT_ISSUABLE'; end if;
  if p_code is null or trim(p_code) <> v_order.pickup_code then raise exception 'WRONG_CODE'; end if;

  -- Просрочка проверяется по часам сервера, до любых изменений и до отметки об оплате
  if exists (
    select 1 from public.order_items oi join public.batches b on b.id = oi.batch_id
    where oi.order_id = v_order.id and (b.sell_until <= now() or b.expires_at <= now())
  ) then
    raise exception 'BATCH_EXPIRED';
  end if;

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
revoke all on function public.issue_order(uuid, text, text) from public, anon;
grant execute on function public.issue_order(uuid, text, text) to authenticated;

-- ===== Оформление =====
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
  v_pickup_end timestamptz; v_reserved_until timestamptz; v_min_sell timestamptz;
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
  v_pickup_end := (p_pickup_date + v_slot_end) at time zone 'Asia/Tashkent';
  if v_pickup_end <= now() then raise exception 'SLOT_PASSED'; end if;
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
    v_reserved_until := v_pickup_end + make_interval(mins => v_settings.pickup_grace_minutes);
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
    -- Товар должен оставаться в сроке до конца выбранного интервала
    if not found or v_batch.fridge_id <> v_fridge.id or v_batch.status <> 'active'
       or v_batch.sell_until < v_pickup_end or v_batch.sell_until <= now() then
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
    v_min_sell := least(coalesce(v_min_sell, v_batch.sell_until), v_batch.sell_until);
  end loop;

  -- Резерв не держится дольше срока продажи самой «короткой» партии в заказе
  v_reserved_until := least(v_reserved_until, v_min_sell);
  update public.orders set total = v_total, reserved_until = v_reserved_until where id = v_order_id;

  return jsonb_build_object('number', v_number, 'token', v_token, 'pickup_code', v_code,
                            'status', v_status, 'total', v_total, 'reserved_until', v_reserved_until);
end $$;
