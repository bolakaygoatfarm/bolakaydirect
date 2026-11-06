-- BOLAKAY DIRECT · 0011 · онлайн-оплата Payme (Merchant API) и Click (SHOP API)
-- Подпись и авторизацию проверяет Edge Function payments, состояния платежей меняются только здесь, под блокировкой заказа.

create table private.pay_tx (
  id bigint generated always as identity primary key, -- transaction у Payme, merchant_prepare_id у Click
  provider text not null check (provider in ('payme','click')),
  provider_tx_id text not null,
  order_id uuid not null references public.orders(id),
  amount numeric not null,          -- как у провайдера: Payme в тийинах, Click в сумах
  state smallint not null default 1, -- 1 создана, 2 проведена, -1 отменена до проведения, -2 отменена после
  provider_time bigint,             -- время создания у Payme, мс
  create_time bigint not null,
  perform_time bigint not null default 0,
  cancel_time bigint not null default 0,
  reason int,
  raw jsonb,
  unique (provider, provider_tx_id)
);
create index pay_tx_order_idx on private.pay_tx (order_id);
create index pay_tx_time_idx on private.pay_tx (provider, provider_time);

-- Фискальные данные товара для чека Payme
alter table public.products
  add column mxik_code text,
  add column package_code text,
  add column vat_percent int not null default 0 check (vat_percent between 0 and 100);

create or replace function public._pay_ms() returns bigint language sql stable as $$
  select (extract(epoch from now()) * 1000)::bigint;
$$;

-- Заказ оплачен: резерв держится уже до конца выдачи, как у оплаты при получении
create or replace function public._pay_mark_paid(p_order_id uuid, p_provider text, p_amount int, p_txn text, p_raw jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; v_grace int; v_end timestamptz; v_sell timestamptz;
begin
  select * into o from public.orders where id = p_order_id;
  select pickup_grace_minutes into v_grace from public.settings where id = 1;
  v_end := (o.pickup_date + split_part(o.pickup_slot, '-', 2)::time) at time zone 'Asia/Tashkent';
  select min(b.sell_until) into v_sell from public.order_items i join public.batches b on b.id = i.batch_id where i.order_id = p_order_id;
  update public.orders set status = 'confirmed', payment_status = 'paid',
         reserved_until = least(v_end + make_interval(mins => v_grace), coalesce(v_sell, 'infinity'))
   where id = p_order_id;
  insert into public.payments(order_id, provider, amount, status, provider_txn_id, raw)
  values (p_order_id, p_provider, p_amount, 'paid', p_txn, p_raw);
  insert into public.audit_logs(action, entity, entity_id, data)
  values ('payment', 'order', p_order_id::text, jsonb_build_object('provider', p_provider, 'txn', p_txn, 'amount', p_amount));
end $$;

create or replace function public._payme_err(p_code int, p_key text, p_data text default null)
returns jsonb language sql immutable as $$
  select jsonb_build_object('error', p_code, 'key', p_key, 'data', p_data);
$$;

-- Проверка счёта Payme. Возвращает {order_id} или {error}. Заказ остаётся заблокированным до конца транзакции
create or replace function public._payme_check(p_account jsonb, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_no text := p_account->>'order_id'; o public.orders%rowtype;
begin
  if v_no is null or v_no !~ '^[0-9]{1,18}$' then return public._payme_err(-31050, 'order_not_found', 'order_id'); end if;
  select * into o from public.orders where number = v_no::bigint for update;
  if not found or o.payment_method <> 'payme' then return public._payme_err(-31050, 'order_not_found', 'order_id'); end if;
  if o.status <> 'pending_payment' or o.payment_status <> 'unpaid' or o.reserved_until <= now() then
    return public._payme_err(-31051, 'order_not_payable', 'order_id');
  end if;
  if p_amount <> o.total * 100 then return public._payme_err(-31001, 'wrong_amount'); end if;
  -- Счёт одноразовый: пока идёт одна транзакция, вторую создавать нельзя
  if exists (select 1 from private.pay_tx t where t.provider = 'payme' and t.order_id = o.id and t.state = 1) then
    return public._payme_err(-31052, 'order_busy', 'order_id');
  end if;
  return jsonb_build_object('order_id', o.id);
end $$;

create or replace function public.pay_payme(p_method text, p_p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := p_p->>'id'; v_now bigint := public._pay_ms(); v_timeout constant bigint := 43200000;
  t private.pay_tx%rowtype; o public.orders%rowtype; c jsonb; v_items jsonb; v_time bigint;
begin
  if p_method = 'CheckPerformTransaction' then
    c := public._payme_check(p_p->'account', (p_p->>'amount')::numeric);
    if c ? 'error' then return c; end if;
    -- Чек передаём, только если у всех товаров заполнен ИКПУ и код упаковки: неполный чек хуже отсутствующего
    if not exists (select 1 from public.order_items i join public.products p on p.id = i.product_id
                   where i.order_id = (c->>'order_id')::uuid
                     and (coalesce(p.mxik_code, '') = '' or coalesce(p.package_code, '') = '')) then
      select jsonb_agg(jsonb_build_object('title', p.name_ru || ' ' || p.size_label, 'price', i.price * 100, 'count', i.qty,
             'code', p.mxik_code, 'package_code', p.package_code, 'vat_percent', p.vat_percent) order by i.id)
        into v_items
        from public.order_items i join public.products p on p.id = i.product_id
       where i.order_id = (c->>'order_id')::uuid;
      return jsonb_build_object('result', jsonb_build_object('allow', true, 'detail', jsonb_build_object('receipt_type', 0, 'items', v_items)));
    end if;
    return jsonb_build_object('result', jsonb_build_object('allow', true));
  end if;

  if p_method = 'CreateTransaction' then
    select * into t from private.pay_tx where provider = 'payme' and provider_tx_id = v_id for update;
    if found then
      if t.state <> 1 then return public._payme_err(-31008, 'cannot_perform'); end if;
      if v_now - t.provider_time > v_timeout then
        update private.pay_tx set state = -1, reason = 4, cancel_time = v_now where id = t.id;
        return public._payme_err(-31008, 'cannot_perform');
      end if;
      return jsonb_build_object('result', jsonb_build_object('create_time', t.create_time, 'transaction', t.id::text, 'state', 1));
    end if;
    v_time := (p_p->>'time')::bigint;
    if v_now - v_time > v_timeout then return public._payme_err(-31008, 'cannot_perform'); end if;
    c := public._payme_check(p_p->'account', (p_p->>'amount')::numeric);
    if c ? 'error' then return c; end if;
    insert into private.pay_tx (provider, provider_tx_id, order_id, amount, provider_time, create_time)
    values ('payme', v_id, (c->>'order_id')::uuid, (p_p->>'amount')::numeric, v_time, v_now) returning * into t;
    -- Человек уже вводит карту: резерв не должен истечь прямо во время оплаты
    update public.orders set reserved_until = greatest(reserved_until, now() + interval '20 minutes') where id = t.order_id;
    return jsonb_build_object('result', jsonb_build_object('create_time', t.create_time, 'transaction', t.id::text, 'state', 1));
  end if;

  if p_method in ('PerformTransaction','CancelTransaction','CheckTransaction') then
    select * into t from private.pay_tx where provider = 'payme' and provider_tx_id = v_id for update;
    if not found then return public._payme_err(-31003, 'tx_not_found'); end if;
  end if;

  if p_method = 'PerformTransaction' then
    if t.state = 2 then
      return jsonb_build_object('result', jsonb_build_object('transaction', t.id::text, 'perform_time', t.perform_time, 'state', 2));
    end if;
    if t.state <> 1 then return public._payme_err(-31008, 'cannot_perform'); end if;
    if v_now - t.provider_time > v_timeout then
      update private.pay_tx set state = -1, reason = 4, cancel_time = v_now where id = t.id;
      return public._payme_err(-31008, 'cannot_perform');
    end if;
    select * into o from public.orders where id = t.order_id for update;
    -- Заказ уже снят: отказываем, и Payme не проводит платёж
    if o.status <> 'pending_payment' or o.payment_status <> 'unpaid' then
      return public._payme_err(-31008, 'cannot_perform');
    end if;
    perform public._pay_mark_paid(o.id, 'payme', (t.amount / 100)::int, v_id, null);
    update private.pay_tx set state = 2, perform_time = v_now where id = t.id;
    return jsonb_build_object('result', jsonb_build_object('transaction', t.id::text, 'perform_time', v_now, 'state', 2), 'paid_order', o.id);
  end if;

  if p_method = 'CancelTransaction' then
    if t.state < 0 then
      return jsonb_build_object('result', jsonb_build_object('transaction', t.id::text, 'cancel_time', t.cancel_time, 'state', t.state));
    end if;
    if t.state = 1 then
      -- Оплата не прошла. Заказ остаётся ждать оплату, пока не истечёт резерв: человек может попробовать снова
      update private.pay_tx set state = -1, reason = (p_p->>'reason')::int, cancel_time = v_now where id = t.id;
      return jsonb_build_object('result', jsonb_build_object('transaction', t.id::text, 'cancel_time', v_now, 'state', -1));
    end if;
    select * into o from public.orders where id = t.order_id for update;
    if o.status = 'issued' then return public._payme_err(-31007, 'order_issued'); end if;
    if o.status = 'confirmed' then perform public._release_order(o.id, 'cancelled', 'payme refund', null); end if;
    if o.payment_status = 'paid' then
      update public.orders set payment_status = 'refunded' where id = o.id;
      insert into public.payments(order_id, provider, amount, status, provider_txn_id)
      values (o.id, 'payme', (t.amount / 100)::int, 'refunded', v_id || ':refund');
    end if;
    update private.pay_tx set state = -2, reason = (p_p->>'reason')::int, cancel_time = v_now where id = t.id;
    return jsonb_build_object('result', jsonb_build_object('transaction', t.id::text, 'cancel_time', v_now, 'state', -2));
  end if;

  if p_method = 'CheckTransaction' then
    return jsonb_build_object('result', jsonb_build_object('create_time', t.create_time, 'perform_time', t.perform_time,
      'cancel_time', t.cancel_time, 'transaction', t.id::text, 'state', t.state, 'reason', t.reason));
  end if;

  if p_method = 'GetStatement' then
    return jsonb_build_object('result', jsonb_build_object('transactions', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.provider_tx_id, 'time', x.provider_time, 'amount', x.amount,
               'account', jsonb_build_object('order_id', o2.number::text),
               'create_time', x.create_time, 'perform_time', x.perform_time, 'cancel_time', x.cancel_time,
               'transaction', x.id::text, 'state', x.state, 'reason', x.reason) order by x.provider_time)
      from private.pay_tx x join public.orders o2 on o2.id = x.order_id
      where x.provider = 'payme' and x.provider_time between (p_p->>'from')::bigint and (p_p->>'to')::bigint), '[]'::jsonb)));
  end if;

  return jsonb_build_object('error', -32601, 'key', 'method_not_found', 'data', p_method);
end $$;

create or replace function public.pay_click_prepare(p_trans text, p_order text, p_amount numeric, p_raw jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; t private.pay_tx%rowtype;
begin
  if p_order is null or p_order !~ '^[0-9]{1,18}$' then return jsonb_build_object('error', -5); end if;
  select * into o from public.orders where number = p_order::bigint for update;
  if not found or o.payment_method <> 'click' then return jsonb_build_object('error', -5); end if;
  select * into t from private.pay_tx where provider = 'click' and provider_tx_id = p_trans for update;
  if found and t.state = 2 then return jsonb_build_object('error', -4); end if;
  if found and t.state < 0 then return jsonb_build_object('error', -9); end if;
  if o.payment_status = 'paid' then return jsonb_build_object('error', -4); end if;
  if o.status <> 'pending_payment' or (o.reserved_until <= now() and t.id is null) then return jsonb_build_object('error', -9); end if;
  if p_amount <> o.total then return jsonb_build_object('error', -2); end if;
  if t.id is null then
    insert into private.pay_tx (provider, provider_tx_id, order_id, amount, create_time, raw)
    values ('click', p_trans, o.id, p_amount, public._pay_ms(), p_raw) returning * into t;
  end if;
  update public.orders set reserved_until = greatest(reserved_until, now() + interval '20 minutes') where id = o.id;
  return jsonb_build_object('error', 0, 'id', t.id);
end $$;

create or replace function public.pay_click_complete(p_trans text, p_prepare text, p_order text, p_amount numeric, p_error int, p_raw jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; t private.pay_tx%rowtype; v_now bigint := public._pay_ms();
begin
  if p_prepare is null or p_prepare !~ '^[0-9]{1,18}$' then return jsonb_build_object('error', -6); end if;
  select * into t from private.pay_tx where id = p_prepare::bigint and provider = 'click' and provider_tx_id = p_trans for update;
  if not found then return jsonb_build_object('error', -6); end if;
  select * into o from public.orders where id = t.order_id for update;
  if o.number::text <> p_order then return jsonb_build_object('error', -5); end if;
  if t.state = 2 then return jsonb_build_object('error', -4); end if;
  if t.state < 0 then return jsonb_build_object('error', -9); end if;
  if p_error < 0 then
    update private.pay_tx set state = -1, cancel_time = v_now, reason = p_error where id = t.id;
    return jsonb_build_object('error', -9);
  end if;
  if p_amount <> t.amount then return jsonb_build_object('error', -2); end if;
  update private.pay_tx set state = 2, perform_time = v_now where id = t.id;
  if o.status = 'pending_payment' and o.payment_status = 'unpaid' then
    perform public._pay_mark_paid(o.id, 'click', p_amount::int, p_trans, p_raw);
    return jsonb_build_object('error', 0, 'id', t.id, 'paid_order', o.id);
  end if;
  -- Деньги уже списаны, а заказ снят или оплачен другим платежом. По правилам Click отвечаем «успешно»
  -- и возвращаем деньги: это делает администратор, функция присылает ему тревогу
  insert into public.audit_logs(action, entity, entity_id, data)
  values ('payment_late', 'order', o.id::text, jsonb_build_object('provider', 'click', 'txn', p_trans, 'amount', p_amount));
  return jsonb_build_object('error', 0, 'id', t.id, 'late_order', o.number);
end $$;

-- Данные для уведомлений после оплаты
create or replace function public.pay_paid_event(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'number', o.number, 'pickup_code', o.pickup_code, 'total', o.total, 'pickup_date', o.pickup_date, 'pickup_slot', o.pickup_slot,
    'provider', o.payment_method, 'phone', c.phone,
    'admin_chat_id', s.telegram_admin_chat_id,
    'shop_chat_id', case when not coalesce(u.muted, false) then o.tg_shop_chat_id end,
    'shop_lang', coalesce(u.lang, 'uz'),
    'tg_chat_id', case when o.tg_shop_chat_id is null then c.telegram_chat_id end,
    'tg_lang', coalesce(c.telegram_lang, 'uz'))
  from public.orders o
  join public.customers c on c.id = o.customer_id
  cross join public.settings s
  left join private.shop_users u on u.chat_id = o.tg_shop_chat_id
  where o.id = p_order_id and s.id = 1;
$$;

create or replace function public.pay_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('site_url', c.site_url, 'admin_chat_id', s.telegram_admin_chat_id,
                            'click_enabled', s.click_enabled, 'payme_enabled', s.payme_enabled)
  from private.tg_config c cross join public.settings s where c.id = 1 and s.id = 1;
$$;

-- Бот заказов: + способ оплаты и доступные провайдеры
drop function public.shop_create_order(bigint, text, text, text, jsonb, date, text, text);
create function public.shop_create_order(
  p_chat_id bigint, p_fridge_code text, p_phone text, p_name text, p_items jsonb,
  p_pickup_date date, p_pickup_slot text, p_comment text default null, p_method public.payment_method default 'on_pickup')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_res jsonb; v_token uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('shop_order', p_chat_id));
  if exists (select 1 from public.orders where tg_shop_chat_id = p_chat_id and created_at > now() - interval '5 seconds') then
    raise exception 'DUPLICATE_ORDER';
  end if;
  v_res := public.create_order(p_fridge_code, p_phone, p_name, p_items, p_pickup_date, p_pickup_slot, p_method, p_comment);
  v_token := (v_res->>'token')::uuid;
  update public.orders set tg_shop_chat_id = p_chat_id where public_token = v_token;
  return public.get_order(v_token);
end $$;

create or replace function public.shop_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'webhook_secret', c.shop_webhook_secret, 'function_url', c.shop_function_url, 'site_url', c.site_url,
    'admin_chat_id', s.telegram_admin_chat_id, 'bot_username', s.telegram_shop_bot_username, 'support_phone', s.support_phone,
    'pickup_grace_minutes', s.pickup_grace_minutes, 'payment_hold_minutes', s.payment_hold_minutes,
    'click_enabled', s.click_enabled, 'payme_enabled', s.payme_enabled)
  from private.tg_config c cross join public.settings s where c.id = 1 and s.id = 1;
$$;

-- ===== Права: только service_role (Edge Function), снаружи вызвать нельзя =====
revoke all on function public._pay_ms() from public, anon, authenticated;
revoke all on function public._pay_mark_paid(uuid, text, int, text, jsonb) from public, anon, authenticated;
revoke all on function public._payme_err(int, text, text) from public, anon, authenticated;
revoke all on function public._payme_check(jsonb, numeric) from public, anon, authenticated;
revoke all on function public.pay_payme(text, jsonb) from public, anon, authenticated;
revoke all on function public.pay_click_prepare(text, text, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.pay_click_complete(text, text, text, numeric, int, jsonb) from public, anon, authenticated;
revoke all on function public.pay_paid_event(uuid) from public, anon, authenticated;
revoke all on function public.pay_config() from public, anon, authenticated;
revoke all on function public.shop_create_order(bigint, text, text, text, jsonb, date, text, text, public.payment_method) from public, anon, authenticated;
grant execute on function public.pay_payme(text, jsonb), public.pay_click_prepare(text, text, numeric, jsonb),
  public.pay_click_complete(text, text, text, numeric, int, jsonb), public.pay_paid_event(uuid), public.pay_config(),
  public.shop_create_order(bigint, text, text, text, jsonb, date, text, text, public.payment_method) to service_role;
