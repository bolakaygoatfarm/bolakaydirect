-- BOLAKAY DIRECT · 0016 · Код из 6 цифр на почту вместо кода из приложения.
-- Сотрудник вводит email и пароль, получает письмо с кодом и подтверждает им именно эту сессию.
-- Требование в базе включается само, когда первый администратор подтвердит код:
-- пока почта не настроена, никого не заблокирует.

-- Незавершённая настройка кода из приложения больше не нужна
delete from auth.mfa_factors where status = 'unverified';

create table private.staff_email_codes (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sent_at timestamptz not null default now()
);

-- Выход удаляет сессию, а вместе с ней и подтверждение
create table private.staff_verified_sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now()
);

-- Журнал отправок: ограничение на пользователя, а не на сессию, новая сессия его не обходит
create table private.staff_code_sends (
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index staff_code_sends_user_at on private.staff_code_sends (user_id, at);

create or replace function private.session_verified(p_session uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from private.staff_verified_sessions v
    where v.session_id = p_session and v.user_id = p_user and v.verified_at > now() - interval '7 days'
  );
$$;

-- Все права сотрудников проходят через эту функцию: и RLS, и функции выдачи, остатков, настроек
create or replace function public.has_role(p_roles public.staff_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid() and s.is_active and s.role = any(p_roles)
  ) and (
    not coalesce((select staff_mfa_required from public.settings where id = 1), false)
    or private.session_verified(nullif(auth.jwt()->>'session_id', '')::uuid, auth.uid())
  );
$$;

-- Для функций ботов и оплаты: они работают с сервисным ключом и передают сессию из проверенного токена
create or replace function public.staff_session_ok(p_session uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((select staff_mfa_required from public.settings where id = 1), false)
    or private.session_verified(p_session, p_user);
$$;

-- Панель спрашивает, нужен ли этой сессии код
create or replace function public.staff_code_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'required', coalesce((select staff_mfa_required from public.settings where id = 1), false),
    'verified', private.session_verified(nullif(auth.jwt()->>'session_id', '')::uuid, auth.uid())
  );
$$;

-- Вызывает функция staff-code. Возвращает код один раз, в базе остаётся только его хеш
create or replace function public.staff_code_issue(p_session uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_wait int;
begin
  if not exists (select 1 from public.staff where user_id = p_user and is_active) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if not exists (select 1 from auth.sessions where id = p_session and user_id = p_user) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if private.session_verified(p_session, p_user) then
    return jsonb_build_object('ok', true, 'verified', true);
  end if;

  select ceil(60 - extract(epoch from now() - sent_at))::int into v_wait
  from private.staff_email_codes where session_id = p_session and expires_at > now();
  if coalesce(v_wait, 0) > 0 then
    return jsonb_build_object('ok', false, 'error', 'WAIT', 'retry_in', v_wait);
  end if;

  delete from private.staff_code_sends where at < now() - interval '1 hour';
  if (select count(*) from private.staff_code_sends where user_id = p_user) >= 8 then
    return jsonb_build_object('ok', false, 'error', 'LIMIT');
  end if;

  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into private.staff_email_codes (session_id, user_id, code_hash, expires_at, attempts, sent_at)
  values (p_session, p_user, encode(extensions.digest(p_session::text || ':' || v_code, 'sha256'), 'hex'), now() + interval '10 minutes', 0, now())
  on conflict (session_id) do update
    set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = now();
  insert into private.staff_code_sends (user_id) values (p_user);
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

-- Письмо не ушло: убираем код, чтобы можно было сразу попробовать снова
create or replace function public.staff_code_clear(p_session uuid)
returns void language sql security definer set search_path = public as $$
  delete from private.staff_email_codes where session_id = p_session;
$$;

-- Ошибки возвращаются значением, а не исключением: иначе откатился бы и счётчик попыток
create or replace function public.staff_code_verify(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_session uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  v_user uuid := auth.uid();
  r private.staff_email_codes;
begin
  if v_session is null or v_user is null
     or not exists (select 1 from public.staff where user_id = v_user and is_active) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select * into r from private.staff_email_codes where session_id = v_session and user_id = v_user for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'NO_CODE'); end if;
  if r.expires_at <= now() then
    delete from private.staff_email_codes where session_id = v_session;
    return jsonb_build_object('ok', false, 'error', 'EXPIRED');
  end if;

  if r.code_hash <> encode(extensions.digest(v_session::text || ':' || coalesce(p_code, ''), 'sha256'), 'hex') then
    if r.attempts + 1 >= 5 then
      delete from private.staff_email_codes where session_id = v_session;
      return jsonb_build_object('ok', false, 'error', 'TOO_MANY');
    end if;
    update private.staff_email_codes set attempts = attempts + 1 where session_id = v_session;
    return jsonb_build_object('ok', false, 'error', 'WRONG', 'left', 5 - r.attempts - 1);
  end if;

  delete from private.staff_email_codes where session_id = v_session;
  insert into private.staff_verified_sessions (session_id, user_id) values (v_session, v_user)
  on conflict (session_id) do update set verified_at = now();
  -- Код дошёл до администратора, значит почта работает: теперь он обязателен для всех
  if exists (select 1 from public.staff where user_id = v_user and is_active and role = 'admin') then
    update public.settings set staff_mfa_required = true where id = 1 and not staff_mfa_required;
  end if;
  insert into public.audit_logs (actor, action, entity, entity_id)
  values (v_user, 'staff_code_verified', 'staff', v_user::text);
  return jsonb_build_object('ok', true);
end $$;

drop function public.staff_mfa_activate();
drop function public.admin_reset_staff_mfa(uuid);

-- Список сотрудников снова без признака кода: настраивать теперь нечего
drop function public.admin_list_staff();
create function public.admin_list_staff()
returns table (user_id uuid, email text, full_name text, role public.staff_role, is_active boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['admin']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  return query select s.user_id, u.email::text, s.full_name, s.role, s.is_active
    from public.staff s join auth.users u on u.id = s.user_id order by s.full_name;
end $$;

revoke all on function private.session_verified(uuid, uuid) from public, anon, authenticated;
revoke all on function public.staff_session_ok(uuid, uuid) from public, anon, authenticated;
revoke all on function public.staff_code_issue(uuid, uuid) from public, anon, authenticated;
revoke all on function public.staff_code_clear(uuid) from public, anon, authenticated;
revoke all on function public.staff_code_status() from public, anon;
revoke all on function public.staff_code_verify(text) from public, anon;
revoke all on function public.admin_list_staff() from public, anon;
grant execute on function public.staff_session_ok(uuid, uuid), public.staff_code_issue(uuid, uuid), public.staff_code_clear(uuid) to service_role;
grant execute on function public.staff_code_status(), public.staff_code_verify(text), public.admin_list_staff() to authenticated;
