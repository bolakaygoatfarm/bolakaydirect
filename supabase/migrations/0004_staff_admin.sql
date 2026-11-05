-- BOLAKAY DIRECT · 0004 · управление сотрудниками из панели администратора
create or replace function public.admin_upsert_staff(p_email text, p_full_name text, p_role public.staff_role, p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not public.has_role(array['admin']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_uid = auth.uid() and (p_role <> 'admin' or not p_active) then raise exception 'CANNOT_DEMOTE_SELF'; end if;
  insert into public.staff(user_id, full_name, role, is_active)
  values (v_uid, coalesce(nullif(trim(p_full_name), ''), p_email), p_role, p_active)
  on conflict (user_id) do update set full_name = excluded.full_name, role = excluded.role, is_active = excluded.is_active;
  insert into public.audit_logs(actor, action, entity, entity_id, data)
  values (auth.uid(), 'upsert_staff', 'staff', v_uid::text, jsonb_build_object('role', p_role, 'active', p_active));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_list_staff()
returns table (user_id uuid, email text, full_name text, role public.staff_role, is_active boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['admin']::public.staff_role[]) then raise exception 'FORBIDDEN'; end if;
  return query select s.user_id, u.email::text, s.full_name, s.role, s.is_active
    from public.staff s join auth.users u on u.id = s.user_id order by s.full_name;
end $$;

revoke all on function public.admin_upsert_staff(text, text, public.staff_role, boolean) from public, anon;
revoke all on function public.admin_list_staff() from public, anon;
grant execute on function public.admin_upsert_staff(text, text, public.staff_role, boolean) to authenticated;
grant execute on function public.admin_list_staff() to authenticated;
