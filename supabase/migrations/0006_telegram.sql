-- BOLAKAY DIRECT · 0006 · Telegram-бот: привязка покупателей, чат администратора, уведомления из БД
create extension if not exists pg_net with schema extensions;

-- Закрытая конфигурация (схема private не доступна через API)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.tg_config (
  id int primary key default 1 check (id = 1),
  webhook_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  function_url text not null,
  site_url text not null default 'http://localhost:3100',
  admin_bind_code text,
  admin_bind_expires timestamptz
);
-- Замените <project-ref> на ref своего проекта Supabase
insert into private.tg_config (function_url) values ('https://hixmovjvfxrxtqittccz.supabase.co/functions/v1/telegram-bot');

alter table public.customers
  add column telegram_lang text check (telegram_lang in ('uz','ru')),
  add column telegram_username text,
  add column telegram_linked_at timestamptz;
alter table public.settings add column telegram_admin_chat_id bigint;

-- get_order: + product_id (для повтора заказа) и признак подключённого Telegram
create or replace function public.get_order(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'number', o.number, 'token', o.public_token, 'pickup_code', o.pickup_code,
    'status', o.status, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
    'total', o.total, 'pickup_date', o.pickup_date, 'pickup_slot', o.pickup_slot,
    'reserved_until', o.reserved_until, 'created_at', o.created_at, 'issued_at', o.issued_at,
    'customer_name', o.customer_name,
    'telegram_linked', (c.telegram_chat_id is not null),
    'fridge', jsonb_build_object('code', f.code, 'name', f.name, 'address_uz', f.address_uz,
                                 'address_ru', f.address_ru, 'lat', f.lat, 'lng', f.lng),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', oi.product_id,
        'name_uz', p.name_uz, 'name_ru', p.name_ru, 'size_label', p.size_label,
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

-- ===== Функции для Edge Function (только service_role / secret key) =====
create or replace function public.tg_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'webhook_secret', c.webhook_secret, 'function_url', c.function_url, 'site_url', c.site_url,
    'admin_chat_id', s.telegram_admin_chat_id, 'bot_username', s.telegram_bot_username, 'support_phone', s.support_phone)
  from private.tg_config c cross join public.settings s where c.id = 1 and s.id = 1;
$$;

create or replace function public.tg_save_setup(p_bot_username text, p_site_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.settings set telegram_bot_username = p_bot_username, updated_at = now() where id = 1;
  if p_site_url ~ '^https?://' then
    update private.tg_config set site_url = rtrim(p_site_url, '/') where id = 1;
  end if;
end $$;

create or replace function public.tg_link_order(p_token uuid, p_chat_id bigint, p_lang text, p_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_customer uuid;
begin
  select customer_id into v_customer from public.orders where public_token = p_token;
  if not found then return null; end if;
  update public.customers set telegram_chat_id = null where telegram_chat_id = p_chat_id and id <> v_customer;
  update public.customers
     set telegram_chat_id = p_chat_id,
         telegram_lang = case when p_lang in ('uz','ru') then p_lang else coalesce(telegram_lang, 'uz') end,
         telegram_username = p_username,
         telegram_linked_at = now()
   where id = v_customer;
  return public.get_order(p_token);
end $$;

create or replace function public.tg_customer(p_chat_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'phone', c.phone, 'lang', coalesce(c.telegram_lang, 'uz'))
  from public.customers c where c.telegram_chat_id = p_chat_id;
$$;

create or replace function public.tg_set_lang(p_chat_id bigint, p_lang text)
returns void language sql security definer set search_path = public as $$
  update public.customers set telegram_lang = p_lang where telegram_chat_id = p_chat_id and p_lang in ('uz','ru');
$$;

create or replace function public.tg_unlink(p_chat_id bigint)
returns void language sql security definer set search_path = public as $$
  update public.customers set telegram_chat_id = null, telegram_linked_at = null where telegram_chat_id = p_chat_id;
$$;

create or replace function public.tg_orders_by_chat(p_chat_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.get_order(x.public_token) order by x.created_at desc), '[]'::jsonb)
  from (select o.public_token, o.created_at from public.orders o
        join public.customers c on c.id = o.customer_id
        where c.telegram_chat_id = p_chat_id order by o.created_at desc limit 5) x;
$$;

create or replace function public.tg_bind_admin(p_code text, p_chat_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from private.tg_config where id = 1 and admin_bind_code = p_code and admin_bind_expires > now()) then
    return false;
  end if;
  update public.settings set telegram_admin_chat_id = p_chat_id where id = 1;
  update private.tg_config set admin_bind_code = null, admin_bind_expires = null where id = 1;
  return true;
end $$;

create or replace function public.tg_order_event(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('chat_id', c.telegram_chat_id, 'lang', coalesce(c.telegram_lang, 'uz'),
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

-- ===== Функции для админ-панели =====
create or replace function public.admin_tg_bind_code()
returns text language plpgsql security definer set search_path = public as $$
declare v text := lpad(floor(random() * 1000000)::int::text, 6, '0');
begin
  if not public.has_role(array['admin']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  update private.tg_config set admin_bind_code = v, admin_bind_expires = now() + interval '15 minutes' where id = 1;
  return v;
end $$;

create or replace function public.admin_tg_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['admin']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  return (select jsonb_build_object(
    'bot_username', s.telegram_bot_username,
    'admin_chat_linked', s.telegram_admin_chat_id is not null,
    'site_url', c.site_url,
    'linked_customers', (select count(*) from public.customers where telegram_chat_id is not null))
    from public.settings s cross join private.tg_config c where s.id = 1 and c.id = 1);
end $$;

-- ===== Триггеры → Edge Function /notify (асинхронно через pg_net) =====
create or replace function public._tg_post(p_event text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select tc.function_url, tc.webhook_secret into c from private.tg_config tc where tc.id = 1;
  if c.function_url is null or (select telegram_bot_username from public.settings where id = 1) is null then return; end if;
  perform net.http_post(
    url := c.function_url || '/notify',
    body := jsonb_build_object('event', p_event, 'id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bolakay-secret', c.webhook_secret),
    timeout_milliseconds := 10000);
end $$;

create or replace function public._tg_orders_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- create_order вставляет заказ с total = 0 и в конце проставляет сумму → это момент «заказ создан»
  if old.total = 0 and new.total > 0 and new.status in ('confirmed','pending_payment') then
    perform public._tg_post('order_created', new.id);
  elsif new.status is distinct from old.status and new.status in ('issued','cancelled','expired') then
    perform public._tg_post('order_status', new.id);
  end if;
  return new;
end $$;
create trigger orders_telegram after update on public.orders for each row execute function public._tg_orders_trg();

create or replace function public._tg_batches_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.preorders p join public.customers c on c.id = p.customer_id
             where p.fridge_id = new.fridge_id and p.product_id = new.product_id and p.status = 'waiting'
               and c.telegram_chat_id is not null) then
    perform public._tg_post('batch_arrived', new.id);
  end if;
  return new;
end $$;
create trigger batches_telegram after insert on public.batches for each row execute function public._tg_batches_trg();

-- Права
revoke all on function public.tg_config() from public, anon, authenticated;
revoke all on function public.tg_save_setup(text, text) from public, anon, authenticated;
revoke all on function public.tg_link_order(uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public.tg_customer(bigint) from public, anon, authenticated;
revoke all on function public.tg_set_lang(bigint, text) from public, anon, authenticated;
revoke all on function public.tg_unlink(bigint) from public, anon, authenticated;
revoke all on function public.tg_orders_by_chat(bigint) from public, anon, authenticated;
revoke all on function public.tg_bind_admin(text, bigint) from public, anon, authenticated;
revoke all on function public.tg_order_event(uuid) from public, anon, authenticated;
revoke all on function public.tg_batch_event(uuid) from public, anon, authenticated;
revoke all on function public._tg_post(text, uuid) from public, anon, authenticated;
revoke all on function public._tg_orders_trg() from public, anon, authenticated;
revoke all on function public._tg_batches_trg() from public, anon, authenticated;
grant execute on function public.tg_config(), public.tg_save_setup(text, text), public.tg_link_order(uuid, bigint, text, text),
  public.tg_customer(bigint), public.tg_set_lang(bigint, text), public.tg_unlink(bigint), public.tg_orders_by_chat(bigint),
  public.tg_bind_admin(text, bigint), public.tg_order_event(uuid), public.tg_batch_event(uuid) to service_role;
revoke all on function public.admin_tg_bind_code() from public, anon;
revoke all on function public.admin_tg_status() from public, anon;
grant execute on function public.admin_tg_bind_code(), public.admin_tg_status() to authenticated;
