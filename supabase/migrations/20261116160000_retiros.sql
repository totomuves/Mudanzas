-- =============================================================
-- RETIROS: ir a buscar lo que regalan los clientes
-- Se cargan las direcciones y el optimizador los suma a las rutas
-- (solos o mezclados con las entregas del día si conviene).
-- Va después de 20261116100000_rutas_despacho.sql.
-- =============================================================

create table if not exists public.pickups (
  id uuid primary key default gen_random_uuid(),
  -- Día del retiro (las solicitudes desde la web llegan sin día hasta que se aceptan)
  pickup_date date,
  slot text not null default 'cualquiera' check (slot in ('manana','tarde','cualquiera')),
  contact_name text not null check (char_length(contact_name) between 2 and 80),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 30),
  contact_email text check (contact_email is null or char_length(contact_email) <= 120),
  address text not null check (char_length(address) between 3 and 200),
  comuna text,
  address_notes text check (address_notes is null or char_length(address_notes) <= 200),
  -- Qué se retira (texto libre) y cuánto ocupa
  items text not null check (char_length(items) between 2 and 300),
  size text check (size is null or size in ('chico','mediano','grande','muy_grande')),
  volume_m3 numeric(6,3) check (volume_m3 is null or volume_m3 >= 0),
  weight_kg numeric(7,1) check (weight_kg is null or weight_kg >= 0),
  lat double precision,
  lng double precision,
  geo_source text,
  status text not null default 'pendiente'
    check (status in ('solicitado','rechazado','pendiente','retirado','fallido','cancelado')),
  picked_at timestamptz,
  -- Fotos de lo que se recibió (rutas en el bucket privado "entregas")
  photo_paths text[] not null default '{}',
  -- Texto que firmó con el dedo quien regala (acepta donar los productos)
  donation_terms text,
  -- Origen: el equipo lo anotó o la persona lo pidió en la web (con fotos)
  source text not null default 'equipo' check (source in ('equipo','web')),
  request_photos text[] not null default '{}',
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pickups_con_dia check (pickup_date is not null or status in ('solicitado','rechazado'))
);
create index if not exists pickups_date_idx on public.pickups (pickup_date, status);
create index if not exists pickups_status_idx on public.pickups (status, created_at desc);

alter table public.pickups enable row level security;
drop policy if exists "equipo gestiona retiros" on public.pickups;
create policy "equipo gestiona retiros" on public.pickups
  for all to authenticated
  using (public.can_admin('despacho') or public.can_admin('reparto'))
  with check (public.can_admin('despacho') or public.can_admin('reparto'));

-- Una parada es una entrega (order_id) o un retiro (pickup_id)
alter table public.route_stops alter column order_id drop not null;
alter table public.route_stops
  add column if not exists pickup_id uuid unique references public.pickups (id) on delete cascade;
alter table public.route_stops drop constraint if exists route_stops_una_cosa;
alter table public.route_stops add constraint route_stops_una_cosa
  check ((order_id is null) <> (pickup_id is null));

-- Ruta armada por el chofer solo con retiros
alter table public.delivery_routes
  add column if not exists pickups_only boolean not null default false;

notify pgrst, 'reload schema';
