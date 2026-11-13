-- =============================================================
-- Totomuves · Servicio de mudanzas: tipos de servicio, precios,
-- agenda (bloques horarios) y reservas.
-- =============================================================

-- -------------------------------------------------------------
-- Tipos de servicio (lo que se muestra en "Precios")
-- -------------------------------------------------------------
create table public.service_types (
  slug text primary key,
  name text not null,
  emoji text not null default '🚚',
  description text not null default '',
  includes text[] not null default '{}',     -- viñetas de "qué incluye"
  base_price int not null check (base_price >= 0),  -- precio "desde", CLP
  crew_size int not null default 2,
  est_hours numeric(4,1) not null default 3,
  sort_order int not null default 0,
  active boolean not null default true
);

-- -------------------------------------------------------------
-- Configuración de precios y agenda (una sola fila, id = 1)
-- Se edita desde Supabase -> Table Editor -> moving_settings
-- -------------------------------------------------------------
create table public.moving_settings (
  id int primary key default 1 check (id = 1),
  -- Recargo por distancia entre origen y destino
  distance_prices jsonb not null default
    '{"misma_comuna": 0, "cerca": 15000, "media": 35000, "lejos": 70000, "regiones": 150000}',
  price_per_floor int not null default 8000,          -- por piso sin ascensor (desde el 2º)
  packing_pct int not null default 30,                -- embalaje: % del precio base
  heavy_item_price int not null default 25000,        -- por objeto pesado (piano, caja fuerte, etc.)
  weekend_surcharge_pct int not null default 15,      -- recargo sábado
  slot_times text[] not null default '{08:00,14:00}', -- bloques de inicio
  crews_per_slot int not null default 2,              -- cuántos equipos/camiones por bloque
  closed_weekdays int[] not null default '{0}',       -- 0 = domingo ... 6 = sábado
  min_notice_hours int not null default 24,
  booking_days_ahead int not null default 60,
  whatsapp text                                        -- número para contacto, ej. 56912345678
);

insert into public.moving_settings (id) values (1) on conflict do nothing;

-- Días sin atención (feriados, vacaciones)
create table public.blocked_dates (
  day date primary key,
  reason text
);

-- -------------------------------------------------------------
-- Reservas
-- -------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  service_slug text not null references public.service_types (slug),
  day date not null,
  slot_time text not null,
  origin_address text not null,
  origin_comuna text not null,
  origin_floor int not null default 1 check (origin_floor between 1 and 40),
  origin_elevator boolean not null default false,
  dest_address text not null,
  dest_comuna text not null,
  dest_floor int not null default 1 check (dest_floor between 1 and 40),
  dest_elevator boolean not null default false,
  distance text not null,
  packing boolean not null default false,
  heavy_items int not null default 0 check (heavy_items between 0 and 10),
  notes text,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  estimated_price int not null check (estimated_price >= 0),
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index bookings_day_idx on public.bookings (day, slot_time) where status in ('requested', 'confirmed');
create index bookings_user_idx on public.bookings (user_id, created_at desc);

-- -------------------------------------------------------------
-- Disponibilidad: cupos libres por día y bloque (no expone datos de otros)
-- -------------------------------------------------------------
create or replace function public.get_availability(p_from date, p_to date)
returns table (day date, slot_time text, remaining int)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from public.moving_settings where id = 1),
  days as (
    select d::date as day
    from generate_series(
      greatest(p_from, (now() at time zone 'America/Santiago')::date),
      least(p_to, (now() at time zone 'America/Santiago')::date + (select booking_days_ahead from s)),
      interval '1 day'
    ) d
  ),
  slots as (
    select days.day, t as slot_time
    from days, s, unnest(s.slot_times) t
    where extract(dow from days.day)::int <> all (s.closed_weekdays)
      and not exists (select 1 from public.blocked_dates b where b.day = days.day)
      and ((days.day + t::time) at time zone 'America/Santiago')
          > now() + make_interval(hours => (select min_notice_hours from s))
  )
  select slots.day, slots.slot_time,
         greatest(0, (select crews_per_slot from s) - count(b.id))::int as remaining
  from slots
  left join public.bookings b
    on b.day = slots.day and b.slot_time = slots.slot_time and b.status in ('requested', 'confirmed')
  group by slots.day, slots.slot_time
  order by slots.day, slots.slot_time;
$$;

grant execute on function public.get_availability(date, date) to anon, authenticated;

-- Crea una reserva solo si queda cupo (atómico). La usa el servidor.
create or replace function public.create_booking(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (p->>'day')::date;
  v_slot text := p->>'slot_time';
  v_free int;
  v_id uuid;
begin
  -- Evita que dos personas tomen el último cupo al mismo tiempo
  perform pg_advisory_xact_lock(hashtext(v_day::text || v_slot));

  select remaining into v_free
  from public.get_availability(v_day, v_day) a
  where a.slot_time = v_slot;

  if coalesce(v_free, 0) <= 0 then
    return null;
  end if;

  insert into public.bookings (
    user_id, service_slug, day, slot_time,
    origin_address, origin_comuna, origin_floor, origin_elevator,
    dest_address, dest_comuna, dest_floor, dest_elevator,
    distance, packing, heavy_items, notes,
    contact_name, contact_email, contact_phone, estimated_price
  ) values (
    nullif(p->>'user_id', '')::uuid, p->>'service_slug', v_day, v_slot,
    p->>'origin_address', p->>'origin_comuna', (p->>'origin_floor')::int, (p->>'origin_elevator')::boolean,
    p->>'dest_address', p->>'dest_comuna', (p->>'dest_floor')::int, (p->>'dest_elevator')::boolean,
    p->>'distance', (p->>'packing')::boolean, (p->>'heavy_items')::int, nullif(p->>'notes', ''),
    p->>'contact_name', p->>'contact_email', p->>'contact_phone', (p->>'estimated_price')::int
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_booking(jsonb) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Seguridad
-- -------------------------------------------------------------
alter table public.service_types enable row level security;
alter table public.moving_settings enable row level security;
alter table public.blocked_dates enable row level security;
alter table public.bookings enable row level security;

create policy "servicios visibles" on public.service_types
  for select using (active or public.is_admin());
create policy "admin gestiona servicios" on public.service_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "config visible" on public.moving_settings
  for select using (true);
create policy "admin edita config" on public.moving_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "dias bloqueados visibles" on public.blocked_dates
  for select using (true);
create policy "admin gestiona dias bloqueados" on public.blocked_dates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "ver mis reservas" on public.bookings
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admin edita reservas" on public.bookings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------
-- Servicios iniciales (ajusta precios y textos a cómo trabajan)
-- -------------------------------------------------------------
insert into public.service_types (slug, name, emoji, description, includes, base_price, crew_size, est_hours, sort_order) values
  ('flete', 'Flete chico', '🛻',
   'Para pocas cosas: un mueble, electrodomésticos o cajas.',
   '{"Camioneta","1 peoneta","Carga y descarga"}', 35000, 1, 2, 1),
  ('depto-chico', 'Depto 1–2 dormitorios', '🏢',
   'Mudanza completa de un departamento pequeño.',
   '{"Camión 3/4","2 peonetas","Protección de muebles","Desarme y armado básico"}', 120000, 2, 4, 2),
  ('casa-mediana', 'Casa o depto 3 dormitorios', '🏠',
   'La mudanza familiar más común.',
   '{"Camión grande","3 peonetas","Protección de muebles","Desarme y armado"}', 220000, 3, 6, 3),
  ('casa-grande', 'Casa grande 4+ dormitorios', '🏡',
   'Para casas grandes o con muchas cosas.',
   '{"Camión grande o 2 camiones","4 peonetas","Protección de muebles","Desarme y armado"}', 350000, 4, 8, 4),
  ('oficina', 'Oficina', '🏢',
   'Traslado de escritorios, equipos y archivos.',
   '{"Camión según volumen","Equipo a medida","Fuera de horario si se necesita"}', 180000, 3, 5, 5)
on conflict (slug) do nothing;
