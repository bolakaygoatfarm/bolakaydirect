-- BOLAKAY DIRECT · 0001 · схема, роли и RLS
create type public.fridge_status   as enum ('active','maintenance','inactive');
create type public.batch_status    as enum ('active','withdrawn','written_off');
create type public.order_status    as enum ('pending_payment','confirmed','issued','cancelled','expired');
create type public.payment_method  as enum ('on_pickup','click','payme');
create type public.payment_status  as enum ('unpaid','paid','refunded','failed');
create type public.staff_role      as enum ('admin','operator','courier');
create type public.movement_kind   as enum ('receipt','reserve','release','issue','write_off','withdraw');
create type public.preorder_status as enum ('waiting','notified','fulfilled','cancelled');

-- Глобальные настройки (одна строка)
create table public.settings (
  id int primary key default 1 check (id = 1),
  payment_hold_minutes int not null default 10 check (payment_hold_minutes between 3 and 60),
  pickup_grace_minutes int not null default 60 check (pickup_grace_minutes between 0 and 600),
  click_enabled boolean not null default false,
  payme_enabled boolean not null default false,
  support_phone text,
  telegram_bot_username text,
  updated_at timestamptz not null default now()
);
insert into public.settings default values;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  category text not null check (category in ('milk','yogurt','butter','drinks')),
  name_uz text not null,
  name_ru text not null,
  description_uz text,
  description_ru text,
  composition_uz text,
  composition_ru text,
  storage_uz text,
  storage_ru text,
  size_label text not null,
  net_amount numeric check (net_amount > 0),
  net_unit text check (net_unit in ('ml','g')),
  price int not null check (price >= 0),
  sell_days int not null default 2 check (sell_days between 1 and 90),
  image_url text,
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.fridges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9-]+$'),
  name text not null,
  address_uz text,
  address_ru text,
  landmark_uz text,
  landmark_ru text,
  lat double precision,
  lng double precision,
  open_time time not null default '08:00',
  close_time time not null default '21:00' check (close_time > open_time),
  status public.fridge_status not null default 'active',
  created_at timestamptz not null default now()
);

create table public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.staff_role not null default 'operator',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  fridge_id uuid not null references public.fridges(id),
  lot_code text,
  produced_at timestamptz not null,
  expires_at timestamptz not null,
  sell_until timestamptz not null,
  qty_received int not null check (qty_received > 0),
  qty_on_hand int not null check (qty_on_hand >= 0),
  qty_reserved int not null default 0 check (qty_reserved >= 0 and qty_reserved <= qty_on_hand),
  status public.batch_status not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index batches_fridge_idx on public.batches (fridge_id, status, sell_until);
create index batches_product_idx on public.batches (product_id);
create index batches_created_by_idx on public.batches (created_by);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^\+998[0-9]{9}$'),
  telegram_chat_id bigint unique,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001) unique,
  public_token uuid not null unique default gen_random_uuid(),
  pickup_code text not null check (pickup_code ~ '^[0-9]{4}$'),
  customer_id uuid not null references public.customers(id),
  customer_name text,
  fridge_id uuid not null references public.fridges(id),
  status public.order_status not null,
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'unpaid',
  total int not null default 0 check (total >= 0),
  pickup_date date not null,
  pickup_slot text not null,
  reserved_until timestamptz not null,
  comment text,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  issued_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancel_reason text
);
create index orders_status_idx on public.orders (status, reserved_until);
create index orders_fridge_idx on public.orders (fridge_id, created_at desc);
create index orders_customer_idx on public.orders (customer_id);
create index orders_issued_by_idx on public.orders (issued_by);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  batch_id uuid not null references public.batches(id),
  product_id uuid not null references public.products(id),
  qty int not null check (qty between 1 and 50),
  price int not null check (price >= 0)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_batch_idx on public.order_items (batch_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.batches(id),
  kind public.movement_kind not null,
  qty int not null check (qty > 0),
  order_id uuid references public.orders(id),
  actor uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);
create index stock_movements_batch_idx on public.stock_movements (batch_id, created_at);
create index stock_movements_order_idx on public.stock_movements (order_id);
create index stock_movements_actor_idx on public.stock_movements (actor);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null check (provider in ('cash','card_terminal','click','payme')),
  amount int not null check (amount >= 0),
  status public.payment_status not null,
  provider_txn_id text,
  raw jsonb,
  actor uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (provider, provider_txn_id)
);
create index payments_order_idx on public.payments (order_id);
create index payments_actor_idx on public.payments (actor);

create table public.preorders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  fridge_id uuid not null references public.fridges(id),
  product_id uuid not null references public.products(id),
  qty int not null check (qty between 1 and 20),
  status public.preorder_status not null default 'waiting',
  created_at timestamptz not null default now()
);
create index preorders_lookup_idx on public.preorders (fridge_id, product_id, status);
create index preorders_customer_idx on public.preorders (customer_id);
create index preorders_product_idx on public.preorders (product_id);

create table public.temperature_logs (
  id bigint generated always as identity primary key,
  fridge_id uuid not null references public.fridges(id),
  temp_c numeric(4,1) not null check (temp_c between -30 and 40),
  note text,
  recorded_by uuid references auth.users(id) default auth.uid(),
  recorded_at timestamptz not null default now()
);
create index temperature_logs_fridge_idx on public.temperature_logs (fridge_id, recorded_at desc);
create index temperature_logs_user_idx on public.temperature_logs (recorded_by);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_actor_idx on public.audit_logs (actor);

-- Проверка роли сотрудника
create or replace function public.has_role(p_roles public.staff_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid() and s.is_active and s.role = any(p_roles)
  );
$$;
revoke all on function public.has_role(public.staff_role[]) from public, anon;
grant execute on function public.has_role(public.staff_role[]) to authenticated;

-- RLS
alter table public.settings         enable row level security;
alter table public.products         enable row level security;
alter table public.fridges          enable row level security;
alter table public.staff            enable row level security;
alter table public.batches          enable row level security;
alter table public.customers        enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.stock_movements  enable row level security;
alter table public.payments         enable row level security;
alter table public.preorders        enable row level security;
alter table public.temperature_logs enable row level security;
alter table public.audit_logs       enable row level security;

-- Публичное чтение каталога и точек
create policy settings_read on public.settings for select to anon, authenticated using (true);
create policy settings_admin on public.settings for update to authenticated
  using (public.has_role(array['admin']::public.staff_role[])) with check (public.has_role(array['admin']::public.staff_role[]));

create policy products_read_public on public.products for select to anon using (is_active);
create policy products_read on public.products for select to authenticated
  using (is_active or public.has_role(array['admin','operator','courier']::public.staff_role[]));
create policy products_admin_ins on public.products for insert to authenticated with check (public.has_role(array['admin']::public.staff_role[]));
create policy products_admin_upd on public.products for update to authenticated
  using (public.has_role(array['admin']::public.staff_role[])) with check (public.has_role(array['admin']::public.staff_role[]));

create policy fridges_read_public on public.fridges for select to anon using (status <> 'inactive');
create policy fridges_read on public.fridges for select to authenticated
  using (status <> 'inactive' or public.has_role(array['admin','operator','courier']::public.staff_role[]));
create policy fridges_admin_ins on public.fridges for insert to authenticated with check (public.has_role(array['admin']::public.staff_role[]));
create policy fridges_admin_upd on public.fridges for update to authenticated
  using (public.has_role(array['admin']::public.staff_role[])) with check (public.has_role(array['admin']::public.staff_role[]));

-- Сотрудники видят себя; админ — всех
create policy staff_read on public.staff for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role(array['admin']::public.staff_role[]));
create policy staff_admin_upd on public.staff for update to authenticated
  using (public.has_role(array['admin']::public.staff_role[])) with check (public.has_role(array['admin']::public.staff_role[]));

-- Операционные данные — только для сотрудников (запись идёт через функции)
create policy batches_staff on public.batches for select to authenticated using (public.has_role(array['admin','operator','courier']::public.staff_role[]));
create policy customers_staff on public.customers for select to authenticated using (public.has_role(array['admin','operator']::public.staff_role[]));
create policy orders_staff on public.orders for select to authenticated using (public.has_role(array['admin','operator','courier']::public.staff_role[]));
create policy order_items_staff on public.order_items for select to authenticated using (public.has_role(array['admin','operator','courier']::public.staff_role[]));
create policy movements_staff on public.stock_movements for select to authenticated using (public.has_role(array['admin','operator','courier']::public.staff_role[]));
create policy payments_staff on public.payments for select to authenticated using (public.has_role(array['admin','operator']::public.staff_role[]));
create policy preorders_staff on public.preorders for select to authenticated using (public.has_role(array['admin','operator','courier']::public.staff_role[]));
create policy preorders_staff_upd on public.preorders for update to authenticated
  using (public.has_role(array['admin','operator','courier']::public.staff_role[])) with check (public.has_role(array['admin','operator','courier']::public.staff_role[]));
create policy temps_staff_read on public.temperature_logs for select to authenticated using (public.has_role(array['admin','operator','courier']::public.staff_role[]));
create policy temps_staff_ins on public.temperature_logs for insert to authenticated
  with check (public.has_role(array['admin','operator','courier']::public.staff_role[]) and recorded_by = (select auth.uid()));
create policy audit_admin on public.audit_logs for select to authenticated using (public.has_role(array['admin']::public.staff_role[]));
