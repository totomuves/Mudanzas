-- =============================================================
-- Totomuves · Gestionar administradores desde la app (/admin/equipo)
-- =============================================================

-- Lista de administradores con su correo (solo la puede ver un admin)
create or replace function public.list_admins()
returns table (id uuid, email text, created_at timestamptz)
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
    select u.id, u.email::text, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.is_admin
    order by p.created_at;
end;
$$;

-- Da o quita permiso de admin por correo.
-- Devuelve: 'ok', 'not_found' (nunca ha entrado), 'last_admin' (no se puede quitar el último)
create or replace function public.set_admin_by_email(p_email text, p_is_admin boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  select u.id into v_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_id is null then
    return 'not_found';
  end if;

  if not p_is_admin
     and (select count(*) from public.profiles where is_admin) <= 1
     and exists (select 1 from public.profiles where id = v_id and is_admin) then
    return 'last_admin';
  end if;

  insert into public.profiles (id, is_admin) values (v_id, p_is_admin)
  on conflict (id) do update set is_admin = excluded.is_admin;
  return 'ok';
end;
$$;

revoke execute on function public.list_admins() from public, anon;
revoke execute on function public.set_admin_by_email(text, boolean) from public, anon;
grant execute on function public.list_admins() to authenticated;
grant execute on function public.set_admin_by_email(text, boolean) to authenticated;
