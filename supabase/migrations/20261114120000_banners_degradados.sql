-- =============================================================
-- MÜVEO · Banners de la portada con degradados del logo
-- Agrega los estilos aurora (morado→rosado), laguna (turquesa→morado)
-- y pastel, deja aurora como estilo por defecto y agrega la opción
-- de foto en medio banner o banner completo.
-- =============================================================

alter table public.home_banners drop constraint if exists home_banners_style_check;
alter table public.home_banners
  add constraint home_banners_style_check
  check (style in ('aurora', 'laguna', 'pastel', 'suave', 'marca', 'oscuro'));
alter table public.home_banners alter column style set default 'aurora';

-- Los banners que seguían con el estilo inicial pasan al degradado
update public.home_banners set style = 'aurora' where style = 'suave';

-- Con foto: 'media' (foto a un lado) o 'completa' (foto de fondo con el texto encima)
alter table public.home_banners
  add column if not exists image_layout text not null default 'media'
  check (image_layout in ('media', 'completa'));
