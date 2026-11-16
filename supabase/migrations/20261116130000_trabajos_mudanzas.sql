-- Trabajos realizados (galería de la página /mudanzas/conocenos)
-- Las fotos se suben desde /admin/mudanzas/trabajos al bucket "products", carpeta trabajos/.
-- Correr a mano en Supabase > SQL Editor. Se puede correr más de una vez.

create table if not exists public.moving_works (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  title text,                         -- ej: "Departamento 2D, Ñuñoa a Providencia"
  caption text,                       -- detalle corto opcional
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.moving_works enable row level security;

drop policy if exists "trabajos visibles" on public.moving_works;
create policy "trabajos visibles" on public.moving_works
  for select using (active or public.can_admin('mudanzas'));

drop policy if exists "admin gestiona trabajos" on public.moving_works;
create policy "admin gestiona trabajos" on public.moving_works
  for all to authenticated
  using (public.can_admin('mudanzas')) with check (public.can_admin('mudanzas'));

-- Quien tiene la sección "Agenda mudanzas" puede subir y borrar fotos en trabajos/
drop policy if exists "mudanzas sube fotos de trabajos" on storage.objects;
create policy "mudanzas sube fotos de trabajos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'products' and name like 'trabajos/%' and public.can_admin('mudanzas'));

drop policy if exists "mudanzas borra fotos de trabajos" on storage.objects;
create policy "mudanzas borra fotos de trabajos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'products' and name like 'trabajos/%' and public.can_admin('mudanzas'));
