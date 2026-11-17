-- =============================================================
-- Precio de despacho automático
-- El admin elige entre:
--   · fijo: el precio de cada comuna (tabla shipping_rates), como antes
--   · automatico: la app calcula el costo real del viaje con el gasto
--     del vehículo (bencina por km, peajes, chofer por hora), la
--     distancia y el tiempo desde la bodega, y le suma un % de ganancia.
--     Se elige el vehículo más barato que soporte el peso y volumen.
-- El cálculo se hace en el servidor y llega listo a place_order y
-- place_cart (que solo puede llamar el servidor).
-- Se puede correr más de una vez.
-- Requiere antes 20261116120000_carrito.sql.
-- =============================================================

-- -------------------------------------------------------------
-- Ajustes de precio (en los ajustes de reparto de MUVEO)
-- -------------------------------------------------------------
alter table public.delivery_settings
  add column if not exists pricing_mode text not null default 'fijo',
  add column if not exists margin_pct numeric(5,1) not null default 30,
  add column if not exists min_price int not null default 3990,
  add column if not exists max_km int not null default 60,
  add column if not exists round_to int not null default 500,
  -- Parte del viaje que paga cada pedido (los despachos comparten ruta): 100 = el viaje completo
  add column if not exists trip_share_pct int not null default 50;

alter table public.delivery_settings drop constraint if exists delivery_settings_pricing_mode_check;
alter table public.delivery_settings add constraint delivery_settings_pricing_mode_check
  check (pricing_mode in ('fijo', 'automatico'));
alter table public.delivery_settings drop constraint if exists delivery_settings_pricing_values_check;
alter table public.delivery_settings add constraint delivery_settings_pricing_values_check
  check (margin_pct between 0 and 500 and min_price >= 0 and max_km between 1 and 1000 and round_to between 1 and 10000
         and trip_share_pct between 10 and 100);

-- -------------------------------------------------------------
-- Gasto de cada vehículo
-- cost_per_km (ya existía) = bencina y desgaste por km
-- -------------------------------------------------------------
alter table public.vehicles
  add column if not exists toll_per_trip int not null default 0 check (toll_per_trip >= 0),
  add column if not exists hourly_cost int not null default 0 check (hourly_cost >= 0);

-- -------------------------------------------------------------
-- Pedido de un producto: acepta el precio de despacho calculado
-- p.shipping_price (opcional): si viene, se usa en vez del precio de la comuna
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
  if v_delivery = 'despacho' then
    if coalesce(jsonb_typeof(p->'shipping_price') = 'number', false) then
      -- Precio automático (calculado en el servidor)
      v_shipping := greatest(0, (p->>'shipping_price')::numeric)::int;
    else
      -- Precio fijo: la comuna debe tener precio activo
      select r.price into v_shipping from public.shipping_rates r
       where r.comuna = v_comuna and r.active;
      if v_shipping is null then
        return null;
      end if;
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

-- -------------------------------------------------------------
-- Carrito: acepta el precio calculado de cada entrega
-- p.shipping_by_group (opcional): { "muveo": 5990, "<id vendedor>": 4500 }
-- Si viene, cada bodega cobra su propio precio; si no, el de la comuna.
-- -------------------------------------------------------------
create or replace function public.place_cart(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery text := case when p->>'delivery' = 'despacho' then 'despacho' else 'retiro' end;
  v_comuna text := nullif(trim(p->>'comuna'), '');
  v_auto boolean := coalesce(jsonb_typeof(p->'shipping_by_group') = 'object', false);
  v_rate int := 0;
  v_item record;
  v_product public.products;
  v_checkout public.checkouts;
  v_amount int;
  v_pct numeric;
  v_ship int;
  v_total int := 0;
  v_shipping_total int := 0;
  v_count int := 0;
  v_groups uuid[] := '{}';
  v_muveo_charged boolean := false;
  v_until timestamptz := now() + interval '15 minutes';
begin
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;
  if jsonb_array_length(p->'items') > 30 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  if v_delivery = 'despacho' and not v_auto then
    select r.price into v_rate from public.shipping_rates r where r.comuna = v_comuna and r.active;
    if v_rate is null then
      return jsonb_build_object('ok', false, 'reason', 'comuna');
    end if;
  end if;

  -- 1) Revisa y bloquea TODOS los productos antes de crear nada
  --    (en orden fijo para que dos carritos no se traben entre sí)
  for v_item in
    select (i->>'product_id')::uuid as product_id,
           sum(greatest(1, least(50, coalesce((i->>'quantity')::int, 1))))::int as qty
      from jsonb_array_elements(p->'items') i
     group by 1
     order by 1
  loop
    select * into v_product from public.products where id = v_item.product_id for update;
    if v_product.id is null or v_product.status <> 'available'
       or v_product.quantity - public.held_units(v_product.id) < v_item.qty
       or (v_product.seller_id is not null and not public.seller_is_active(v_product.seller_id)) then
      return jsonb_build_object('ok', false, 'reason', 'unavailable', 'product_id', v_item.product_id);
    end if;
    -- Precio automático: cada bodega del carrito debe traer su precio
    if v_delivery = 'despacho' and v_auto
       and coalesce(jsonb_typeof(p->'shipping_by_group'->coalesce(v_product.seller_id::text, 'muveo')), '') <> 'number' then
      return jsonb_build_object('ok', false, 'reason', 'comuna');
    end if;
  end loop;

  -- 2) Crea la compra
  insert into public.checkouts (
    user_id, amount, buyer_name, buyer_email, buyer_phone, delivery, address, comuna, reserved_until
  ) values (
    nullif(p->>'user_id', '')::uuid, 0,
    p->>'buyer_name', p->>'buyer_email', nullif(p->>'buyer_phone', ''),
    v_delivery,
    case when v_delivery = 'despacho' then nullif(p->>'address', '') end,
    case when v_delivery = 'despacho' then v_comuna end,
    v_until
  )
  returning * into v_checkout;

  -- 3) Un pedido por producto. El despacho se cobra en el primer pedido de cada bodega.
  for v_item in
    select (i->>'product_id')::uuid as product_id,
           sum(greatest(1, least(50, coalesce((i->>'quantity')::int, 1))))::int as qty
      from jsonb_array_elements(p->'items') i
     group by 1
     order by 1
  loop
    select * into v_product from public.products where id = v_item.product_id;
    v_amount := public.current_price(v_product) * v_item.qty;
    v_ship := 0;
    v_pct := null;

    if v_delivery = 'despacho' then
      if v_auto then
        v_rate := greatest(0, (p->'shipping_by_group'->>coalesce(v_product.seller_id::text, 'muveo'))::numeric)::int;
      end if;
      if v_product.seller_id is null then
        if not v_muveo_charged then
          v_ship := v_rate;
          v_muveo_charged := true;
        end if;
      elsif not (v_product.seller_id = any (v_groups)) then
        v_ship := v_rate;
        v_groups := v_groups || v_product.seller_id;
      end if;
    end if;

    if v_product.seller_id is not null then
      select coalesce(s.commission_pct, m.commission_pct, 10) into v_pct
        from public.sellers s
        left join public.marketplace_settings m on m.id = 1
       where s.id = v_product.seller_id;
    end if;

    insert into public.orders (
      user_id, product_id, quantity, amount, reserved_until,
      buyer_name, buyer_email, buyer_phone, delivery, address,
      comuna, shipping_amount, seller_id, commission_amount, checkout_id
    ) values (
      v_checkout.user_id, v_product.id, v_item.qty, v_amount + v_ship, v_until,
      v_checkout.buyer_name, v_checkout.buyer_email, v_checkout.buyer_phone,
      v_delivery, v_checkout.address, v_checkout.comuna, v_ship,
      v_product.seller_id,
      case when v_product.seller_id is null then null else round(v_amount * v_pct / 100.0)::int end,
      v_checkout.id
    );

    v_total := v_total + v_amount + v_ship;
    v_shipping_total := v_shipping_total + v_ship;
    v_count := v_count + v_item.qty;
  end loop;

  update public.checkouts
     set amount = v_total, shipping_amount = v_shipping_total, items_count = v_count
   where id = v_checkout.id
  returning * into v_checkout;

  return jsonb_build_object('ok', true, 'checkout', to_jsonb(v_checkout));
end;
$$;

revoke execute on function public.place_cart(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
