-- Admin de mudanzas: el equipo puede crear mudanzas a mano y editarlas
-- (además de editar servicios y ajustes desde /admin/mudanzas, sin entrar a Supabase).
-- Correr a mano en Supabase > SQL Editor. Se puede correr más de una vez.

-- De dónde vino la mudanza: la web (cotizador) o el admin (a mano)
alter table public.bookings add column if not exists source text not null default 'web';
alter table public.bookings drop constraint if exists bookings_source_check;
alter table public.bookings add constraint bookings_source_check check (source in ('web', 'admin'));
alter table public.bookings add column if not exists created_by uuid references auth.users (id) on delete set null;

-- Una mudanza tomada por teléfono puede no tener correo
alter table public.bookings alter column contact_email drop not null;

-- Quien tiene la sección "Agenda mudanzas" puede crear mudanzas
drop policy if exists "admin crea reservas" on public.bookings;
create policy "admin crea reservas" on public.bookings
  for insert to authenticated with check (public.can_admin('mudanzas'));
