-- =============================================================
-- Totomuves · Interruptor del marketplace
-- Mientras está APAGADO (por defecto) solo vende Totomuves:
--   - no se ven ni se pueden comprar productos de otros vendedores,
--   - los vendedores no pueden subir ni editar productos,
--   - la app oculta /vender y el panel de vendedor.
-- Se enciende o apaga en Admin -> Vendedores, sin tocar código.
-- Requiere haber corrido antes 20261114000000_vendedores.sql.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================

alter table public.marketplace_settings
  add column if not exists marketplace_enabled boolean not null default false;

-- ¿Está activo el marketplace?
create or replace function public.marketplace_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select m.marketplace_enabled from public.marketplace_settings m where m.id = 1), false);
$$;

grant execute on function public.marketplace_enabled() to anon, authenticated;

-- Un vendedor solo está "activo" si está aprobado Y el marketplace está encendido.
-- Esto oculta sus productos al público y bloquea su compra (place_order lo revisa).
create or replace function public.seller_is_active(p_seller_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.marketplace_enabled()
     and exists (select 1 from public.sellers s where s.id = p_seller_id and s.status = 'approved');
$$;

-- Con el marketplace apagado nadie actúa como vendedor (no sube, edita ni ve pedidos)
create or replace function public.my_seller_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.sellers s
  where s.owner_id = auth.uid() and s.status = 'approved' and public.marketplace_enabled()
  limit 1;
$$;

notify pgrst, 'reload schema';
