-- =============================================================
-- MUVEO · Recargos de despacho y accesorios de vehículos (18 nov 2026)
-- Va después de 20261117100000_despacho_automatico.sql
--
--  · Productos frágiles: recargo fijo por unidad.
--  · Lujo u obra de arte: recargo de manejo + % del valor del producto.
--  · Peajes por la ruta: km por autopistas con TAG × valor por km
--    (el camión paga más), además de los peajes fijos de cada vehículo.
--  · Accesorios de vehículos (porta bicicleta, parrilla, rampa…) y lo que
--    pide cada producto: solo se sugieren vehículos que los tengan.
-- Se puede correr más de una vez.
-- =============================================================

-- Ajustes de precio (solo MUVEO; los vendedores usan los mismos)
alter table public.delivery_settings
  add column if not exists fragile_fee int not null default 3000 check (fragile_fee between 0 and 1000000),
  add column if not exists luxury_fee int not null default 10000 check (luxury_fee between 0 and 1000000),
  add column if not exists luxury_pct numeric(5,2) not null default 2 check (luxury_pct between 0 and 50),
  add column if not exists toll_per_km int not null default 120 check (toll_per_km between 0 and 5000),
  add column if not exists truck_toll_factor numeric(4,2) not null default 2 check (truck_toll_factor between 1 and 5);

-- Productos: manejo especial y accesorios que necesita
alter table public.products
  add column if not exists fragile boolean not null default false,
  add column if not exists high_value boolean not null default false,
  add column if not exists needs_accessories text[] not null default '{}';

comment on column public.products.fragile is 'Frágil: se cobra el recargo de frágil por unidad';
comment on column public.products.high_value is 'Lujo u obra de arte: recargo de manejo + % del valor';
comment on column public.products.needs_accessories is 'Accesorios que necesita el vehículo (porta_bicicleta, parrilla, rampa…)';

-- Vehículos: accesorios (claves conocidas o textos propios)
alter table public.vehicles
  add column if not exists accessories text[] not null default '{}';

comment on column public.vehicles.accessories is 'Accesorios del vehículo: porta_bicicleta, parrilla, rampa, plataforma, carro_arrastre, mantas, carro_carga, carga_cerrada o textos propios';

notify pgrst, 'reload schema';
