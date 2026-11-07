-- BOLAKAY DIRECT · 0017 · Чат администратора в боте открывается только после входа:
-- email + пароль + код из письма (как в панели). Старый способ — 6 цифр в чат бота — убран.
--
-- Как это работает:
--  1. Администратор пишет боту /admin в личном чате → кнопка «Войти как администратор».
--  2. Внутри Telegram открывается страница сайта /tg-admin: email, пароль, код из письма.
--  3. Функция telegram-bot/bind проверяет подпись Telegram и вход, затем вызывает tg_bind_admin_user.
--  Чат привязан к конкретному администратору: если его отключить или сменить роль, чат отключается сам.

alter table private.tg_config add column if not exists admin_user_id uuid references auth.users(id) on delete set null;

-- Старый код привязки не проверял, кто именно пишет боту
drop function if exists public.tg_bind_admin(text, bigint);
drop function if exists public.admin_tg_bind_code();
alter table private.tg_config drop column if exists admin_bind_code, drop column if exists admin_bind_expires;

-- Чат, подключённый старым способом, отключаем: администратор один раз войдёт в боте заново
update public.settings set telegram_admin_chat_id = null where id = 1;

-- Вызывает функция telegram-bot/bind (сервисный ключ) после проверки подписи Telegram и токена входа
create or replace function public.tg_bind_admin_user(p_chat_id bigint, p_user uuid, p_session uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_chat_id is null or p_chat_id <= 0
     or not exists (select 1 from public.staff where user_id = p_user and is_active and role = 'admin')
     or not public.staff_session_ok(p_session, p_user) then
    return false;
  end if;
  update public.settings set telegram_admin_chat_id = p_chat_id, updated_at = now() where id = 1;
  update private.tg_config set admin_user_id = p_user where id = 1;
  insert into public.audit_logs (actor, action, entity, entity_id, data)
  values (p_user, 'telegram_admin_bound', 'settings', '1', jsonb_build_object('chat_id', p_chat_id));
  return true;
end $$;

-- Команда /logout в чате администратора
create or replace function public.tg_unbind_admin(p_chat_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if (select telegram_admin_chat_id from public.settings where id = 1) is distinct from p_chat_id then return false; end if;
  select admin_user_id into v_user from private.tg_config where id = 1;
  update public.settings set telegram_admin_chat_id = null, updated_at = now() where id = 1;
  update private.tg_config set admin_user_id = null where id = 1;
  insert into public.audit_logs (actor, action, entity, entity_id) values (v_user, 'telegram_admin_logout', 'settings', '1');
  return true;
end $$;

-- Кнопка «Отключить чат» в панели
create or replace function public.admin_tg_unbind()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(array['admin']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  update public.settings set telegram_admin_chat_id = null, updated_at = now() where id = 1;
  update private.tg_config set admin_user_id = null where id = 1;
  insert into public.audit_logs (actor, action, entity, entity_id) values (auth.uid(), 'telegram_admin_unbound', 'settings', '1');
end $$;

-- Статус для панели: + кто из администраторов подключил чат
create or replace function public.admin_tg_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['admin']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  return (select jsonb_build_object(
    'bot_username', s.telegram_bot_username,
    'admin_chat_linked', s.telegram_admin_chat_id is not null,
    'admin_name', (select st.full_name from public.staff st where st.user_id = c.admin_user_id),
    'site_url', c.site_url,
    'linked_customers', (select count(*) from public.customers where telegram_chat_id is not null))
    from public.settings s cross join private.tg_config c where s.id = 1 and c.id = 1);
end $$;

-- Администратора отключили, понизили или удалили — его чат больше не получает заказы
create or replace function public._tg_admin_staff_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid := coalesce(old.user_id, new.user_id);
begin
  if v_user = (select admin_user_id from private.tg_config where id = 1)
     and (tg_op = 'DELETE' or not new.is_active or new.role <> 'admin' or new.user_id is distinct from old.user_id) then
    update public.settings set telegram_admin_chat_id = null, updated_at = now() where id = 1;
    update private.tg_config set admin_user_id = null where id = 1;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists staff_tg_admin on public.staff;
create trigger staff_tg_admin after update or delete on public.staff for each row execute function public._tg_admin_staff_trg();

-- Права
revoke all on function public.tg_bind_admin_user(bigint, uuid, uuid) from public, anon, authenticated;
revoke all on function public.tg_unbind_admin(bigint) from public, anon, authenticated;
revoke all on function public._tg_admin_staff_trg() from public, anon, authenticated;
grant execute on function public.tg_bind_admin_user(bigint, uuid, uuid), public.tg_unbind_admin(bigint) to service_role;
revoke all on function public.admin_tg_unbind() from public, anon;
grant execute on function public.admin_tg_unbind() to authenticated;
