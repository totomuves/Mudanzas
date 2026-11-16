-- =============================================================
-- MUVEO · Interruptor del aviso de cookies (Ley 21.719)
-- Correr a mano en Supabase > SQL Editor. Se puede correr más de una vez.
--
-- APAGADO (por defecto): Google, Meta y TikTok miden a todos, sin aviso.
-- ENCENDIDO: aparece el aviso "Aceptar / Rechazar" y solo se mide a
-- quien acepta. Se cambia en Admin -> Portada, sin tocar código.
-- =============================================================

create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  cookie_consent_required boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

alter table public.site_settings enable row level security;

-- Cualquiera puede leerla (la web la necesita para saber si mostrar el aviso).
-- Solo se modifica desde el admin con la clave de servicio.
drop policy if exists "site_settings lectura publica" on public.site_settings;
create policy "site_settings lectura publica" on public.site_settings
  for select to anon, authenticated using (true);

grant select on public.site_settings to anon, authenticated;

notify pgrst, 'reload schema';
