-- =============================================================
-- Totomuves · Cantidad (stock) por producto
-- Un producto puede tener varias unidades. Al pagar se descuenta
-- la cantidad comprada; al llegar a 0 queda "vendido" (agotado).
-- Mientras alguien paga, sus unidades quedan apartadas 15 minutos.
-- =============================================================

alter table public.products
  add column if not exists quantity int not null default 1 check (quantity >= 0);

-- Productos ya vendidos quedan con 0 unidades
update public.products set quantity = 0 where status = 'sold';

alter table public.orders
  add column if not exists quantity int not null default 1 check (quantity between 1 and 50),
  add column if not exists reserved_until timestamptz;

-- Unidades apartadas por pagos en curso
create or replace function public.held_units(p_product_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(o.quantity), 0)::int
  from public.orders o
  where o.product_id = p_product_id
    and o.status = 'pending'
    and o.reserved_until > now();
$$;

-- Unidades que se pueden comprar ahora (se puede pedir como columna: select=*,available_units)
create or replace function public.available_units(p public.products)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.status = 'available'
    then greatest(0, p.quantity - public.held_units(p.id))
    else 0 end;
$$;

grant execute on function public.available_units(public.products) to anon, authenticated;
revoke execute on function public.held_units(uuid) from public, anon, authenticated;

-- Crea el pedido apartando las unidades de forma atómica. La usa el servidor.
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
begin
  -- Bloquea la fila para que dos compras no tomen la misma unidad
  select * into v_product from public.products
   where id = (p->>'product_id')::uuid
   for update;

  if v_product.id is null or v_product.status <> 'available'
     or v_product.quantity - public.held_units(v_product.id) < v_qty then
    return null;
  end if;

  insert into public.orders (
    user_id, product_id, quantity, amount, reserved_until,
    buyer_name, buyer_email, buyer_phone, delivery, address
  ) values (
    nullif(p->>'user_id', '')::uuid, v_product.id, v_qty,
    public.current_price(v_product) * v_qty,
    now() + interval '15 minutes',
    p->>'buyer_name', p->>'buyer_email', nullif(p->>'buyer_phone', ''),
    coalesce(p->>'delivery', 'retiro'), nullif(p->>'address', '')
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.place_order(jsonb) from public, anon, authenticated;

-- Al pagar: descuenta stock y marca agotado en 0 (idempotente)
create or replace function public.mark_order_paid(p_order_id uuid, p_payment_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  update public.orders
     set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
   where id = p_order_id and status <> 'paid'
  returning * into v_order;

  if v_order.id is null then
    return; -- ya estaba pagado
  end if;

  update public.products
     set quantity = greatest(0, quantity - v_order.quantity),
         status = case when quantity - v_order.quantity <= 0 then 'sold' else status end,
         sold_at = case when quantity - v_order.quantity <= 0 then now() else sold_at end
   where id = v_order.product_id;
end;
$$;

revoke execute on function public.mark_order_paid(uuid, text) from public, anon, authenticated;

-- Si el admin repone stock de un producto agotado, vuelve a estar disponible;
-- si lo deja en 0, queda agotado.
create or replace function public.sync_stock_status()
returns trigger
language plpgsql
as $$
begin
  if new.quantity = 0 and new.status = 'available' then
    new.status := 'sold';
    new.sold_at := coalesce(new.sold_at, now());
  elsif new.quantity > 0 and new.status = 'sold' and tg_op = 'UPDATE'
        and old.status = 'sold' and new.quantity > old.quantity then
    new.status := 'available';
    new.sold_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists products_stock_status on public.products;
create trigger products_stock_status
  before insert or update of quantity, status on public.products
  for each row execute function public.sync_stock_status();

-- La reserva antigua por producto ya no se usa
drop function if exists public.reserve_product(uuid, uuid);
