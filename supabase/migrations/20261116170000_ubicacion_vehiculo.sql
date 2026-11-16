-- Ubicación en vivo del vehículo de cada ruta.
-- El celular del chofer la envía cada ~30 s mientras la ruta está en curso,
-- y también al iniciar, recalcular y registrar cada parada.
-- Va después de 20261116160000_retiros.sql.

alter table public.delivery_routes
  add column if not exists last_lat double precision,
  add column if not exists last_lng double precision,
  add column if not exists last_accuracy_m real,
  add column if not exists last_seen_at timestamptz;
