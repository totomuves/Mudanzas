-- =============================================================
-- MUVEO · Banners y fotos en las páginas Mudanzas y Conócenos
-- Correr a mano en Supabase > SQL Editor. Se puede correr más de una vez.
--
-- 1. Los banners (tabla home_banners) ahora tienen página: portada,
--    mudanzas o conocenos, y en las páginas van arriba o abajo.
-- 2. Nuevo estilo "plano": un color plano que se elige en el admin.
-- 3. El botón del banner pasa a ser opcional.
-- 4. Las fotos de la galería (moving_works) ahora también pueden ir
--    en la página Mudanzas.
-- =============================================================

-- 1. Página y lugar dentro de la página
alter table public.home_banners
  add column if not exists page text not null default 'portada';
alter table public.home_banners drop constraint if exists home_banners_page_check;
alter table public.home_banners
  add constraint home_banners_page_check check (page in ('portada', 'mudanzas', 'conocenos'));

alter table public.home_banners
  add column if not exists placement text not null default 'arriba';
alter table public.home_banners drop constraint if exists home_banners_placement_check;
alter table public.home_banners
  add constraint home_banners_placement_check check (placement in ('arriba', 'abajo'));

drop index if exists public.home_banners_orden;
create index if not exists home_banners_pagina_orden on public.home_banners (page, active, sort_order);

-- 2. Color plano
alter table public.home_banners
  add column if not exists bg_color text;
alter table public.home_banners drop constraint if exists home_banners_bg_color_check;
alter table public.home_banners
  add constraint home_banners_bg_color_check check (bg_color is null or bg_color ~ '^#[0-9a-fA-F]{6}$');

alter table public.home_banners drop constraint if exists home_banners_style_check;
alter table public.home_banners
  add constraint home_banners_style_check
  check (style in ('aurora', 'laguna', 'pastel', 'plano', 'suave', 'marca', 'oscuro'));

-- 3. Botón opcional (sin texto de botón, el banner no lleva botón)
alter table public.home_banners alter column cta_label drop not null;
alter table public.home_banners alter column href drop not null;

-- Permisos: Portada edita todos los banners; Agenda mudanzas edita los de Mudanzas y Conócenos
drop policy if exists "banners visibles" on public.home_banners;
create policy "banners visibles" on public.home_banners
  for select using (
    active or public.can_admin('portada') or (page <> 'portada' and public.can_admin('mudanzas'))
  );
drop policy if exists "admin gestiona banners" on public.home_banners;
create policy "admin gestiona banners" on public.home_banners
  for all to authenticated
  using (public.can_admin('portada') or (page <> 'portada' and public.can_admin('mudanzas')))
  with check (public.can_admin('portada') or (page <> 'portada' and public.can_admin('mudanzas')));

-- Fotos de banners (carpeta banners/ del bucket products): antes solo podía subirlas
-- quien tenía la sección Productos. Ahora también Portada y Agenda mudanzas.
drop policy if exists "banners sube fotos" on storage.objects;
create policy "banners sube fotos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'products' and name like 'banners/%' and (public.can_admin('portada') or public.can_admin('mudanzas')));
drop policy if exists "banners borra fotos" on storage.objects;
create policy "banners borra fotos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'products' and name like 'banners/%' and (public.can_admin('portada') or public.can_admin('mudanzas')));

-- 4. Galería de fotos también en la página Mudanzas
-- (si aún no se corrió 20261116130000_trabajos_mudanzas.sql, córrela primero)
alter table public.moving_works
  add column if not exists page text not null default 'conocenos';
alter table public.moving_works drop constraint if exists moving_works_page_check;
alter table public.moving_works
  add constraint moving_works_page_check check (page in ('conocenos', 'mudanzas'));
