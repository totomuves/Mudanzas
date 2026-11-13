-- =============================================================
-- Totomuves · Banners de la portada (se editan en /admin/portada)
-- =============================================================

create table public.home_banners (
  id uuid primary key default gen_random_uuid(),
  eyebrow text check (char_length(eyebrow) <= 40),          -- texto chico arriba, ej. "Recién llegado"
  title text not null check (char_length(title) between 2 and 90),
  subtitle text check (char_length(subtitle) <= 160),
  cta_label text not null default 'Ver todo' check (char_length(cta_label) between 1 and 30),
  href text not null default '/catalogo' check (href ~ '^(/|https://)'),
  image_url text,                                            -- foto opcional (bucket products, carpeta banners/)
  style text not null default 'suave' check (style in ('suave', 'marca', 'oscuro')),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index home_banners_orden on public.home_banners (active, sort_order);

create trigger home_banners_touch
  before update on public.home_banners
  for each row execute function public.touch_updated_at();

alter table public.home_banners enable row level security;

create policy "banners visibles" on public.home_banners
  for select using (active or public.is_admin());
create policy "admin gestiona banners" on public.home_banners
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Banner de ejemplo (edítalo o bórralo desde /admin/portada)
insert into public.home_banners (eyebrow, title, subtitle, cta_label, href, style, sort_order)
values (
  'Recién llegado',
  'Lo que otros dejan en su mudanza, tú lo estrenas',
  'Muebles, electro y tesoros a precios bajísimos.',
  'Ver catálogo',
  '/catalogo',
  'suave',
  0
);
