-- BOLAKAY DIRECT · 0012 · чат администратора: причина отмены в уведомлении и список всех заказов со статусами

-- Уведомление: + причина отмены. Покупателю первого бота по-прежнему не дублируем заказы бота заказов
create or replace function public.tg_order_event(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('chat_id', case when o.tg_shop_chat_id is null then c.telegram_chat_id end,
                            'lang', coalesce(c.telegram_lang, 'uz'),
                            'phone', c.phone, 'cancel_reason', o.cancel_reason,
                            'order', public.get_order(o.public_token))
  from public.orders o join public.customers c on c.id = o.customer_id where o.id = p_order_id;
$$;

-- Список заказов страницами. Вкладки: all, active, pending, issued, cancelled (вместе с истёкшими)
create or replace function public.tg_admin_orders(p_filter text default 'all', p_page int default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  with f as (
    select case p_filter
      when 'active' then array['confirmed']
      when 'pending' then array['pending_payment']
      when 'issued' then array['issued']
      when 'cancelled' then array['cancelled','expired']
      else array['pending_payment','confirmed','issued','cancelled','expired'] end as st
  ), rows as (
    select o.number, o.status, o.payment_method, o.payment_status, o.total, o.pickup_date, o.pickup_slot, c.phone
    from public.orders o join public.customers c on c.id = o.customer_id, f
    where o.status::text = any(f.st)
    order by o.created_at desc
    limit 8 offset greatest(p_page, 0) * 8
  )
  select jsonb_build_object(
    'orders', coalesce((select jsonb_agg(to_jsonb(rows)) from rows), '[]'::jsonb),
    'total', (select count(*) from public.orders o, f where o.status::text = any(f.st)),
    'counts', (select jsonb_build_object(
      'all', count(*),
      'active', count(*) filter (where status = 'confirmed'),
      'pending', count(*) filter (where status = 'pending_payment'),
      'issued', count(*) filter (where status = 'issued'),
      'cancelled', count(*) filter (where status in ('cancelled','expired'))) from public.orders));
$$;

-- Карточка заказа для администратора
create or replace function public.tg_admin_order(p_number bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.get_order(o.public_token) || jsonb_build_object(
    'phone', c.phone, 'comment', o.comment, 'cancel_reason', o.cancel_reason, 'cancelled_at', o.cancelled_at)
  from public.orders o join public.customers c on c.id = o.customer_id where o.number = p_number;
$$;

revoke all on function public.tg_admin_orders(text, int) from public, anon, authenticated;
revoke all on function public.tg_admin_order(bigint) from public, anon, authenticated;
grant execute on function public.tg_admin_orders(text, int), public.tg_admin_order(bigint) to service_role;
