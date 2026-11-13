-- =============================================================
-- Totomuves · Avisos de productos nuevos que calzan con cada comprador
-- Requiere 20261113200000_recomendador.sql.
-- Se puede correr más de una vez sin problemas (idempotente).
-- =============================================================

-- El comprador puede apagar los avisos en "Mis gustos" / "Avisos"
alter table public.profiles add column if not exists notify_matches boolean not null default true;
grant update (notify_matches) on public.profiles to authenticated;

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  kind text not null default 'match' check (kind in ('match')),
  title text not null,
  body text,
  url text,
  score real,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, product_id, kind)
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- Suscripciones a notificaciones del teléfono/navegador (Web Push)
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "mis avisos" on public.notifications;
create policy "mis avisos" on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "marcar mis avisos" on public.notifications;
create policy "marcar mis avisos" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Solo se puede marcar como leído
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists "mis suscripciones" on public.push_subscriptions;
create policy "mis suscripciones" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -------------------------------------------------------------
-- ¿A quién le avisamos de este producto nuevo?
-- A los compradores para quienes el producto queda entre lo más parecido
-- a sus gustos (top 8% de todo lo disponible), que no lo silenciaron,
-- que les cabe en el presupuesto y que no recibieron otro aviso en 20 horas.
-- Devuelve los avisos creados. Solo la usa el servidor.
-- -------------------------------------------------------------
create or replace function public.notify_matches(p_product_id uuid)
returns setof public.notifications
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_p public.products;
  v_f public.product_features;
  v_price int;
  v_traits text[];
  v_total int;
  v_cut real;
begin
  select * into v_p from public.products where id = p_product_id and status = 'available';
  select * into v_f from public.product_features where product_id = p_product_id;
  if v_p.id is null or v_f.embedding is null then
    return;
  end if;
  v_price := public.current_price(v_p);
  v_traits := public.product_traits(v_p.category_slug, v_p.condition, v_f.attributes);

  -- Con pocos productos, "top 8%" no significa mucho: se relaja
  select count(*) into v_total
  from public.products o join public.product_features f on f.product_id = o.id and f.model = v_f.model
  where o.status = 'available' and f.embedding is not null;
  v_cut := case when v_total < 15 then 0.25 when v_total < 50 then 0.12 else 0.08 end;

  return query
  with cand as (
    select t.user_id, t.long_vec, t.traits,
           1 - (v_f.embedding <=> t.long_vec) as sim,
           coalesce((t.traits -> ('category:' || v_p.category_slug) ->> 'a')::real, 0) as cat_a
    from public.user_taste t
    join public.profiles pf on pf.id = t.user_id
    where t.model = v_f.model and t.long_vec is not null and t.n_pos >= 3
      and t.last_event_at > now() - interval '45 days'
      and pf.notify_matches
      and (pf.budget_max is null or v_price <= pf.budget_max * 1.1)
      and not exists (select 1 from public.user_trait_prefs x
                      where x.user_id = t.user_id and x.adjust = -1 and x.trait = any (v_traits))
      and not exists (select 1 from public.swipes s where s.user_id = t.user_id and s.product_id = p_product_id)
      and not exists (select 1 from public.notifications n
                      where n.user_id = t.user_id and n.created_at > now() - interval '20 hours')
  ),
  ranked as (
    select c.*,
      (select count(*) from public.products o
         join public.product_features f on f.product_id = o.id and f.model = v_f.model
        where o.status = 'available' and o.id <> p_product_id and f.embedding is not null
          and 1 - (f.embedding <=> c.long_vec) > c.sim)::real / greatest(1, v_total) as above,
      (select min(substr(t2, 7)) from unnest(v_traits) t2
        where t2 like 'style:%' and coalesce((c.traits -> t2 ->> 'a')::real, 0) > 0.2) as style
    from cand c
    where c.cat_a >= 0
  ),
  ins as (
    insert into public.notifications (user_id, product_id, kind, title, body, url, score)
    select r.user_id, p_product_id, 'match',
           'Llegó algo para ti',
           v_p.title || ' · $' || replace(to_char(v_price, 'FM999,999,999'), ',', '.') ||
             case when r.style is not null then ' · estilo ' || r.style
                  when r.cat_a > 0.3 then ' · de lo que más te gusta'
                  else ' · parecido a lo que te gustó' end,
           '/producto/' || p_product_id,
           (1 - r.above)::real
    from ranked r
    where r.above <= v_cut
    on conflict (user_id, product_id, kind) do nothing
    returning *
  )
  select * from ins;
end;
$$;
revoke execute on function public.notify_matches(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
