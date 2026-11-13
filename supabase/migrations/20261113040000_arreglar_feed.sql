-- =============================================================
-- Totomuves · Arregla el feed de Descubrir
-- La migración de stock agregó la columna "quantity" a productos y
-- get_feed devolvía la lista de columnas antigua ("No pudimos cargar
-- productos"). Ahora devuelve la fila completa, así no se rompe
-- cuando se agreguen columnas en el futuro.
-- Además: no muestra productos sin unidades disponibles.
-- =============================================================

create or replace function public.get_feed(p_limit int default 20)
returns setof public.products
language sql
volatile
security invoker
set search_path = ''
as $$
  select pr.*
  from public.products pr
  left join public.user_categories uc
    on uc.user_id = auth.uid() and uc.category_slug = pr.category_slug
  left join public.profiles me on me.id = auth.uid()
  where pr.status = 'available'
    and public.available_units(pr) > 0
    and not exists (
      select 1 from public.swipes s
      where s.user_id = auth.uid() and s.product_id = pr.id
    )
  order by
    -- 1) afinidad con la categoría (lo que más pesa)
    coalesce(uc.weight, 0)
    -- 2) bonus si la eligió en el onboarding
    + case when uc.selected then 3 else 0 end
    -- 3) ¿cabe en su presupuesto?
    + case
        when me.budget_max is null then 0
        when public.current_price(pr) <= me.budget_max then 1
        else -2
      end
    -- 4) misma comuna = más fácil de retirar (si eligió "todas", no influye)
    + case when me.comuna is not null and pr.comuna = me.comuna then 0.8 else 0 end
    -- 5) oferta relámpago activa
    + case when pr.flash_until > now() and pr.flash_price is not null then 1.5 else 0 end
    -- 6) novedad: los recién subidos suben en el ranking
    + 2 * exp(-extract(epoch from (now() - pr.created_at)) / 86400.0 / 7)
    -- 7) exploración: un poco de azar para descubrir cosas nuevas
    + random() * 1.5
    desc
  limit greatest(1, least(p_limit, 50));
$$;

-- Que la API (PostgREST) vea los cambios de inmediato
notify pgrst, 'reload schema';
