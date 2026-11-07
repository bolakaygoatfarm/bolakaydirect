-- BOLAKAY DIRECT · 0015 · 6-значный код для сотрудников (TOTP, встроенный в Supabase Auth).
-- Требование включается само, когда первый администратор подтвердит код в панели. До этого момента всё работает как раньше:
-- иначе старая версия панели без экрана кода заблокировала бы всех сотрудников.

alter table public.settings add column staff_mfa_required boolean not null default false;

-- Все права сотрудников проходят через эту функцию: и RLS, и функции выдачи, остатков, настроек
create or replace function public.has_role(p_roles public.staff_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid() and s.is_active and s.role = any(p_roles)
  ) and (
    not coalesce((select staff_mfa_required from public.settings where id = 1), false)
    or coalesce(auth.jwt()->>'aal', '') = 'aal2'
  );
$$;

-- Вызывает панель после успешного ввода кода. Только администратор с подтверждённым кодом включает требование
create or replace function public.staff_mfa_activate()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt()->>'aal', '') <> 'aal2' then return false; end if;
  if not exists (select 1 from public.staff where user_id = auth.uid() and is_active and role = 'admin') then return false; end if;
  update public.settings set staff_mfa_required = true where id = 1 and not staff_mfa_required;
  return true;
end $$;

-- Сотрудник потерял телефон: администратор сбрасывает код, при следующем входе сотрудник настроит новый
create or replace function public.admin_reset_staff_mfa(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(array['admin']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  if p_user_id = auth.uid() then raise exception 'CANNOT_RESET_SELF'; end if;
  if not exists (select 1 from public.staff where user_id = p_user_id) then raise exception 'USER_NOT_FOUND'; end if;
  delete from auth.mfa_factors where user_id = p_user_id;
  -- Уже открытые сессии завершаем: сброс должен сработать сразу
  delete from auth.sessions where user_id = p_user_id;
  insert into public.audit_logs(actor, action, entity, entity_id)
  values (auth.uid(), 'reset_mfa', 'staff', p_user_id::text);
  return jsonb_build_object('ok', true);
end $$;

-- Список сотрудников: + настроен ли код
drop function public.admin_list_staff();
create function public.admin_list_staff()
returns table (user_id uuid, email text, full_name text, role public.staff_role, is_active boolean, mfa_enabled boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['admin']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  return query select s.user_id, u.email::text, s.full_name, s.role, s.is_active,
    exists (select 1 from auth.mfa_factors f where f.user_id = s.user_id and f.status = 'verified')
    from public.staff s join auth.users u on u.id = s.user_id order by s.full_name;
end $$;

revoke all on function public.staff_mfa_activate() from public, anon;
revoke all on function public.admin_reset_staff_mfa(uuid) from public, anon;
revoke all on function public.admin_list_staff() from public, anon;
grant execute on function public.staff_mfa_activate(), public.admin_reset_staff_mfa(uuid), public.admin_list_staff() to authenticated;
