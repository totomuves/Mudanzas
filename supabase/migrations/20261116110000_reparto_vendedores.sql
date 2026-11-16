-- =============================================================
-- Reparto propio de cada vendedor
-- Cada vendedor despacha sus pedidos con sus vehículos, su bodega y
-- sus días de despacho. Sus rutas no se mezclan con las de MUVEO.
-- Se puede correr más de una vez.
-- Requiere antes 20261116100000_rutas_despacho.sql.
-- =============================================================

-- Ajustes de reparto de cada vendedor (los de MUVEO siguen en delivery_settings)
create table if not exists public.seller_delivery_settings (
  seller_id uuid primary key references public.sellers (id) on delete cascade,
  days int[] not null default '{2,5}' check (days <@ array[1,2,3,4,5,6,7]),
  cutoff_hour int not null default 18 check (cutoff_hour between 0 and 23),
  start_time time not null default '09:00',
  end_time time not null default '19:00',
  midday_time time not null default '14:00',
  service_minutes int not null default 12 check (service_minutes between 1 and 120),
  window_minutes int not null default 120 check (window_minutes between 30 and 480),
  depot_address text,
  depot_lat double precision,
  depot_lng double precision,
  balance_routes boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists seller_delivery_settings_touch on public.seller_delivery_settings;
create trigger seller_delivery_settings_touch
  before update on public.seller_delivery_settings
  for each row execute function public.touch_updated_at();

-- Se lee y cambia desde el servidor (que valida al vendedor); la fecha de
-- entrega del checkout también se calcula en el servidor.
alter table public.seller_delivery_settings enable row level security;
drop policy if exists "vendedor ve sus ajustes de reparto" on public.seller_delivery_settings;
create policy "vendedor ve sus ajustes de reparto" on public.seller_delivery_settings
  for select to authenticated using (seller_id = public.my_seller_id() or public.can_admin('vendedores'));

-- Vehículos y rutas: null = MUVEO; con vendedor = de ese vendedor
alter table public.vehicles
  add column if not exists seller_id uuid references public.sellers (id) on delete cascade;
alter table public.delivery_routes
  add column if not exists seller_id uuid references public.sellers (id) on delete cascade;
create index if not exists vehicles_seller_idx on public.vehicles (seller_id);
create index if not exists delivery_routes_seller_idx on public.delivery_routes (seller_id, delivery_date);

-- El vendedor ve sus vehículos y rutas
drop policy if exists "vendedor ve sus camiones" on public.vehicles;
create policy "vendedor ve sus camiones" on public.vehicles
  for select to authenticated using (seller_id is not null and seller_id = public.my_seller_id());
drop policy if exists "vendedor ve sus rutas" on public.delivery_routes;
create policy "vendedor ve sus rutas" on public.delivery_routes
  for select to authenticated using (seller_id is not null and seller_id = public.my_seller_id());

notify pgrst, 'reload schema';
