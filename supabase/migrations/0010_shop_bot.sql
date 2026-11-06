-- BOLAKAY DIRECT · 0010 · второй Telegram-бот: заказы прямо в чате и кнопка Web App
-- Заказы создаются той же функцией create_order, что и на сайте: правила брони и остатков общие.
-- Заказ относится к боту через orders.tg_shop_chat_id, поэтому человек видит в боте только свои заказы,
-- даже если в заказе на сайте кто-то указал его номер телефона.

alter table private.tg_config
  add column shop_webhook_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  add column shop_function_url text;
update private.tg_config set shop_function_url = replace(function_url, '/telegram-bot', '/telegram-shop') where id = 1;

-- Покупатели бота и черновик заказа (корзина, шаг оформления). Схема private через API недоступна
create table private.shop_users (
  chat_id bigint primary key,
  lang text not null default 'uz' check (lang in ('uz','ru','en')),
  phone text,
  name text,
  username text,
  muted boolean not null default false,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.settings add column telegram_shop_bot_username text;
alter table public.orders add column tg_shop_chat_id bigint;
alter table public.preorders add column tg_shop_chat_id bigint;
create index orders_tg_shop_chat_idx on public.orders (tg_shop_chat_id, created_at desc) where tg_shop_chat_id is not null;
create index preorders_tg_shop_chat_idx on public.preorders (fridge_id, product_id) where tg_shop_chat_id is not null and status = 'waiting';

-- Страница заказа: заказ из бота считается подключённым к Telegram, кнопка первого бота не нужна
create or replace function public.get_order(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'number', o.number, 'token', o.public_token, 'pickup_code', o.pickup_code,
    'status', o.status, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
    'total', o.total, 'pickup_date', o.pickup_date, 'pickup_slot', o.pickup_slot,
    'reserved_until', o.reserved_until, 'created_at', o.created_at, 'issued_at', o.issued_at,
    'customer_name', o.customer_name,
    'telegram_linked', (c.telegram_chat_id is not null or o.tg_shop_chat_id is not null),
    'fridge', jsonb_build_object('code', f.code, 'name', f.name, 'address_uz', f.address_uz,
                                 'address_ru', f.address_ru, 'address_en', f.address_en, 'lat', f.lat, 'lng', f.lng),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', oi.product_id,
        'name_uz', p.name_uz, 'name_ru', p.name_ru, 'name_en', p.name_en, 'size_label', p.size_label,
        'qty', oi.qty, 'price', oi.price, 'produced_at', b.produced_at, 'expires_at', b.expires_at)
        order by oi.id)
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      join public.batches b on b.id = oi.batch_id
      where oi.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  join public.fridges f on f.id = o.fridge_id
  join public.customers c on c.id = o.customer_id
  where o.public_token = p_token;
$$;

-- Первый бот не дублирует покупателю уведомления о заказах и предзаказах второго (администратору пишет как раньше)
create or replace function public.tg_order_event(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('chat_id', case when o.tg_shop_chat_id is null then c.telegram_chat_id end,
                            'lang', coalesce(c.telegram_lang, 'uz'),
                            'phone', c.phone, 'order', public.get_order(o.public_token))
  from public.orders o join public.customers c on c.id = o.customer_id where o.id = p_order_id;
$$;

create or replace function public.tg_batch_event(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  with b as (select * from public.batches where id = p_batch_id),
  r as (
    update public.preorders pr set status = 'notified'
    from b, public.customers c
    where pr.fridge_id = b.fridge_id and pr.product_id = b.product_id and pr.status = 'waiting'
      and pr.tg_shop_chat_id is null
      and c.id = pr.customer_id and c.telegram_chat_id is not null
    returning c.telegram_chat_id as chat_id, coalesce(c.telegram_lang, 'uz') as lang, pr.qty
  )
  select jsonb_build_object(
    'fridge_code', f.code, 'fridge_name', f.name, 'name_uz', p.name_uz, 'name_ru', p.name_ru, 'size_label', p.size_label,
    'recipients', coalesce((select jsonb_agg(to_jsonb(r)) from r), '[]'::jsonb))
  into v
  from b join public.fridges f on f.id = b.fridge_id join public.products p on p.id = b.product_id;
  return v;
end $$;

-- ===== Функции для Edge Function telegram-shop (только service_role) =====
create or replace function public.shop_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'webhook_secret', c.shop_webhook_secret, 'function_url', c.shop_function_url, 'site_url', c.site_url,
    'admin_chat_id', s.telegram_admin_chat_id, 'bot_username', s.telegram_shop_bot_username, 'support_phone', s.support_phone,
    'pickup_grace_minutes', s.pickup_grace_minutes)
  from private.tg_config c cross join public.settings s where c.id = 1 and s.id = 1;
$$;

create or replace function public.shop_save_setup(p_bot_username text, p_site_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.settings set telegram_shop_bot_username = p_bot_username, updated_at = now() where id = 1;
  -- адрес общий с первым ботом; localhost не должен затирать боевой адрес
  if p_site_url ~ '^https://' then
    update private.tg_config set site_url = rtrim(p_site_url, '/') where id = 1;
  end if;
end $$;

create or replace function public.shop_user(p_chat_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(u) from private.shop_users u where u.chat_id = p_chat_id;
$$;

-- Частичное обновление: меняются только поля, которые есть в p_patch
create or replace function public.shop_user_save(p_chat_id bigint, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into private.shop_users (chat_id) values (p_chat_id) on conflict (chat_id) do nothing;
  update private.shop_users set
    lang = case when p_patch->>'lang' in ('uz','ru','en') then p_patch->>'lang' else lang end,
    phone = case when p_patch ? 'phone' then p_patch->>'phone' else phone end,
    name = case when p_patch ? 'name' then left(p_patch->>'name', 60) else name end,
    username = case when p_patch ? 'username' then p_patch->>'username' else username end,
    muted = case when p_patch ? 'muted' then (p_patch->>'muted')::boolean else muted end,
    state = case when p_patch ? 'state' then p_patch->'state' else state end,
    updated_at = now()
  where chat_id = p_chat_id;
end $$;

create or replace function public.shop_points()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', f.code, 'name', f.name,
    'address_uz', f.address_uz, 'address_ru', f.address_ru, 'address_en', f.address_en,
    'landmark_uz', f.landmark_uz, 'landmark_ru', f.landmark_ru, 'landmark_en', f.landmark_en,
    'open_time', f.open_time, 'close_time', f.close_time) order by f.name), '[]'::jsonb)
  from public.fridges f where f.status = 'active';
$$;

-- Оформление: та же create_order, плюс привязка к чату в одной транзакции (уведомления уходят уже после неё).
-- Блокировка и проверка 5 секунд защищают от двойного нажатия на кнопку
create or replace function public.shop_create_order(
  p_chat_id bigint, p_fridge_code text, p_phone text, p_name text, p_items jsonb,
  p_pickup_date date, p_pickup_slot text, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_res jsonb; v_token uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('shop_order', p_chat_id));
  if exists (select 1 from public.orders where tg_shop_chat_id = p_chat_id and created_at > now() - interval '5 seconds') then
    raise exception 'DUPLICATE_ORDER';
  end if;
  v_res := public.create_order(p_fridge_code, p_phone, p_name, p_items, p_pickup_date, p_pickup_slot, 'on_pickup', p_comment);
  v_token := (v_res->>'token')::uuid;
  update public.orders set tg_shop_chat_id = p_chat_id where public_token = v_token;
  return public.get_order(v_token);
end $$;

create or replace function public.shop_orders(p_chat_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.get_order(x.public_token) order by x.created_at desc), '[]'::jsonb)
  from (select o.public_token, o.created_at from public.orders o
        where o.tg_shop_chat_id = p_chat_id order by o.created_at desc limit 5) x;
$$;

create or replace function public.shop_order(p_chat_id bigint, p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.get_order(o.public_token) from public.orders o
  where o.public_token = p_token and o.tg_shop_chat_id = p_chat_id;
$$;

-- Отменить можно только заказ своего чата
create or replace function public.shop_cancel_order(p_chat_id bigint, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.orders where public_token = p_token and tg_shop_chat_id = p_chat_id) then
    raise exception 'CANNOT_CANCEL';
  end if;
  return public.cancel_order_by_token(p_token);
end $$;

-- Заказ, оформленный на сайте внутри Web App, привязывается к чату (подпись Telegram уже проверена в функции).
-- Уже привязанный заказ чужому чату не передаётся
create or replace function public.shop_link_order(p_token uuid, p_chat_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_chat bigint;
begin
  select tg_shop_chat_id into v_chat from public.orders where public_token = p_token for update;
  if not found or (v_chat is not null and v_chat <> p_chat_id) then return null; end if;
  update public.orders set tg_shop_chat_id = p_chat_id where public_token = p_token;
  insert into private.shop_users (chat_id) values (p_chat_id) on conflict (chat_id) do nothing;
  return public.get_order(p_token) || jsonb_build_object('was_linked', v_chat is not null);
end $$;

create or replace function public.shop_create_preorder(p_chat_id bigint, p_fridge_code text, p_phone text, p_product_id uuid, p_qty int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_res jsonb;
begin
  v_res := public.create_preorder(p_fridge_code, p_phone, p_product_id, p_qty);
  update public.preorders set tg_shop_chat_id = p_chat_id where id = (v_res->>'id')::uuid;
  return v_res;
end $$;

create or replace function public.shop_order_event(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('chat_id', o.tg_shop_chat_id, 'lang', coalesce(u.lang, 'uz'), 'muted', coalesce(u.muted, false),
                            'order', public.get_order(o.public_token))
  from public.orders o left join private.shop_users u on u.chat_id = o.tg_shop_chat_id
  where o.id = p_order_id and o.tg_shop_chat_id is not null;
$$;

create or replace function public.shop_batch_event(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  with b as (select * from public.batches where id = p_batch_id),
  r as (
    update public.preorders pr set status = 'notified'
    from b
    where pr.fridge_id = b.fridge_id and pr.product_id = b.product_id and pr.status = 'waiting'
      and pr.tg_shop_chat_id is not null
    returning pr.tg_shop_chat_id as chat_id, pr.qty
  )
  select jsonb_build_object(
    'fridge_code', f.code, 'fridge_name', f.name,
    'name_uz', p.name_uz, 'name_ru', p.name_ru, 'name_en', p.name_en, 'size_label', p.size_label,
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object('chat_id', r.chat_id, 'lang', coalesce(u.lang, 'uz')))
      from r left join private.shop_users u on u.chat_id = r.chat_id
      where not coalesce(u.muted, false)), '[]'::jsonb))
  into v
  from b join public.fridges f on f.id = b.fridge_id join public.products p on p.id = b.product_id;
  return v;
end $$;

-- ===== Для админ-панели =====
create or replace function public.admin_shop_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['admin']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  return (select jsonb_build_object(
    'bot_username', s.telegram_shop_bot_username,
    'site_url', c.site_url,
    'users', (select count(*) from private.shop_users),
    'orders', (select count(*) from public.orders where tg_shop_chat_id is not null))
    from public.settings s cross join private.tg_config c where s.id = 1 and c.id = 1);
end $$;

-- ===== Триггеры → функция telegram-shop/notify (асинхронно через pg_net) =====
create or replace function public._shop_post(p_event text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select tc.shop_function_url, tc.shop_webhook_secret into c from private.tg_config tc where tc.id = 1;
  if c.shop_function_url is null or (select telegram_shop_bot_username from public.settings where id = 1) is null then return; end if;
  perform net.http_post(
    url := c.shop_function_url || '/notify',
    body := jsonb_build_object('event', p_event, 'id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bolakay-secret', c.shop_webhook_secret),
    timeout_milliseconds := 10000);
end $$;

create or replace function public._shop_orders_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tg_shop_chat_id is not null and new.status is distinct from old.status
     and new.status in ('issued','cancelled','expired') then
    perform public._shop_post('order_status', new.id);
  end if;
  return new;
end $$;
create trigger orders_telegram_shop after update on public.orders for each row execute function public._shop_orders_trg();

create or replace function public._shop_batches_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.preorders p
             where p.fridge_id = new.fridge_id and p.product_id = new.product_id
               and p.status = 'waiting' and p.tg_shop_chat_id is not null) then
    perform public._shop_post('batch_arrived', new.id);
  end if;
  return new;
end $$;
create trigger batches_telegram_shop after insert on public.batches for each row execute function public._shop_batches_trg();

-- ===== Права =====
revoke all on function public.shop_config() from public, anon, authenticated;
revoke all on function public.shop_save_setup(text, text) from public, anon, authenticated;
revoke all on function public.shop_user(bigint) from public, anon, authenticated;
revoke all on function public.shop_user_save(bigint, jsonb) from public, anon, authenticated;
revoke all on function public.shop_points() from public, anon, authenticated;
revoke all on function public.shop_create_order(bigint, text, text, text, jsonb, date, text, text) from public, anon, authenticated;
revoke all on function public.shop_orders(bigint) from public, anon, authenticated;
revoke all on function public.shop_order(bigint, uuid) from public, anon, authenticated;
revoke all on function public.shop_cancel_order(bigint, uuid) from public, anon, authenticated;
revoke all on function public.shop_link_order(uuid, bigint) from public, anon, authenticated;
revoke all on function public.shop_create_preorder(bigint, text, text, uuid, int) from public, anon, authenticated;
revoke all on function public.shop_order_event(uuid) from public, anon, authenticated;
revoke all on function public.shop_batch_event(uuid) from public, anon, authenticated;
revoke all on function public._shop_post(text, uuid) from public, anon, authenticated;
revoke all on function public._shop_orders_trg() from public, anon, authenticated;
revoke all on function public._shop_batches_trg() from public, anon, authenticated;
grant execute on function public.shop_config(), public.shop_save_setup(text, text), public.shop_user(bigint),
  public.shop_user_save(bigint, jsonb), public.shop_points(),
  public.shop_create_order(bigint, text, text, text, jsonb, date, text, text),
  public.shop_orders(bigint), public.shop_order(bigint, uuid), public.shop_cancel_order(bigint, uuid),
  public.shop_link_order(uuid, bigint), public.shop_create_preorder(bigint, text, text, uuid, int),
  public.shop_order_event(uuid), public.shop_batch_event(uuid), public.fridge_catalog(text) to service_role;
revoke all on function public.admin_shop_status() from public, anon;
grant execute on function public.admin_shop_status() to authenticated;
