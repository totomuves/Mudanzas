-- =============================================================
-- Carrito: varios productos, un solo pago
-- El comprador junta productos en su carrito y paga todo de una vez
-- con Mercado Pago. Cada producto sigue siendo un pedido (orders),
-- pero todos quedan unidos por una "compra" (checkouts) que tiene
-- un solo pago, una sola dirección y un solo despacho.
--
-- Despacho: se cobra UNA vez por cada bodega que despacha.
--   Con el marketplace apagado todo sale de MUVEO: un solo despacho.
--   Si se mezclan productos de vendedores, cada vendedor despacha lo
--   suyo por separado y cada envío se cobra con el precio de la comuna.
--
-- Se puede correr más de una vez.
-- Requiere antes 20261116110000_reparto_vendedores.sql.
-- =============================================================

create table if not exists public.checkouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  amount int not null check (amount >= 0),             -- total cobrado (productos + despachos)
  shipping_amount int not null default 0 check (shipping_amount >= 0),
  items_count int not null default 0,
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  delivery text not null default 'retiro' check (delivery in ('retiro', 'despacho')),
  address text,
  comuna text,
  reserved_until timestamptz,
  mp_preference_id text,
  mp_payment_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists checkouts_user_idx on public.checkouts (user_id, created_at desc);

alter table public.orders
  add column if not exists checkout_id uuid references public.checkouts (id) on delete set null;

create index if not exists orders_checkout_idx on public.orders (checkout_id) where checkout_id is not null;

-- El comprador ve sus compras; se crean y cambian solo desde el servidor
alter table public.checkouts enable row level security;
drop policy if exists "ver mis compras" on public.checkouts;
create policy "ver mis compras" on public.checkouts
  for select to authenticated using (user_id = auth.uid() or public.can_admin('pedidos'));

-- -------------------------------------------------------------
-- Crea la compra y aparta todas las unidades 15 minutos (todo o nada).
-- p = { user_id, buyer_name, buyer_email, buyer_phone, delivery, address, comuna,
--       items: [{ product_id, quantity }] }
-- Devuelve { ok: true, checkout: {...} } o { ok: false, reason, product_id }.
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

  if v_delivery = 'despacho' then
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

-- -------------------------------------------------------------
-- Pago aprobado: la compra y todos sus pedidos quedan pagados
-- (descuenta stock de cada producto). Idempotente.
-- -------------------------------------------------------------
create or replace function public.mark_checkout_paid(p_checkout_id uuid, p_payment_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  update public.checkouts
     set status = 'paid', mp_payment_id = p_payment_id, paid_at = coalesce(paid_at, now())
   where id = p_checkout_id;

  for v_order in select id from public.orders where checkout_id = p_checkout_id and status <> 'paid' and status <> 'refunded' loop
    perform public.mark_order_paid(v_order.id, p_payment_id);
  end loop;
end;
$$;

revoke execute on function public.mark_checkout_paid(uuid, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
