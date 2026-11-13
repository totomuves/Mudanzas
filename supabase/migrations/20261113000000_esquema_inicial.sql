-- =============================================================
-- Mudanzas · Esquema inicial
-- Tienda de productos que regalan los clientes en las mudanzas.
-- Ejecutar en Supabase: SQL Editor -> pegar y "Run",
-- o con la CLI: `supabase db push`.
-- =============================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------
-- Categorías
-- -------------------------------------------------------------
create table public.categories (
  slug text primary key,
  name text not null,
  emoji text not null default '📦',
  sort_order int not null default 0
);

-- -------------------------------------------------------------
-- Perfiles (uno por usuario de auth.users, incluidos anónimos)
-- -------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  comuna text,
  budget_max int check (budget_max is null or budget_max >= 0),
  onboarded boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrarse (o al entrar como anónimo)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ¿El usuario actual es administrador?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- -------------------------------------------------------------
-- Productos (cada uno es una pieza única)
-- -------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '',
  category_slug text not null references public.categories (slug),
  price int not null check (price >= 0),           -- CLP, sin decimales
  original_price int check (original_price is null or original_price >= 0),
  condition text not null default 'buen_estado'
    check (condition in ('nuevo', 'como_nuevo', 'buen_estado', 'con_detalles')),
  comuna text,
  images text[] not null default '{}',             -- URLs públicas de Storage
  status text not null default 'available'
    check (status in ('available', 'reserved', 'sold', 'hidden')),
  -- Oferta relámpago: precio especial hasta flash_until
  flash_price int check (flash_price is null or flash_price >= 0),
  flash_until timestamptz,
  -- Reserva temporal mientras alguien está pagando
  reserved_by uuid references auth.users (id) on delete set null,
  reserved_until timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_status_idx on public.products (status, created_at desc);
create index products_category_idx on public.products (category_slug);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

-- Precio vigente (considera oferta relámpago activa)
create or replace function public.current_price(p public.products)
returns int
language sql
stable
as $$
  select case
    when p.flash_price is not null and p.flash_until is not null and p.flash_until > now()
      then p.flash_price
    else p.price
  end;
$$;

-- -------------------------------------------------------------
-- Gustos del usuario: afinidad por categoría (aprende con cada swipe)
-- -------------------------------------------------------------
create table public.user_categories (
  user_id uuid not null references auth.users (id) on delete cascade,
  category_slug text not null references public.categories (slug) on delete cascade,
  weight real not null default 0,
  selected boolean not null default false,   -- elegida en el onboarding
  primary key (user_id, category_slug)
);

-- -------------------------------------------------------------
-- Swipes (me gusta / paso / súper me gusta)
-- -------------------------------------------------------------
create table public.swipes (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  action text not null check (action in ('like', 'pass', 'superlike')),
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index swipes_product_idx on public.swipes (product_id);

-- Cada swipe ajusta la afinidad del usuario con la categoría del producto
create or replace function public.learn_from_swipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_delta real;
  v_old_delta real := 0;
begin
  select category_slug into v_category from public.products where id = new.product_id;
  if v_category is null then
    return new;
  end if;

  v_delta := case new.action when 'superlike' then 2.0 when 'like' then 1.0 else -0.4 end;

  -- Si cambia de opinión (update), se deshace el efecto anterior
  if tg_op = 'UPDATE' then
    v_old_delta := case old.action when 'superlike' then 2.0 when 'like' then 1.0 else -0.4 end;
  end if;

  insert into public.user_categories (user_id, category_slug, weight)
  values (new.user_id, v_category, v_delta - v_old_delta)
  on conflict (user_id, category_slug)
  do update set weight = greatest(-3, least(20, public.user_categories.weight + excluded.weight));

  return new;
end;
$$;

create trigger swipes_learn
  after insert or update of action on public.swipes
  for each row execute function public.learn_from_swipe();

-- Deshacer: al borrar un swipe se revierte su efecto
create or replace function public.unlearn_swipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_delta real;
begin
  select category_slug into v_category from public.products where id = old.product_id;
  if v_category is null then
    return old;
  end if;
  v_delta := case old.action when 'superlike' then 2.0 when 'like' then 1.0 else -0.4 end;
  update public.user_categories
     set weight = weight - v_delta
   where user_id = old.user_id and category_slug = v_category;
  return old;
end;
$$;

create trigger swipes_unlearn
  after delete on public.swipes
  for each row execute function public.unlearn_swipe();

-- -------------------------------------------------------------
-- Pedidos
-- -------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  product_id uuid not null references public.products (id),
  amount int not null check (amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled')),
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  delivery text not null default 'retiro' check (delivery in ('retiro', 'despacho')),
  address text,
  mp_preference_id text,
  mp_payment_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_product_idx on public.orders (product_id);

-- -------------------------------------------------------------
-- Feed inteligente: productos ordenados según los gustos del usuario
-- -------------------------------------------------------------
create or replace function public.get_feed(p_limit int default 20)
returns setof public.products
language sql
volatile
security invoker
set search_path = ''
as $$
  with me as (
    select p.budget_max, p.comuna from public.profiles p where p.id = auth.uid()
  ),
  scored as (
    select pr.*,
      -- 1) afinidad con la categoría (lo que más pesa)
      coalesce(uc.weight, 0) * 1.0
      -- 2) bonus si la eligió en el onboarding
      + case when uc.selected then 3 else 0 end
      -- 3) ¿cabe en su presupuesto?
      + case
          when (select budget_max from me) is null then 0
          when public.current_price(pr) <= (select budget_max from me) then 1
          else -2
        end
      -- 4) misma comuna = más fácil de retirar
      + case when pr.comuna is not null and pr.comuna = (select comuna from me) then 0.8 else 0 end
      -- 5) oferta relámpago activa
      + case when pr.flash_until > now() and pr.flash_price is not null then 1.5 else 0 end
      -- 6) novedad: los recién subidos suben en el ranking
      + 2 * exp(-extract(epoch from (now() - pr.created_at)) / 86400.0 / 7)
      -- 7) exploración: un poco de azar para descubrir cosas nuevas
      + random() * 1.5 as score
    from public.products pr
    left join public.user_categories uc
      on uc.user_id = auth.uid() and uc.category_slug = pr.category_slug
    where pr.status = 'available'
      and not exists (
        select 1 from public.swipes s
        where s.user_id = auth.uid() and s.product_id = pr.id
      )
  )
  select id, title, description, category_slug, price, original_price, condition, comuna,
         images, status, flash_price, flash_until, reserved_by, reserved_until, sold_at,
         created_at, updated_at
  from scored
  order by score desc
  limit greatest(1, least(p_limit, 50));
$$;

-- -------------------------------------------------------------
-- Reserva atómica de un producto al iniciar el pago (15 minutos)
-- Solo la usa el servidor con la service key.
-- -------------------------------------------------------------
create or replace function public.reserve_product(p_product_id uuid, p_user_id uuid)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.products;
begin
  update public.products
     set reserved_by = p_user_id,
         reserved_until = now() + interval '15 minutes'
   where id = p_product_id
     and status = 'available'
     and (reserved_until is null or reserved_until < now() or reserved_by = p_user_id)
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.reserve_product(uuid, uuid) from public, anon, authenticated;

-- Marca un pedido como pagado y el producto como vendido (desde el webhook)
create or replace function public.mark_order_paid(p_order_id uuid, p_payment_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product uuid;
begin
  update public.orders
     set status = 'paid', mp_payment_id = p_payment_id, paid_at = coalesce(paid_at, now())
   where id = p_order_id
  returning product_id into v_product;

  if v_product is not null then
    update public.products
       set status = 'sold', sold_at = coalesce(sold_at, now()),
           reserved_by = null, reserved_until = null
     where id = v_product;
  end if;
end;
$$;

revoke execute on function public.mark_order_paid(uuid, text) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Seguridad (Row Level Security)
-- -------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.user_categories enable row level security;
alter table public.swipes enable row level security;
alter table public.orders enable row level security;

-- Categorías: lectura pública, edición solo admin
create policy "categorias visibles" on public.categories
  for select using (true);
create policy "admin gestiona categorias" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Perfiles: cada uno ve y edita el suyo; admin ve todos
create policy "ver mi perfil" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "editar mi perfil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Nadie puede auto-promoverse a admin: solo ciertas columnas son editables
revoke update on public.profiles from anon, authenticated;
grant update (display_name, comuna, budget_max, onboarded) on public.profiles to authenticated;

-- Productos: todos ven los publicados; admin ve y gestiona todo
create policy "productos visibles" on public.products
  for select using (status <> 'hidden' or public.is_admin());
create policy "admin crea productos" on public.products
  for insert to authenticated with check (public.is_admin());
create policy "admin edita productos" on public.products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin borra productos" on public.products
  for delete to authenticated using (public.is_admin());

-- Gustos: cada usuario gestiona los suyos
create policy "mis gustos" on public.user_categories
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Swipes: cada usuario gestiona los suyos
create policy "mis swipes" on public.swipes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- El admin ve los swipes para saber qué productos gustan más
create policy "admin ve swipes" on public.swipes
  for select to authenticated using (public.is_admin());

-- Pedidos: el comprador ve los suyos, admin ve todos.
-- Se crean y actualizan solo desde el servidor (service key).
create policy "ver mis pedidos" on public.orders
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- -------------------------------------------------------------
-- Storage: bucket público para las fotos de productos
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

create policy "fotos publicas" on storage.objects
  for select using (bucket_id = 'products');
create policy "admin sube fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'products' and public.is_admin());
create policy "admin edita fotos" on storage.objects
  for update to authenticated using (bucket_id = 'products' and public.is_admin());
create policy "admin borra fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'products' and public.is_admin());

-- -------------------------------------------------------------
-- Categorías iniciales
-- -------------------------------------------------------------
insert into public.categories (slug, name, emoji, sort_order) values
  ('muebles',      'Muebles',             '🛋️', 1),
  ('cocina',       'Cocina',              '🍳', 2),
  ('electro',      'Electrodomésticos',   '🔌', 3),
  ('tecnologia',   'Tecnología',          '💻', 4),
  ('dormitorio',   'Dormitorio',          '🛏️', 5),
  ('deco',         'Decoración',          '🪴', 6),
  ('ninos',        'Niños y bebés',       '🧸', 7),
  ('deporte',      'Deporte y aire libre','🚲', 8),
  ('libros',       'Libros y música',     '📚', 9),
  ('herramientas', 'Herramientas',        '🧰', 10),
  ('ropa',         'Ropa y accesorios',   '👕', 11),
  ('mascotas',     'Mascotas',            '🐾', 12)
on conflict (slug) do nothing;
