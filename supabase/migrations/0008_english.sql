-- BOLAKAY DIRECT · 0008 · английская версия сайта: поля *_en у товаров и точек
alter table public.products
  add column name_en text, add column description_en text,
  add column composition_en text, add column storage_en text;
alter table public.fridges
  add column address_en text, add column landmark_en text;

-- Каталог точки: + английские поля (меняется набор колонок → пересоздаём)
drop function if exists public.fridge_catalog(text);
create function public.fridge_catalog(p_code text)
returns table (
  product_id uuid, slug text, category text,
  name_uz text, name_ru text, name_en text,
  description_uz text, description_ru text, description_en text,
  composition_uz text, composition_ru text, composition_en text,
  storage_uz text, storage_ru text, storage_en text,
  size_label text, net_amount numeric, net_unit text, price int, image_url text, sort int,
  batch_id uuid, produced_at timestamptz, expires_at timestamptz, sell_until timestamptz, available int
)
language sql stable security definer set search_path = public as $$
  with f as (select id from public.fridges where code = p_code and status <> 'inactive')
  select p.id, p.slug, p.category,
         p.name_uz, p.name_ru, p.name_en,
         p.description_uz, p.description_ru, p.description_en,
         p.composition_uz, p.composition_ru, p.composition_en,
         p.storage_uz, p.storage_ru, p.storage_en,
         p.size_label, p.net_amount, p.net_unit, p.price, p.image_url, p.sort,
         b.id, b.produced_at, b.expires_at, b.sell_until, (b.qty_on_hand - b.qty_reserved)
  from public.products p
  cross join f
  left join public.batches b
    on b.product_id = p.id and b.fridge_id = f.id and b.status = 'active'
   and b.sell_until > now() and b.qty_on_hand - b.qty_reserved > 0
  where p.is_active
  order by p.sort, p.name_ru, b.produced_at desc;
$$;
revoke all on function public.fridge_catalog(text) from public;
grant execute on function public.fridge_catalog(text) to anon, authenticated;

-- Заказ: + английские названия товаров и адрес точки
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

-- Английские тексты для демо-товаров и первой точки
update public.products set name_en = v.n, description_en = v.d, composition_en = v.c, storage_en = v.s
from (values
  ('echki-suti-1l', 'Goat milk', 'Pasteurised goat milk from the BOLAKAY farm, milked on the day of production.', 'Pasteurised goat milk 100%', 'Store at +2…+6 °C. Consume within 24 hours after opening.'),
  ('echki-suti-05l', 'Goat milk', 'Goat milk in a small bottle — just enough for a day.', 'Pasteurised goat milk 100%', 'Store at +2…+6 °C.'),
  ('tabiiy-yogurt', 'Natural yogurt', 'Goat milk yogurt with live cultures, no sugar.', 'Goat milk, yogurt starter', 'Store at +2…+6 °C.'),
  ('echki-sariyogi', 'Goat butter', 'Handmade butter from goat cream.', 'Goat cream', 'Store at +2…+6 °C.'),
  ('kapuchino', 'Cappuccino (iced)', 'Ready-to-drink iced cappuccino with goat milk in a sealed bottle.', 'Goat milk, arabica coffee, sugar', 'Store at +2…+6 °C. Shake before drinking.'),
  ('latte', 'Latte (iced)', 'Smooth iced latte with goat milk.', 'Goat milk, arabica coffee', 'Store at +2…+6 °C.'),
  ('kakao', 'Cocoa', 'Cocoa with goat milk — great for kids too.', 'Goat milk, cocoa powder, sugar', 'Store at +2…+6 °C.'),
  ('qulupnay-kokteyl', 'Strawberry milkshake', 'Chilled goat milk shake with strawberries.', 'Goat milk, strawberry purée, sugar', 'Store at +2…+6 °C.')
) as v(slug, n, d, c, s)
where products.slug = v.slug;

update public.fridges set address_en = 'Tashkent, next to Tinchlik metro station',
                          landmark_en = 'At the metro exit, inside a partner store'
where code = 'tinchlik-01';
