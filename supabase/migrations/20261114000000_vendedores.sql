-- =============================================================
-- Totomuves · Vendedores (marketplace)
-- Otras empresas de mudanza (o personas) se registran en /vender,
-- un admin las aprueba en /admin/vendedores y cada una administra
-- sus productos y pedidos en /vendedor.
-- Los clientes solo ven la marca Totomuves: los datos del vendedor
-- no se muestran en la parte pública de la app.
-- Pagos: Totomuves cobra la venta con su cuenta de Mercado Pago y
-- retiene el dinero. El vendedor marca el pedido como entregado y el
-- comprador tiene unos días para confirmar o reportar un problema.
-- Luego el pago se libera y Totomuves le transfiere al vendedor el
-- monto menos su comisión.
--
-- Se puede correr más de una vez sin romper nada.
-- =============================================================

-- -------------------------------------------------------------
-- Vendedores
-- -------------------------------------------------------------
create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  kind text not null default 'empresa' check (kind in ('empresa', 'persona')),
  rut text check (rut is null or char_length(rut) <= 20),
  contact_name text check (contact_name is null or char_length(contact_name) <= 80),
  email text not null check (char_length(email) <= 120),
  phone text not null check (char_length(phone) <= 30),
  comunas text[] not null default '{}',
  description text not null default '' check (char_length(description) <= 600),
  logo_url text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),
  -- Comisión propia de este vendedor (%). Si es null se usa la general.
  commission_pct numeric(5, 2) check (commission_pct is null or commission_pct between 0 and 50),
  admin_note text,
  approved_at timestamptz,
  -- Cuenta donde se le transfieren las ventas (solo la ven el vendedor y el admin)
  bank_name text check (bank_name is null or char_length(bank_name) <= 60),
  bank_account_type text check (bank_account_type is null or bank_account_type in ('corriente', 'vista', 'ahorro', 'rut')),
  bank_account_number text check (bank_account_number is null or char_length(bank_account_number) <= 30),
  bank_holder_name text check (bank_holder_name is null or char_length(bank_holder_name) <= 80),
  bank_holder_rut text check (bank_holder_rut is null or char_length(bank_holder_rut) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sellers_status_idx on public.sellers (status, created_at desc);

drop trigger if exists sellers_touch on public.sellers;
create trigger sellers_touch
  before update on public.sellers
  for each row execute function public.touch_updated_at();

-- Configuración general del marketplace (una sola fila)
create table if not exists public.marketplace_settings (
  id int primary key default 1 check (id = 1),
  commission_pct numeric(5, 2) not null default 10 check (commission_pct between 0 and 50),
  -- Días que tiene el comprador, desde la entrega, para confirmar o reportar un problema
  review_days int not null default 3 check (review_days between 1 and 30),
  updated_at timestamptz not null default now()
);

insert into public.marketplace_settings (id) values (1) on conflict (id) do nothing;

-- -------------------------------------------------------------
-- Productos y pedidos de cada vendedor
-- (seller_id null = producto propio de Totomuves)
-- -------------------------------------------------------------
alter table public.products
  add column if not exists seller_id uuid references public.sellers (id) on delete restrict;

create index if not exists products_seller_idx on public.products (seller_id, created_at desc);

alter table public.orders
  add column if not exists seller_id uuid references public.sellers (id) on delete set null,
  add column if not exists commission_amount int check (commission_amount is null or commission_amount >= 0),
  -- Seguimiento de la entrega y del dinero retenido
  add column if not exists delivered_at timestamptz,        -- el vendedor marcó "entregado"
  add column if not exists release_at timestamptz,          -- se libera solo en esta fecha si no hay reclamo
  add column if not exists confirmed_at timestamptz,        -- el comprador confirmó que llegó bien
  add column if not exists issue_at timestamptz,            -- el comprador reportó un problema / quiere devolver
  add column if not exists issue_text text check (issue_text is null or char_length(issue_text) <= 1000),
  add column if not exists released_at timestamptz,         -- el pago quedó liberado para el vendedor
  add column if not exists refunded_at timestamptz,         -- se devolvió el dinero al comprador
  add column if not exists payout_at timestamptz;           -- se le transfirió al vendedor

-- Nuevo estado: reembolsado
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded'));

create index if not exists orders_seller_idx on public.orders (seller_id, created_at desc);

-- -------------------------------------------------------------
-- Funciones de ayuda
-- -------------------------------------------------------------

-- Tienda aprobada del usuario actual (o null)
create or replace function public.my_seller_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.sellers s
  where s.owner_id = auth.uid() and s.status = 'approved'
  limit 1;
$$;

-- ¿El vendedor está aprobado? (sus productos se ven en la tienda)
create or replace function public.seller_is_active(p_seller_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.sellers s where s.id = p_seller_id and s.status = 'approved');
$$;

grant execute on function public.my_seller_id() to anon, authenticated;
grant execute on function public.seller_is_active(uuid) to anon, authenticated;

-- -------------------------------------------------------------
-- Pedido: guarda el vendedor y la comisión (reemplaza la versión de stock)
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
begin
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
    seller_id, commission_amount
  ) values (
    nullif(p->>'user_id', '')::uuid, v_product.id, v_qty, v_amount,
    now() + interval '15 minutes',
    p->>'buyer_name', p->>'buyer_email', nullif(p->>'buyer_phone', ''),
    coalesce(p->>'delivery', 'retiro'), nullif(p->>'address', ''),
    v_product.seller_id,
    case when v_product.seller_id is null then null else round(v_amount * v_pct / 100.0)::int end
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.place_order(jsonb) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Entrega y retención del pago
-- -------------------------------------------------------------

-- El vendedor marca un pedido pagado como entregado: empieza el plazo de revisión
create or replace function public.seller_mark_delivered(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days int;
begin
  select coalesce(m.review_days, 3) into v_days from public.marketplace_settings m where m.id = 1;
  update public.orders
     set delivered_at = now(),
         release_at = now() + make_interval(days => coalesce(v_days, 3))
   where id = p_order_id
     and seller_id is not null
     and seller_id = public.my_seller_id()
     and status = 'paid'
     and delivered_at is null;
  return found;
end;
$$;

-- El comprador confirma que recibió todo bien: se libera el pago
create or replace function public.buyer_confirm_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders
     set confirmed_at = now(),
         delivered_at = coalesce(delivered_at, now()),
         released_at = case when issue_at is null then coalesce(released_at, now()) else released_at end
   where id = p_order_id
     and user_id = auth.uid()
     and status = 'paid'
     and confirmed_at is null;
  return found;
end;
$$;

-- El comprador reporta un problema o quiere devolver: el pago queda retenido
create or replace function public.buyer_report_issue(p_order_id uuid, p_text text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders
     set issue_at = now(),
         issue_text = left(coalesce(nullif(trim(p_text), ''), 'Sin detalle'), 1000)
   where id = p_order_id
     and user_id = auth.uid()
     and status = 'paid'
     and released_at is null
     and issue_at is null;
  return found;
end;
$$;

-- Libera los pagos cuyo plazo de revisión venció sin reclamos
create or replace function public.release_due_orders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.orders
     set released_at = release_at
   where status = 'paid'
     and released_at is null
     and issue_at is null
     and release_at is not null
     and release_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Días de revisión vigentes (para mostrarlos en la app)
create or replace function public.marketplace_review_days()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select m.review_days from public.marketplace_settings m where m.id = 1), 3);
$$;

grant execute on function public.marketplace_review_days() to anon, authenticated;

revoke execute on function public.seller_mark_delivered(uuid) from public, anon;
revoke execute on function public.buyer_confirm_order(uuid) from public, anon;
revoke execute on function public.buyer_report_issue(uuid, text) from public, anon;
revoke execute on function public.release_due_orders() from public, anon;
grant execute on function public.seller_mark_delivered(uuid) to authenticated;
grant execute on function public.buyer_confirm_order(uuid) to authenticated;
grant execute on function public.buyer_report_issue(uuid, text) to authenticated;
grant execute on function public.release_due_orders() to authenticated;

-- -------------------------------------------------------------
-- Seguridad
-- -------------------------------------------------------------
alter table public.sellers enable row level security;
alter table public.marketplace_settings enable row level security;


-- Vendedores: cada uno ve su ficha; el admin ve todas.
-- Se crean y editan solo desde el servidor (acciones validadas).
drop policy if exists "ver mi tienda" on public.sellers;
create policy "ver mi tienda" on public.sellers
  for select to authenticated using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "admin ve configuracion" on public.marketplace_settings;
create policy "admin ve configuracion" on public.marketplace_settings
  for select to authenticated using (public.is_admin());

-- Productos: el público no ve los de vendedores no aprobados.
-- Cada vendedor ve y gestiona solo los suyos.
drop policy if exists "productos visibles" on public.products;
create policy "productos visibles" on public.products
  for select using (
    (status <> 'hidden' and (seller_id is null or public.seller_is_active(seller_id)))
    or public.is_admin()
    or (seller_id is not null and seller_id = (select public.my_seller_id()))
  );

drop policy if exists "vendedor crea productos" on public.products;
create policy "vendedor crea productos" on public.products
  for insert to authenticated
  with check (seller_id is not null and seller_id = (select public.my_seller_id()));

drop policy if exists "vendedor edita productos" on public.products;
create policy "vendedor edita productos" on public.products
  for update to authenticated
  using (seller_id is not null and seller_id = (select public.my_seller_id()))
  with check (seller_id is not null and seller_id = (select public.my_seller_id()));

drop policy if exists "vendedor borra productos" on public.products;
create policy "vendedor borra productos" on public.products
  for delete to authenticated
  using (seller_id is not null and seller_id = (select public.my_seller_id()));

-- Pedidos: el vendedor ve los de sus productos (para coordinar la entrega)
drop policy if exists "vendedor ve sus pedidos" on public.orders;
create policy "vendedor ve sus pedidos" on public.orders
  for select to authenticated
  using (seller_id is not null and seller_id = (select public.my_seller_id()));

-- Fotos: cada vendedor sube a su carpeta sellers/<id>/ del bucket products
drop policy if exists "vendedor sube fotos" on storage.objects;
create policy "vendedor sube fotos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'products'
    and (storage.foldername(name))[1] = 'sellers'
    and (storage.foldername(name))[2] = (select public.my_seller_id())::text
  );

drop policy if exists "vendedor edita fotos" on storage.objects;
create policy "vendedor edita fotos" on storage.objects
  for update to authenticated using (
    bucket_id = 'products'
    and (storage.foldername(name))[1] = 'sellers'
    and (storage.foldername(name))[2] = (select public.my_seller_id())::text
  );

drop policy if exists "vendedor borra fotos" on storage.objects;
create policy "vendedor borra fotos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'products'
    and (storage.foldername(name))[1] = 'sellers'
    and (storage.foldername(name))[2] = (select public.my_seller_id())::text
  );

notify pgrst, 'reload schema';
