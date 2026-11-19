-- =============================================================
-- Bodegas y parking de cada vehículo
--  · Bodegas: dónde están guardados los productos de la tienda
--    (parten Casa Toto, Casa Andrés y Bodega Toto; se editan en el admin).
--  · Cada producto queda en una bodega. Despacho: uno por bodega.
--  · Cada vehículo tiene su parking: sale de ahí, pasa a cargar a la(s)
--    bodega(s), entrega o retira, y vuelve a su parking. El parking puede
--    ser una de las bodegas (en ese caso ese tramo es cero).
-- Se puede correr más de una vez.
-- Requiere antes 20261116100000_rutas_despacho.sql y 20261116160000_retiros.sql.
-- =============================================================

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  address text,
  comuna text,
  lat double precision,
  lng double precision,
  -- Productos sin bodega asignada salen de la bodega principal
  is_default boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists warehouses_one_default on public.warehouses ((true)) where is_default;

drop trigger if exists warehouses_touch on public.warehouses;
create trigger warehouses_touch
  before update on public.warehouses
  for each row execute function public.touch_updated_at();

-- Son direcciones de casas: solo las ve el equipo (el servidor calcula precios con la clave de servicio)
alter table public.warehouses enable row level security;
drop policy if exists "equipo ve bodegas" on public.warehouses;
create policy "equipo ve bodegas" on public.warehouses
  for select to authenticated using (public.can_admin('despacho') or public.can_admin('productos') or public.can_admin('reparto'));
drop policy if exists "admin gestiona bodegas" on public.warehouses;
create policy "admin gestiona bodegas" on public.warehouses
  for all to authenticated using (public.can_admin('despacho')) with check (public.can_admin('despacho'));

-- Bodegas iniciales (solo si aún no hay ninguna). La principal toma la
-- dirección de bodega que ya estaba en los ajustes de reparto.
insert into public.warehouses (name, address, lat, lng, is_default)
select b.name,
       case when b.is_default then s.depot_address end,
       case when b.is_default then s.depot_lat end,
       case when b.is_default then s.depot_lng end,
       b.is_default
from (values ('Bodega Toto', true, 1), ('Casa Toto', false, 2), ('Casa Andrés', false, 3)) as b(name, is_default, ord)
left join public.delivery_settings s on s.id = 1
where not exists (select 1 from public.warehouses)
order by b.ord;

-- Cada producto en una bodega (null = bodega principal)
alter table public.products
  add column if not exists warehouse_id uuid references public.warehouses (id) on delete set null;
create index if not exists products_warehouse_idx on public.products (warehouse_id);

-- Parking de cada vehículo: una bodega, o una dirección propia
alter table public.vehicles
  add column if not exists parking_warehouse_id uuid references public.warehouses (id) on delete set null,
  add column if not exists parking_address text,
  add column if not exists parking_lat double precision,
  add column if not exists parking_lng double precision;

-- Recorrido completo de la ruta para el mapa y el chofer:
-- [{ "kind": "parking"|"carga"|"descarga", "name", "lat", "lng", "eta" }]
alter table public.delivery_routes
  add column if not exists waypoints jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
