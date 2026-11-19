-- =============================================================
-- CRÉDITOS EN UNIDADES (precio en créditos)
-- Los créditos dejan de ser pesos: se dan en "créditos" y cada
-- producto de la tienda muestra su precio en créditos. Cuánto vale
-- un crédito en pesos es un ajuste oculto (credit_settings.credit_value)
-- que solo ve el equipo.
--
--   precio en créditos de un producto = redondeo hacia arriba (precio / valor)
--   El despacho se sigue pagando en pesos.
--
-- Los créditos que ya existían (en pesos) se pasan a unidades una sola vez.
-- Se puede correr más de una vez.
-- Requiere antes 20261118110000_creditos_retiros.sql.
-- =============================================================

alter table public.credit_settings
  add column if not exists credit_value int not null default 1000,
  add column if not exists units_migrated boolean not null default false;
alter table public.credit_settings drop constraint if exists credit_settings_value_check;
alter table public.credit_settings add constraint credit_settings_value_check
  check (credit_value between 1 and 1000000);

-- store_credits.amount y store_credit_uses.amount pasan a ser créditos.
-- checkouts.credit_amount y orders.credit_amount siguen en pesos (lo descontado).
alter table public.checkouts
  add column if not exists credits_used int not null default 0 check (credits_used >= 0);

-- Paso único: lo que estaba en pesos se convierte a créditos con el valor actual
do $$
declare
  v_value int;
begin
  if exists (select 1 from public.credit_settings where id = 1 and not units_migrated) then
    select credit_value into v_value from public.credit_settings where id = 1;
    update public.store_credits set amount = greatest(1, round(amount::numeric / v_value)::int);
    update public.store_credit_uses set amount = greatest(1, ceil(amount::numeric / v_value)::int);
    update public.checkouts c set credits_used = u.amount
      from public.store_credit_uses u where u.checkout_id = c.id;
    update public.credit_settings set units_migrated = true where id = 1;
  end if;
end $$;

-- Precio de un producto en créditos (por unidad)
create or replace function public.credit_price(p_price int, p_value int)
returns int
language sql
immutable
set search_path = ''
as $$
  select greatest(1, ceil(p_price::numeric / greatest(1, p_value))::int);
$$;

-- -------------------------------------------------------------
-- Carrito con créditos en unidades.
-- Cada producto de la tienda cuesta credit_price × cantidad créditos.
-- Si alcanza, queda pagado entero; si no, los créditos que quedan pagan
-- la parte proporcional del producto y el resto se paga en pesos.
-- Los créditos nunca pagan el despacho.
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
  v_code text := upper(regexp_replace(coalesce(p->>'credit_code', ''), '[^A-Za-z0-9]', '', 'g'));
  v_value int := 1000;
  v_credit public.store_credits;
  v_credit_left int := 0;   -- créditos
  v_credits_spent int := 0; -- créditos
  v_credit_used int := 0;   -- pesos descontados
  v_cost int;
  v_disc int;
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

  -- Créditos: válidos, activos, con saldo, y solo con despacho
  if v_code <> '' then
    if not coalesce((select enabled from public.credit_settings where id = 1), false) then
      return jsonb_build_object('ok', false, 'reason', 'credit_off');
    end if;
    select coalesce(credit_value, 1000) into v_value from public.credit_settings where id = 1;
    if v_delivery <> 'despacho' then
      return jsonb_build_object('ok', false, 'reason', 'credit_needs_shipping');
    end if;
    -- Bloquea el crédito: dos compras no pueden gastar el mismo saldo
    select * into v_credit from public.store_credits where code = v_code for update;
    if v_credit.id is null or v_credit.status <> 'activo' or v_credit.expires_at <= now() then
      return jsonb_build_object('ok', false, 'reason', 'credit_invalid');
    end if;
    v_credit_left := greatest(0, v_credit.amount - public.credit_used(v_credit.id));
    if v_credit_left = 0 then
      return jsonb_build_object('ok', false, 'reason', 'credit_empty');
    end if;
  end if;

  if v_delivery = 'despacho' and not v_auto then
    select r.price into v_rate from public.shipping_rates r where r.comuna = v_comuna and r.active;
    if v_rate is null then
      return jsonb_build_object('ok', false, 'reason', 'comuna');
    end if;
  end if;

  -- 1) Revisa y bloquea TODOS los productos antes de crear nada
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
    v_disc := 0;

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
    elsif v_credit_left > 0 then
      v_cost := public.credit_price(public.current_price(v_product), v_value) * v_item.qty;
      if v_credit_left >= v_cost then
        v_disc := v_amount;
        v_credits_spent := v_credits_spent + v_cost;
        v_credit_left := v_credit_left - v_cost;
      else
        -- Parte proporcional del producto (lo demás se paga en pesos)
        v_disc := floor(v_amount::numeric * v_credit_left / v_cost)::int;
        v_credits_spent := v_credits_spent + v_credit_left;
        v_credit_left := 0;
      end if;
      v_credit_used := v_credit_used + v_disc;
    end if;

    insert into public.orders (
      user_id, product_id, quantity, amount, reserved_until,
      buyer_name, buyer_email, buyer_phone, delivery, address,
      comuna, shipping_amount, seller_id, commission_amount, checkout_id, credit_amount
    ) values (
      v_checkout.user_id, v_product.id, v_item.qty, v_amount + v_ship - v_disc, v_until,
      v_checkout.buyer_name, v_checkout.buyer_email, v_checkout.buyer_phone,
      v_delivery, v_checkout.address, v_checkout.comuna, v_ship,
      v_product.seller_id,
      case when v_product.seller_id is null then null else round(v_amount * v_pct / 100.0)::int end,
      v_checkout.id, v_disc
    );

    v_total := v_total + v_amount + v_ship - v_disc;
    v_shipping_total := v_shipping_total + v_ship;
    v_count := v_count + v_item.qty;
  end loop;

  -- Con créditos, algo hay que pagar (el despacho). Si no, no se usan.
  if v_credit.id is not null then
    if v_credits_spent = 0 then
      raise exception 'credit_no_store_products' using errcode = 'P0001';
    end if;
    if v_total <= 0 then
      raise exception 'credit_zero_total' using errcode = 'P0001';
    end if;
    insert into public.store_credit_uses (credit_id, checkout_id, amount)
    values (v_credit.id, v_checkout.id, v_credits_spent);
  end if;

  update public.checkouts
     set amount = v_total, shipping_amount = v_shipping_total, items_count = v_count,
         credit_amount = v_credit_used, credits_used = v_credits_spent
   where id = v_checkout.id
  returning * into v_checkout;

  return jsonb_build_object('ok', true, 'checkout', to_jsonb(v_checkout));
end;
$$;

revoke execute on function public.place_cart(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
