-- =============================================================
-- Rutas inteligentes de despacho
--  · Días fijos de despacho con hora de corte (ajustes en el admin)
--  · Camiones con capacidad (kg y m³) y chofer asignado
--  · Tamaño y peso de cada producto
--  · Rutas optimizadas por día, paradas con hora estimada y ventana
--  · Prueba de entrega: foto, firma con el dedo, ubicación y hora
--  · Rol "reparto" para los choferes
-- Se puede correr más de una vez.
-- Requiere antes 20261114150000_despacho_comunas.sql.
-- =============================================================

-- -------------------------------------------------------------
-- Roles del equipo: "reparto" (choferes) pasa a ser sección asignable
-- -------------------------------------------------------------
alter table public.admin_roles drop constraint if exists admin_roles_sections_check;
alter table public.admin_roles add constraint admin_roles_sections_check
  check (sections <@ array['productos','pedidos','vendedores','portada','recomendador','mudanzas','despacho','reparto']::text[]);

create or replace function public.admin_sections()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p.is_admin then array['productos','pedidos','vendedores','portada','recomendador','mudanzas','despacho','reparto','equipo']::text[]
      else coalesce(r.sections, '{}'::text[])
    end
    from public.profiles p
    left join public.admin_roles r on r.id = p.admin_role_id
    where p.id = auth.uid()
  ), '{}'::text[]);
$$;

-- -------------------------------------------------------------
-- Ajustes de reparto (una sola fila)
-- days: días de la semana con despacho (1 = lunes … 7 = domingo)
-- cutoff_hour: hora límite del día anterior para entrar al despacho
-- -------------------------------------------------------------
create table if not exists public.delivery_settings (
  id int primary key default 1 check (id = 1),
  days int[] not null default '{2,5}' check (days <@ array[1,2,3,4,5,6,7]),
  cutoff_hour int not null default 18 check (cutoff_hour between 0 and 23),
  start_time time not null default '09:00',
  end_time time not null default '19:00',
  midday_time time not null default '14:00',   -- separa la franja mañana / tarde
  service_minutes int not null default 12 check (service_minutes between 1 and 120),
  window_minutes int not null default 120 check (window_minutes between 30 and 480),
  depot_address text,
  depot_lat double precision,
  depot_lng double precision,
  balance_routes boolean not null default false, -- true: repartir el trabajo parejo entre camiones
  updated_at timestamptz not null default now()
);
insert into public.delivery_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists delivery_settings_touch on public.delivery_settings;
create trigger delivery_settings_touch
  before update on public.delivery_settings
  for each row execute function public.touch_updated_at();

alter table public.delivery_settings enable row level security;
drop policy if exists "ajustes reparto visibles" on public.delivery_settings;
create policy "ajustes reparto visibles" on public.delivery_settings for select using (true);
drop policy if exists "admin ajusta reparto" on public.delivery_settings;
create policy "admin ajusta reparto" on public.delivery_settings
  for all to authenticated using (public.can_admin('despacho')) with check (public.can_admin('despacho'));

-- -------------------------------------------------------------
-- Camiones
-- -------------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plate text,
  -- auto / camioneta / furgon / camion: define qué tamaño de producto cabe
  kind text not null default 'camion' check (kind in ('auto','camioneta','furgon','camion')),
  capacity_kg int not null default 1000 check (capacity_kg > 0),
  capacity_m3 numeric(6,2) not null default 8 check (capacity_m3 > 0),
  -- producto más grande que acepta (un sofá no cabe en un auto)
  max_item_size text not null default 'muy_grande' check (max_item_size in ('chico','mediano','grande','muy_grande')),
  -- costo por km (bencina/desgaste): el optimizador prefiere el vehículo más barato que sirva
  cost_per_km int not null default 250 check (cost_per_km >= 0),
  -- personas a bordo: los productos muy grandes necesitan 2
  crew int not null default 2 check (crew between 1 and 4),
  driver_id uuid references auth.users (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;
drop policy if exists "camiones visibles" on public.vehicles;
create policy "camiones visibles" on public.vehicles
  for select to authenticated using (public.can_admin('despacho') or public.can_admin('reparto'));
drop policy if exists "admin gestiona camiones" on public.vehicles;
create policy "admin gestiona camiones" on public.vehicles
  for all to authenticated using (public.can_admin('despacho')) with check (public.can_admin('despacho'));

-- -------------------------------------------------------------
-- Tamaño de cada producto (si no se indica, se estima por categoría)
-- -------------------------------------------------------------
alter table public.products
  add column if not exists size text check (size in ('chico','mediano','grande','muy_grande')),
  add column if not exists weight_kg numeric(6,1) check (weight_kg >= 0),
  add column if not exists volume_m3 numeric(6,3) check (volume_m3 >= 0);

-- -------------------------------------------------------------
-- Pedido: fecha de entrega, franja que eligió el comprador y ubicación
-- -------------------------------------------------------------
alter table public.orders
  add column if not exists delivery_date date,
  add column if not exists delivery_slot text not null default 'cualquiera'
    check (delivery_slot in ('manana','tarde','cualquiera')),
  add column if not exists address_notes text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geo_source text;
create index if not exists orders_delivery_date_idx on public.orders (delivery_date) where delivery = 'despacho';

-- -------------------------------------------------------------
-- Rutas y paradas
-- -------------------------------------------------------------
create table if not exists public.delivery_routes (
  id uuid primary key default gen_random_uuid(),
  delivery_date date not null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  driver_id uuid references auth.users (id) on delete set null,
  status text not null default 'borrador' check (status in ('borrador','publicada','en_curso','terminada')),
  color text not null default '#5b3fe0',
  planned_start timestamptz,
  planned_end timestamptz,
  planned_distance_m int not null default 0,
  planned_duration_s int not null default 0,
  load_kg numeric(8,1) not null default 0,
  load_m3 numeric(8,3) not null default 0,
  traffic_source text not null default 'estimado',
  started_at timestamptz,
  finished_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists delivery_routes_date_idx on public.delivery_routes (delivery_date);
create index if not exists delivery_routes_driver_idx on public.delivery_routes (driver_id, delivery_date);

create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.delivery_routes (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  seq int not null,
  eta timestamptz,
  window_start timestamptz,
  window_end timestamptz,
  leg_distance_m int not null default 0,
  status text not null default 'pendiente' check (status in ('pendiente','en_camino','entregado','fallido')),
  delivered_at timestamptz,
  received_by text,
  receiver_rut text,
  signature_path text,
  photo_path text,
  delivered_lat double precision,
  delivered_lng double precision,
  delivered_accuracy_m int,
  failure_reason text,
  receipt_code text not null default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  notified_window_at timestamptz,
  notified_onway_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists route_stops_route_idx on public.route_stops (route_id, seq);

alter table public.delivery_routes enable row level security;
alter table public.route_stops enable row level security;

-- Despacho ve todo; cada chofer ve sus rutas. Los cambios pasan por el servidor.
drop policy if exists "rutas visibles" on public.delivery_routes;
create policy "rutas visibles" on public.delivery_routes
  for select to authenticated using (
    public.can_admin('despacho') or (public.can_admin('reparto') and driver_id = auth.uid())
  );
drop policy if exists "admin gestiona rutas" on public.delivery_routes;
create policy "admin gestiona rutas" on public.delivery_routes
  for all to authenticated using (public.can_admin('despacho')) with check (public.can_admin('despacho'));

drop policy if exists "paradas visibles" on public.route_stops;
create policy "paradas visibles" on public.route_stops
  for select to authenticated using (
    exists (
      select 1 from public.delivery_routes r
       where r.id = route_id
         and (public.can_admin('despacho') or (public.can_admin('reparto') and r.driver_id = auth.uid()))
    )
  );
drop policy if exists "admin gestiona paradas" on public.route_stops;
create policy "admin gestiona paradas" on public.route_stops
  for all to authenticated using (public.can_admin('despacho')) with check (public.can_admin('despacho'));

-- Funciones auxiliares (security definer) para que las políticas de
-- pedidos y paradas no se llamen entre sí en un ciclo infinito.
create or replace function public.owns_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.orders o where o.id = p_order_id and o.user_id = auth.uid());
$$;

create or replace function public.order_in_my_route(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_admin('reparto') and exists (
    select 1 from public.route_stops s
      join public.delivery_routes r on r.id = s.route_id
     where s.order_id = p_order_id and r.driver_id = auth.uid()
  );
$$;
revoke execute on function public.owns_order(uuid) from public;
revoke execute on function public.order_in_my_route(uuid) from public;
grant execute on function public.owns_order(uuid) to authenticated;
grant execute on function public.order_in_my_route(uuid) to authenticated;

-- El comprador ve el estado de la entrega de sus pedidos
drop policy if exists "mi entrega" on public.route_stops;
create policy "mi entrega" on public.route_stops
  for select to authenticated using (public.owns_order(order_id));

-- Choferes y despacho ven los pedidos de sus rutas (dirección, teléfono)
drop policy if exists "pedidos de mis rutas" on public.orders;
create policy "pedidos de mis rutas" on public.orders
  for select to authenticated using (public.can_admin('despacho') or public.order_in_my_route(id));

-- -------------------------------------------------------------
-- Choferes: personas del equipo con la sección Reparto (o administradores)
-- -------------------------------------------------------------
create or replace function public.list_drivers()
returns table (id uuid, email text, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_admin('despacho') then
    raise exception 'No autorizado';
  end if;
  return query
    select p.id, lower(u.email)::text, coalesce(p.display_name, split_part(u.email, '@', 1))::text
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.admin_roles r on r.id = p.admin_role_id
     where p.is_admin or 'reparto' = any (coalesce(r.sections, '{}'::text[]))
     order by 3;
end;
$$;
revoke execute on function public.list_drivers() from public, anon;
grant execute on function public.list_drivers() to authenticated;

-- -------------------------------------------------------------
-- Fotos y firmas de entrega: bucket privado (se leen con enlaces firmados)
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('entregas', 'entregas', false)
on conflict (id) do nothing;

-- -------------------------------------------------------------
-- Avisos de entrega en la campana del comprador
-- -------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('match','entrega_fecha','entrega_camino','entrega_lista','entrega_fallida'));

notify pgrst, 'reload schema';
