-- =============================================================
-- MÜVEO · Frases del título (portada y una lista por categoría)
-- Se editan en /admin/portada. category_slug null = portada.
-- =============================================================

create table if not exists public.site_phrases (
  id uuid primary key default gen_random_uuid(),
  category_slug text references public.categories (slug) on delete cascade,
  text text not null check (char_length(text) between 2 and 120),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists site_phrases_categoria on public.site_phrases (category_slug, active);

alter table public.site_phrases enable row level security;

drop policy if exists "frases visibles" on public.site_phrases;
create policy "frases visibles" on public.site_phrases
  for select using (active or public.is_admin());
drop policy if exists "admin gestiona frases" on public.site_phrases;
create policy "admin gestiona frases" on public.site_phrases
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Frases de partida (solo si la tabla está vacía; las categorías que no existan se saltan)
insert into public.site_phrases (category_slug, text, sort_order)
select v.category_slug, v.text, v.sort_order
from (values
  (null, 'Tu próximo regalón te está esperando.', 0),
  (null, 'Cosas lindas, precios que no duelen.', 1),
  (null, 'Desliza, enamórate, llévatelo.', 2),
  (null, 'Estrena sin pagar precio de estreno.', 3),
  (null, 'El sofá de tus sueños está a un swipe.', 4),
  (null, 'Cachureo fino a precio de risa.', 5),
  (null, 'Lo bueno vuela: cada pieza es única.', 6),
  (null, 'Hoy es buen día para darse un gustito.', 7),
  ('muebles', 'Ese rincón vacío ya tiene dueño.', 0),
  ('muebles', 'Siéntate, que esto se pone cómodo.', 1),
  ('muebles', 'Muebles con carácter, precios con cariño.', 2),
  ('cocina', 'Tu cocina está pidiendo un upgrade.', 0),
  ('cocina', 'El chef que llevas dentro lo agradece.', 1),
  ('cocina', 'Para cocinar rico sin gastar de más.', 2),
  ('electro', 'Enchúfalo y a disfrutar.', 0),
  ('electro', 'Más watts, menos lucas.', 1),
  ('electro', 'Electro que funciona, precios que encantan.', 2),
  ('tecnologia', 'Lo último en tech, a precio de lo penúltimo.', 0),
  ('tecnologia', 'Pantallas, gadgets y otros vicios sanos.', 1),
  ('tecnologia', 'Tecnología al día sin vaciar la billetera.', 2),
  ('dormitorio', 'Para dormir como guagua.', 0),
  ('dormitorio', 'Tu pieza merece un cariñito.', 1),
  ('dormitorio', 'Sueños grandes, precios chicos.', 2),
  ('deco', 'Ese detalle que le faltaba a tu casa.', 0),
  ('deco', 'Pequeños tesoros, gran efecto.', 1),
  ('deco', 'Decora con estilo, paga con calma.', 2),
  ('ninos', 'Crecen rápido: ahorra más rápido.', 0),
  ('ninos', 'Para los regalones de la casa.', 1),
  ('ninos', 'Juguetes y cosas de guagua casi nuevas.', 2),
  ('deporte', 'La excusa perfecta para salir a pedalear.', 0),
  ('deporte', 'Equípate para la próxima aventura.', 1),
  ('deporte', 'Muévete sin gastar una fortuna.', 2),
  ('libros', 'Historias buscando un nuevo lector.', 0),
  ('libros', 'Música y libros con alma.', 1),
  ('libros', 'Para leer, escuchar y volver a empezar.', 2),
  ('herramientas', 'Para los maestros chasquilla.', 0),
  ('herramientas', 'Arréglalo tú mismo, ahorra tú mismo.', 1),
  ('herramientas', 'La herramienta que te faltaba, a precio justo.', 2),
  ('ropa', 'Renueva tu clóset sin culpa.', 0),
  ('ropa', 'Estilo único, como cada prenda.', 1),
  ('ropa', 'Moda con historia y buen precio.', 2),
  ('mascotas', 'Para los peludos de la casa.', 0),
  ('mascotas', 'Tu mascota también merece un gustito.', 1),
  ('mascotas', 'Camas, juguetes y mimos a buen precio.', 2)
) as v (category_slug, text, sort_order)
where (v.category_slug is null or exists (select 1 from public.categories c where c.slug = v.category_slug))
  and not exists (select 1 from public.site_phrases);

-- El banner de ejemplo hablaba de mudanzas: se cambia por un texto para compradores
update public.home_banners
set title = 'Tesoros únicos a precios bajísimos'
where title = 'Lo que otros dejan en su mudanza, tú lo estrenas';
