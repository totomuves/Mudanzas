-- =============================================================
-- Despacho por comuna
-- El admin define el precio de despacho de cada comuna.
-- El checkout lo suma al total; si una comuna no tiene precio
-- (o está pausada), no se puede despachar ahí.
-- Se puede correr más de una vez.
-- Requiere antes 20261114130000_roles_equipo.sql (roles del equipo).
-- =============================================================

-- -------------------------------------------------------------
-- Roles del equipo: "despacho" pasa a ser una sección asignable
-- -------------------------------------------------------------
alter table public.admin_roles drop constraint if exists admin_roles_sections_check;
alter table public.admin_roles add constraint admin_roles_sections_check
  check (sections <@ array['productos','pedidos','vendedores','portada','recomendador','mudanzas','despacho']::text[]);

create or replace function public.admin_sections()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p.is_admin then array['productos','pedidos','vendedores','portada','recomendador','mudanzas','despacho','equipo']::text[]
      else coalesce(r.sections, '{}'::text[])
    end
    from public.profiles p
    left join public.admin_roles r on r.id = p.admin_role_id
    where p.id = auth.uid()
  ), '{}'::text[]);
$$;

create table if not exists public.shipping_rates (
  comuna text primary key,
  price int not null check (price >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

drop trigger if exists shipping_rates_touch on public.shipping_rates;
create trigger shipping_rates_touch
  before update on public.shipping_rates
  for each row execute function public.touch_updated_at();

alter table public.shipping_rates enable row level security;

drop policy if exists "despacho visible" on public.shipping_rates;
create policy "despacho visible" on public.shipping_rates
  for select using (active or public.can_admin('despacho'));

drop policy if exists "admin gestiona despacho" on public.shipping_rates;
create policy "admin gestiona despacho" on public.shipping_rates
  for all to authenticated using (public.can_admin('despacho')) with check (public.can_admin('despacho'));

-- El pedido guarda la comuna y cuánto se cobró por el despacho
alter table public.orders
  add column if not exists comuna text,
  add column if not exists shipping_amount int not null default 0 check (shipping_amount >= 0);

-- -------------------------------------------------------------
-- Pedido: suma el despacho según la comuna (reemplaza la versión de vendedores)
-- La comisión se calcula solo sobre los productos, no sobre el despacho.
-- -------------------------------------------------------------
create or replace function public.place_order(p jsonb)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_qty int := greatest(1, least(50, coalesce((p->>'quantity')::int, 1)));
  v_order public.orders;
  v_amount int;
  v_pct numeric;
  v_delivery text := case when p->>'delivery' = 'despacho' then 'despacho' else 'retiro' end;
  v_comuna text := nullif(trim(p->>'comuna'), '');
  v_shipping int := 0;
begin
  -- Despacho: la comuna debe tener precio activo
  if v_delivery = 'despacho' then
    select r.price into v_shipping from public.shipping_rates r
     where r.comuna = v_comuna and r.active;
    if v_shipping is null then
      return null;
    end if;
  end if;

  -- Bloquea la fila para que dos compras no tomen la misma unidad
  select * into v_product from public.products
   where id = (p->>'product_id')::uuid
   for update;

  if v_product.id is null or v_product.status <> 'available'
     or v_product.quantity - public.held_units(v_product.id) < v_qty then
    return null;
  end if;

  -- Productos de vendedores suspendidos o no aprobados no se venden
  if v_product.seller_id is not null and not public.seller_is_active(v_product.seller_id) then
    return null;
  end if;

  v_amount := public.current_price(v_product) * v_qty;

  if v_product.seller_id is not null then
    select coalesce(s.commission_pct, m.commission_pct, 10) into v_pct
      from public.sellers s
      left join public.marketplace_settings m on m.id = 1
     where s.id = v_product.seller_id;
  end if;

  insert into public.orders (
    user_id, product_id, quantity, amount, reserved_until,
    buyer_name, buyer_email, buyer_phone, delivery, address,
    comuna, shipping_amount,
    seller_id, commission_amount
  ) values (
    nullif(p->>'user_id', '')::uuid, v_product.id, v_qty, v_amount + v_shipping,
    now() + interval '15 minutes',
    p->>'buyer_name', p->>'buyer_email', nullif(p->>'buyer_phone', ''),
    v_delivery, case when v_delivery = 'despacho' then nullif(p->>'address', '') end,
    case when v_delivery = 'despacho' then v_comuna end, v_shipping,
    v_product.seller_id,
    case when v_product.seller_id is null then null else round(v_amount * v_pct / 100.0)::int end
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.place_order(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
