-- BOLAKAY DIRECT · 0005 · срок продажи = 23:59:59 последнего дня (а не полночь следующего)
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

  -- последний момент продажи: конец дня (produced + sell_days - 1) по Ташкенту.
  -- Молоко sell_days = 2 → продаётся сегодня и завтра, на третий день блокируется.
  v_sell_until := ((date_trunc('day', p_produced_at at time zone 'Asia/Tashkent')
                   + make_interval(days => v_product.sell_days)) at time zone 'Asia/Tashkent') - interval '1 second';
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
