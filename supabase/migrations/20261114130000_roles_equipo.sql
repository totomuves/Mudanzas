-- =============================================================
-- MÜVEO · Roles del equipo (Admin → Equipo)
--
-- El dueño (administrador total, profiles.is_admin) crea roles con
-- las secciones que cada rol puede ver y modificar, e invita personas
-- por correo con un rol. Una persona con rol solo entra a esas
-- secciones del admin, y la base de datos (RLS) también se lo limita.
--
-- Secciones: productos, pedidos, vendedores, portada, recomendador, mudanzas.
-- "Equipo" queda solo para administradores totales.
--
-- Se puede correr más de una vez sin problema.
-- =============================================================

-- -------------------------------------------------------------
-- Tablas
-- -------------------------------------------------------------
create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 60),
  sections text[] not null default '{}'
    check (sections <@ array['productos','pedidos','vendedores','portada','recomendador','mudanzas']::text[]),
  created_at timestamptz not null default now()
);
create unique index if not exists admin_roles_name_key on public.admin_roles (lower(name));

alter table public.profiles
  add column if not exists admin_role_id uuid references public.admin_roles (id) on delete set null;

-- Invitaciones a personas que todavía no han entrado a la app.
-- role_id null = administrador total.
create table if not exists public.admin_invites (
  email text primary key check (email = lower(trim(email))),
  role_id uuid references public.admin_roles (id) on delete cascade,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;
alter table public.admin_invites enable row level security;
-- Sin políticas: solo se leen y cambian con las funciones de abajo.

-- -------------------------------------------------------------
-- ¿Qué secciones puede ver la persona actual?
-- -------------------------------------------------------------
create or replace function public.admin_sections()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p.is_admin then array['productos','pedidos','vendedores','portada','recomendador','mudanzas','equipo']::text[]
      else coalesce(r.sections, '{}'::text[])
    end
    from public.profiles p
    left join public.admin_roles r on r.id = p.admin_role_id
    where p.id = auth.uid()
  ), '{}'::text[]);
$$;

create or replace function public.can_admin(p_section text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_section = any (public.admin_sections());
$$;

revoke execute on function public.admin_sections() from public;
revoke execute on function public.can_admin(text) from public;
grant execute on function public.admin_sections() to anon, authenticated;
grant execute on function public.can_admin(text) to anon, authenticated;

-- -------------------------------------------------------------
-- Políticas: cada sección abre solo sus tablas
-- -------------------------------------------------------------

-- Productos (incluye categorías y fotos)
drop policy if exists "admin gestiona categorias" on public.categories;
create policy "admin gestiona categorias" on public.categories
  for all to authenticated using (public.can_admin('productos')) with check (public.can_admin('productos'));

drop policy if exists "productos visibles" on public.products;
create policy "productos visibles" on public.products
  for select using (
    (status <> 'hidden' and (seller_id is null or public.seller_is_active(seller_id)))
    or public.can_admin('productos')
    or public.can_admin('vendedores')
    or public.can_admin('recomendador')
    or (seller_id is not null and seller_id = (select public.my_seller_id()))
  );
drop policy if exists "admin crea productos" on public.products;
create policy "admin crea productos" on public.products
  for insert to authenticated with check (public.can_admin('productos'));
drop policy if exists "admin edita productos" on public.products;
create policy "admin edita productos" on public.products
  for update to authenticated using (public.can_admin('productos')) with check (public.can_admin('productos'));
drop policy if exists "admin borra productos" on public.products;
create policy "admin borra productos" on public.products
  for delete to authenticated using (public.can_admin('productos'));

drop policy if exists "admin ve swipes" on public.swipes;
create policy "admin ve swipes" on public.swipes
  for select to authenticated using (public.can_admin('productos') or public.can_admin('recomendador'));

drop policy if exists "admin sube fotos" on storage.objects;
create policy "admin sube fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'products' and public.can_admin('productos'));
drop policy if exists "admin edita fotos" on storage.objects;
create policy "admin edita fotos" on storage.objects
  for update to authenticated using (bucket_id = 'products' and public.can_admin('productos'));
drop policy if exists "admin borra fotos" on storage.objects;
create policy "admin borra fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'products' and public.can_admin('productos'));

-- Pedidos (Vendedores también los ve, para pagar a cada vendedor)
drop policy if exists "ver mis pedidos" on public.orders;
create policy "ver mis pedidos" on public.orders
  for select to authenticated
  using (user_id = auth.uid() or public.can_admin('pedidos') or public.can_admin('vendedores'));

-- Vendedores
drop policy if exists "ver mi tienda" on public.sellers;
create policy "ver mi tienda" on public.sellers
  for select to authenticated
  using (owner_id = auth.uid() or public.can_admin('vendedores') or public.can_admin('productos') or public.can_admin('pedidos'));
drop policy if exists "admin ve configuracion" on public.marketplace_settings;
create policy "admin ve configuracion" on public.marketplace_settings
  for select to authenticated using (public.can_admin('vendedores'));

-- Portada
drop policy if exists "banners visibles" on public.home_banners;
create policy "banners visibles" on public.home_banners
  for select using (active or public.can_admin('portada'));
drop policy if exists "admin gestiona banners" on public.home_banners;
create policy "admin gestiona banners" on public.home_banners
  for all to authenticated using (public.can_admin('portada')) with check (public.can_admin('portada'));

-- Recomendador
drop policy if exists "admin gestiona situaciones" on public.moving_contexts;
create policy "admin gestiona situaciones" on public.moving_contexts
  for all to authenticated using (public.can_admin('recomendador')) with check (public.can_admin('recomendador'));
drop policy if exists "admin gestiona priors" on public.context_priors;
create policy "admin gestiona priors" on public.context_priors
  for all to authenticated using (public.can_admin('recomendador')) with check (public.can_admin('recomendador'));
drop policy if exists "admin ve eventos" on public.user_events;
create policy "admin ve eventos" on public.user_events
  for select to authenticated using (public.can_admin('recomendador'));

-- Agenda de mudanzas
drop policy if exists "servicios visibles" on public.service_types;
create policy "servicios visibles" on public.service_types
  for select using (active or public.can_admin('mudanzas'));
drop policy if exists "admin gestiona servicios" on public.service_types;
create policy "admin gestiona servicios" on public.service_types
  for all to authenticated using (public.can_admin('mudanzas')) with check (public.can_admin('mudanzas'));
drop policy if exists "admin edita config" on public.moving_settings;
create policy "admin edita config" on public.moving_settings
  for update to authenticated using (public.can_admin('mudanzas')) with check (public.can_admin('mudanzas'));
drop policy if exists "admin gestiona dias bloqueados" on public.blocked_dates;
create policy "admin gestiona dias bloqueados" on public.blocked_dates
  for all to authenticated using (public.can_admin('mudanzas')) with check (public.can_admin('mudanzas'));
drop policy if exists "ver mis reservas" on public.bookings;
create policy "ver mis reservas" on public.bookings
  for select to authenticated using (user_id = auth.uid() or public.can_admin('mudanzas'));
drop policy if exists "admin edita reservas" on public.bookings;
create policy "admin edita reservas" on public.bookings
  for update to authenticated using (public.can_admin('mudanzas')) with check (public.can_admin('mudanzas'));

-- -------------------------------------------------------------
-- Funciones para la pantalla Equipo (solo administradores totales)
-- -------------------------------------------------------------

-- Roles con cuántas personas tienen cada uno
create or replace function public.list_admin_roles()
returns table (id uuid, name text, sections text[], members int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  return query
    select r.id, r.name, r.sections,
           ((select count(*) from public.profiles p where p.admin_role_id = r.id and not p.is_admin)
            + (select count(*) from public.admin_invites i where i.role_id = r.id))::int
    from public.admin_roles r
    order by r.created_at;
end;
$$;

-- Crea (p_id null) o edita un rol. Devuelve el id.
create or replace function public.save_admin_role(p_id uuid, p_name text, p_sections text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_sections text[];
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  select coalesce(array_agg(distinct s order by s), '{}') into v_sections
  from unnest(coalesce(p_sections, '{}')) s;

  if p_id is null then
    insert into public.admin_roles (name, sections) values (trim(p_name), v_sections)
    returning id into v_id;
  else
    update public.admin_roles set name = trim(p_name), sections = v_sections
    where id = p_id returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Borra un rol: las personas con ese rol pierden el acceso al admin.
create or replace function public.delete_admin_role(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  delete from public.admin_roles where id = p_id;
end;
$$;

-- Personas del equipo: activas e invitadas.
-- status: 'activo' (ya entró) o 'invitado' (todavía no entra con su correo).
create or replace function public.list_team()
returns table (email text, is_owner boolean, role_id uuid, role_name text, status text, since timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  return query
    select lower(u.email)::text, p.is_admin, case when p.is_admin then null else p.admin_role_id end,
           case when p.is_admin then null else r.name end, 'activo'::text, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.admin_roles r on r.id = p.admin_role_id
    where p.is_admin or p.admin_role_id is not null
    union all
    select i.email, i.role_id is null, i.role_id, r.name, 'invitado'::text, i.created_at
    from public.admin_invites i
    left join public.admin_roles r on r.id = i.role_id
    order by 6;
end;
$$;

-- Agrega a alguien al equipo con un rol (p_role_id null = administrador total).
-- Si ya entró a la app, el acceso es inmediato ('ok'); si no, queda
-- invitado y se activa solo cuando entre con ese correo ('invited').
-- También sirve para cambiarle el rol a alguien que ya está.
create or replace function public.set_team_member(p_email text, p_role_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  if p_role_id is not null and not exists (select 1 from public.admin_roles where id = p_role_id) then
    return 'no_role';
  end if;

  select u.id into v_id
  from auth.users u
  where lower(u.email) = v_email and u.email_confirmed_at is not null
  limit 1;

  if v_id is null then
    insert into public.admin_invites (email, role_id, invited_by) values (v_email, p_role_id, auth.uid())
    on conflict (email) do update set role_id = excluded.role_id, invited_by = excluded.invited_by;
    return 'invited';
  end if;

  -- Pasar de administrador total a un rol: que quede al menos un administrador total
  if p_role_id is not null
     and exists (select 1 from public.profiles where id = v_id and is_admin)
     and (select count(*) from public.profiles where is_admin) <= 1 then
    return 'last_admin';
  end if;

  insert into public.profiles (id, is_admin, admin_role_id) values (v_id, p_role_id is null, p_role_id)
  on conflict (id) do update set is_admin = excluded.is_admin, admin_role_id = excluded.admin_role_id;
  delete from public.admin_invites where email = v_email;
  return 'ok';
end;
$$;

-- Saca a alguien del equipo (o cancela su invitación).
create or replace function public.remove_team_member(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  delete from public.admin_invites where email = v_email;

  select u.id into v_id from auth.users u where lower(u.email) = v_email limit 1;
  if v_id is null then
    return 'ok';
  end if;
  if exists (select 1 from public.profiles where id = v_id and is_admin)
     and (select count(*) from public.profiles where is_admin) <= 1 then
    return 'last_admin';
  end if;
  update public.profiles set is_admin = false, admin_role_id = null where id = v_id;
  return 'ok';
end;
$$;

revoke execute on function public.list_admin_roles() from public, anon;
revoke execute on function public.save_admin_role(uuid, text, text[]) from public, anon;
revoke execute on function public.delete_admin_role(uuid) from public, anon;
revoke execute on function public.list_team() from public, anon;
revoke execute on function public.set_team_member(text, uuid) from public, anon;
revoke execute on function public.remove_team_member(text) from public, anon;
grant execute on function public.list_admin_roles() to authenticated;
grant execute on function public.save_admin_role(uuid, text, text[]) to authenticated;
grant execute on function public.delete_admin_role(uuid) to authenticated;
grant execute on function public.list_team() to authenticated;
grant execute on function public.set_team_member(text, uuid) to authenticated;
grant execute on function public.remove_team_member(text) to authenticated;

-- -------------------------------------------------------------
-- La invitación se activa sola cuando la persona entra con su correo
-- (solo con el correo ya confirmado, así nadie la puede tomar).
-- -------------------------------------------------------------
create or replace function public.apply_admin_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.admin_invites;
begin
  if new.email is null or new.email_confirmed_at is null then
    return new;
  end if;
  select * into v_inv from public.admin_invites where email = lower(new.email);
  if not found then
    return new;
  end if;
  insert into public.profiles (id, is_admin, admin_role_id)
  values (new.id, v_inv.role_id is null, v_inv.role_id)
  on conflict (id) do update set
    is_admin = public.profiles.is_admin or excluded.is_admin,
    admin_role_id = case when public.profiles.is_admin or excluded.is_admin then null else excluded.admin_role_id end;
  delete from public.admin_invites where email = v_inv.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_invite on auth.users;
create trigger on_auth_user_invite
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.apply_admin_invite();
