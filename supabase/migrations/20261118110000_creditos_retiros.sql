-- =============================================================
-- CRÉDITOS POR RETIROS
-- Quien nos entrega cosas que ya no usa (retiro sin costo) recibe
-- créditos para comprar en la tienda.
--
-- Cómo funciona:
--   1. El equipo revisa la solicitud (fotos) y le asigna créditos.
--   2. Los créditos quedan "pendientes" hasta que el chofer marca el
--      retiro como hecho. Ahí se activan y empieza a correr el vencimiento
--      (días configurables en credit_settings).
--   3. La persona recibe un código y lo usa en el carrito.
--      Los créditos pagan productos de la tienda (no de vendedores) y
--      NUNCA el despacho: para usarlos hay que elegir despacho y pagarlo.
--   4. Si la compra no se paga (o se reembolsa), los créditos vuelven.
--
-- Se puede correr más de una vez.
-- Requiere antes 20261116160000_retiros.sql y 20261117100000_despacho_automatico.sql.
-- =============================================================

-- -------------------------------------------------------------
-- Ajustes (una sola fila)
-- -------------------------------------------------------------
create table if not exists public.credit_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  -- Días de vigencia desde que se activan (cuando se hace el retiro)
  expiry_days int not null default 180 check (expiry_days between 1 and 3650),
  updated_at timestamptz not null default now()
);
insert into public.credit_settings (id) values (1) on conflict (id) do nothing;

alter table public.credit_settings enable row level security;
drop policy if exists "equipo ve ajustes de creditos" on public.credit_settings;
create policy "equipo ve ajustes de creditos" on public.credit_settings
  for select to authenticated using (public.can_admin('despacho'));

-- -------------------------------------------------------------
-- Créditos: uno por retiro (o dados a mano por el equipo)
-- -------------------------------------------------------------
create table if not exists public.store_credits (
  id uuid primary key default gen_random_uuid(),
  -- Código que se le entrega a la persona (10 letras/números, sin guiones)
  code text not null unique check (code ~ '^[A-Z0-9]{10}$'),
  amount int not null check (amount > 0 and amount <= 10000000),
  pickup_id uuid unique references public.pickups (id) on delete set null,
  holder_name text not null check (char_length(holder_name) between 1 and 80),
  holder_phone text check (holder_phone is null or char_length(holder_phone) <= 30),
  holder_email text check (holder_email is null or char_length(holder_email) <= 120),
  status text not null default 'pendiente' check (status in ('pendiente', 'activo', 'anulado')),
  activated_at timestamptz,
  expires_at timestamptz,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint store_credits_activo_vence check (status <> 'activo' or expires_at is not null)
);
create index if not exists store_credits_status_idx on public.store_credits (status, created_at desc);

-- Cada vez que se usan en una compra
create table if not exists public.store_credit_uses (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.store_credits (id) on delete cascade,
  checkout_id uuid not null references public.checkouts (id) on delete cascade,
  amount int not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (credit_id, checkout_id)
);
create index if not exists store_credit_uses_credit_idx on public.store_credit_uses (credit_id);

alter table public.store_credits enable row level security;
alter table public.store_credit_uses enable row level security;
drop policy if exists "equipo ve creditos" on public.store_credits;
create policy "equipo ve creditos" on public.store_credits
  for select to authenticated using (public.can_admin('despacho'));
drop policy if exists "equipo ve usos de creditos" on public.store_credit_uses;
create policy "equipo ve usos de creditos" on public.store_credit_uses
  for select to authenticated using (public.can_admin('despacho') or public.can_admin('pedidos'));

-- Cuánto se descontó con créditos en cada compra y pedido
alter table public.checkouts
  add column if not exists credit_amount int not null default 0 check (credit_amount >= 0);
alter table public.orders
  add column if not exists credit_amount int not null default 0 check (credit_amount >= 0);

-- -------------------------------------------------------------
-- Saldo: monto menos lo usado en compras pagadas o en pago (apartadas)
-- -------------------------------------------------------------
create or replace function public.credit_used(p_credit_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(u.amount), 0)::int
    from public.store_credit_uses u
    join public.checkouts c on c.id = u.checkout_id
   where u.credit_id = p_credit_id
     and (c.status = 'paid' or (c.status = 'pending' and c.reserved_until > now()));
$$;
revoke execute on function public.credit_used(uuid) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Cuando el retiro se hace, sus créditos se activan.
-- Si el retiro se cancela o se rechaza, se anulan (si nunca se activaron).
-- -------------------------------------------------------------
create or replace function public.pickup_credit_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days int;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'retirado' then
    select expiry_days into v_days from public.credit_settings where id = 1;
    update public.store_credits
       set status = 'activo',
           activated_at = now(),
           expires_at = now() + make_interval(days => coalesce(v_days, 180))
     where pickup_id = new.id and status = 'pendiente';
  elsif new.status in ('cancelado', 'rechazado') then
    update public.store_credits set status = 'anulado'
     where pickup_id = new.id and status = 'pendiente';
  end if;
  return new;
end;
$$;

drop trigger if exists pickups_credit_sync on public.pickups;
create trigger pickups_credit_sync
  after update of status on public.pickups
  for each row execute function public.pickup_credit_sync();

-- -------------------------------------------------------------
-- Consulta pública de un código (desde el servidor): saldo y vencimiento
-- -------------------------------------------------------------
create or replace function public.credit_balance(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.store_credits;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into v from public.store_credits where code = v_code;
  if v.id is null or v.status = 'anulado' then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v.status = 'pendiente' then
    return jsonb_build_object('ok', false, 'reason', 'pending');
  end if;
  if v.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired', 'expires_at', v.expires_at);
  end if;
  return jsonb_build_object(
    'ok', true,
    'balance', greatest(0, v.amount - public.credit_used(v.id)),
    'expires_at', v.expires_at,
    'name', split_part(v.holder_name, ' ', 1)
  );
end;
$$;
revoke execute on function public.credit_balance(text) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Carrito (igual que antes) + créditos
-- p.credit_code (opcional): se descuenta de los productos de la tienda;
-- el despacho siempre se paga, así que exige despacho.
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
  v_credit public.store_credits;
  v_credit_left int := 0;
  v_credit_used int := 0;
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
  --    Los créditos se descuentan de los productos de la tienda, nunca del despacho.
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
      v_disc := least(v_credit_left, v_amount);
      v_credit_left := v_credit_left - v_disc;
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
    if v_credit_used = 0 then
      raise exception 'credit_no_store_products' using errcode = 'P0001';
    end if;
    if v_total <= 0 then
      raise exception 'credit_zero_total' using errcode = 'P0001';
    end if;
    insert into public.store_credit_uses (credit_id, checkout_id, amount)
    values (v_credit.id, v_checkout.id, v_credit_used);
  end if;

  update public.checkouts
     set amount = v_total, shipping_amount = v_shipping_total, items_count = v_count,
         credit_amount = v_credit_used
   where id = v_checkout.id
  returning * into v_checkout;

  return jsonb_build_object('ok', true, 'checkout', to_jsonb(v_checkout));
end;
$$;

revoke execute on function public.place_cart(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
