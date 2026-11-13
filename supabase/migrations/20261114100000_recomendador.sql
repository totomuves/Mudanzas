-- =============================================================
-- Totomuves · Recomendador inteligente ("conocer al comprador")
--
-- Reemplaza el puntaje simple por categoría por un motor que:
--   * entiende cada producto (atributos por IA + "huella" vectorial)
--   * aprende de todo lo que hace el comprador (swipes, tiempo mirando,
--     detalle, búsquedas, pagos, compras) con olvido en el tiempo
--   * combina gustos de largo plazo, lo que mira ahora, precio, estado,
--     estilo, cercanía, su situación (primer depa, oficina…) y lo que
--     les gustó a compradores parecidos
--   * explora para no quedarse pegado y evita repetir lo mismo
--   * explica por qué muestra cada producto
--
-- Correr después de 20261114000000_vendedores.sql.
-- Se puede correr más de una vez sin problemas (idempotente).
-- Ejecutar en Supabase: SQL Editor -> pegar todo -> Run.
-- =============================================================

create extension if not exists vector with schema extensions;

-- -------------------------------------------------------------
-- Configuración: qué modelo de "huellas" está activo
-- -------------------------------------------------------------
create table if not exists public.recsys_config (
  id int primary key default 1 check (id = 1),
  embedding_model text,
  updated_at timestamptz not null default now()
);
insert into public.recsys_config (id) values (1) on conflict (id) do nothing;

-- -------------------------------------------------------------
-- Lo que la app entiende de cada producto
-- attributes: {"styles":[], "materials":[], "colors":[], "rooms":[], "size":"", "tags":[]}
-- embedding: huella de 512 números (texto + foto) para medir parecidos
-- -------------------------------------------------------------
create table if not exists public.product_features (
  product_id uuid primary key references public.products (id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  embedding extensions.vector(512),
  model text,
  content_hash text,
  indexed_at timestamptz not null default now()
);

-- Cambia cuando cambia lo que describe al producto (para volver a analizarlo)
create or replace function public.product_content_hash(p public.products)
returns text
language sql
stable
set search_path = ''
as $$
  select md5(concat_ws('|', p.title, p.description, p.category_slug, p.condition, p.images[1]));
$$;

-- Productos que faltan por analizar (o cambiaron, o cambió el modelo). Solo el servidor.
create or replace function public.products_to_index(p_limit int default 10, p_model text default null)
returns setof public.products
language sql
stable
security definer
set search_path = ''
as $$
  select pr.*
  from public.products pr
  left join public.product_features f on f.product_id = pr.id
  where f.product_id is null
     or f.content_hash is distinct from public.product_content_hash(pr)
     or (p_model is not null and f.model is distinct from p_model)
  order by (pr.status = 'available') desc, pr.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;
revoke execute on function public.products_to_index(int, text) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Ubicación aproximada de cada comuna (para "cerca de ti")
-- -------------------------------------------------------------
create table if not exists public.comuna_geo (
  name text primary key,
  lat real not null,
  lng real not null
);
insert into public.comuna_geo (name, lat, lng) values
  ('Cerrillos', -33.495, -70.716), ('Cerro Navia', -33.425, -70.744), ('Conchalí', -33.384, -70.675),
  ('El Bosque', -33.562, -70.676), ('Estación Central', -33.460, -70.700), ('Huechuraba', -33.367, -70.636),
  ('Independencia', -33.416, -70.665), ('La Cisterna', -33.530, -70.664), ('La Florida', -33.522, -70.598),
  ('La Granja', -33.538, -70.620), ('La Pintana', -33.583, -70.634), ('La Reina', -33.445, -70.540),
  ('Las Condes', -33.410, -70.567), ('Lo Barnechea', -33.350, -70.518), ('Lo Espejo', -33.521, -70.692),
  ('Lo Prado', -33.444, -70.725), ('Macul', -33.491, -70.599), ('Maipú', -33.510, -70.757),
  ('Ñuñoa', -33.456, -70.598), ('Pedro Aguirre Cerda', -33.492, -70.674), ('Peñalolén', -33.485, -70.540),
  ('Providencia', -33.432, -70.609), ('Pudahuel', -33.440, -70.760), ('Puente Alto', -33.611, -70.575),
  ('Quilicura', -33.360, -70.729), ('Quinta Normal', -33.427, -70.697), ('Recoleta', -33.406, -70.640),
  ('Renca', -33.405, -70.728), ('San Bernardo', -33.592, -70.700), ('San Joaquín', -33.496, -70.628),
  ('San Miguel', -33.497, -70.651), ('San Ramón', -33.541, -70.642), ('Santiago', -33.447, -70.657),
  ('Vitacura', -33.390, -70.585), ('Colina', -33.203, -70.675), ('Lampa', -33.286, -70.876),
  ('Padre Hurtado', -33.573, -70.814), ('Peñaflor', -33.606, -70.876), ('Talagante', -33.664, -70.928),
  ('Buin', -33.732, -70.742), ('Pirque', -33.637, -70.574), ('San José de Maipo', -33.641, -70.352)
on conflict (name) do update set lat = excluded.lat, lng = excluded.lng;

-- -------------------------------------------------------------
-- Situación del comprador (primer depa, oficina, niños…) y qué le sirve
-- -------------------------------------------------------------
alter table public.profiles add column if not exists context text[] not null default '{}';
grant update (context) on public.profiles to authenticated;

create table if not exists public.moving_contexts (
  slug text primary key,
  label text not null,          -- cómo se muestra al elegirlo
  reason text not null,         -- frase para "por qué te lo mostramos"
  sort_order int not null default 0
);
insert into public.moving_contexts (slug, label, reason, sort_order) values
  ('primer_depa', 'Mi primer depa', 'Ideal para tu primer depa', 1),
  ('casa_nueva', 'Me cambio a una casa', 'Ideal para tu casa nueva', 2),
  ('achicando', 'Me cambio a algo más chico', 'Cabe bien en espacios chicos', 3),
  ('oficina', 'Armo una oficina', 'Ideal para tu oficina', 4),
  ('ninos', 'Tengo niños', 'Pensado para familias con niños', 5),
  ('mascotas', 'Tengo mascotas', 'Para tus mascotas', 6),
  ('patio', 'Tengo patio o terraza', 'Para tu patio o terraza', 7),
  ('estudiante', 'Soy estudiante', 'Ideal para estudiar', 8)
on conflict (slug) do update set label = excluded.label, reason = excluded.reason, sort_order = excluded.sort_order;

-- Cuánto ayuda cada situación a cada rasgo de producto
create table if not exists public.context_priors (
  context text not null references public.moving_contexts (slug) on delete cascade,
  trait text not null,
  weight real not null,
  primary key (context, trait)
);
insert into public.context_priors (context, trait, weight) values
  ('primer_depa', 'category:muebles', 0.8), ('primer_depa', 'category:cocina', 0.9),
  ('primer_depa', 'category:electro', 0.7), ('primer_depa', 'category:dormitorio', 0.5),
  ('primer_depa', 'size:pequeño', 0.4), ('primer_depa', 'room:living', 0.3),
  ('casa_nueva', 'category:muebles', 0.7), ('casa_nueva', 'category:deco', 0.6),
  ('casa_nueva', 'category:electro', 0.4), ('casa_nueva', 'category:herramientas', 0.5),
  ('casa_nueva', 'size:grande', 0.3), ('casa_nueva', 'room:exterior', 0.3),
  ('achicando', 'size:pequeño', 0.8), ('achicando', 'size:grande', -0.6),
  ('oficina', 'category:tecnologia', 0.9), ('oficina', 'room:oficina', 1.0), ('oficina', 'category:muebles', 0.3),
  ('ninos', 'category:ninos', 1.2), ('ninos', 'room:infantil', 0.9),
  ('mascotas', 'category:mascotas', 1.2),
  ('patio', 'room:exterior', 1.0), ('patio', 'category:deporte', 0.3), ('patio', 'category:herramientas', 0.4),
  ('estudiante', 'category:libros', 0.6), ('estudiante', 'category:tecnologia', 0.6),
  ('estudiante', 'room:oficina', 0.5), ('estudiante', 'size:pequeño', 0.4)
on conflict (context, trait) do update set weight = excluded.weight;

-- -------------------------------------------------------------
-- Todo lo que hace el comprador (la materia prima del aprendizaje)
-- value: milisegundos mirando (swipes y detalle) u otro número según el tipo
-- -------------------------------------------------------------
create table if not exists public.user_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  kind text not null check (kind in ('like', 'superlike', 'pass', 'view', 'share', 'checkout', 'purchase', 'search')),
  value real,
  query text check (query is null or char_length(query) <= 80),
  query_embedding extensions.vector(512),
  model text,
  created_at timestamptz not null default now()
);
create index if not exists user_events_user_idx on public.user_events (user_id, created_at desc);
create index if not exists user_events_product_idx on public.user_events (product_id);

-- Cuánto dice cada acción sobre el gusto (+ le gusta, − no le gusta)
create or replace function public.event_weight(p_kind text, p_value real)
returns real
language sql
immutable
set search_path = ''
as $$
  select (case p_kind
    when 'superlike' then 2.5
    when 'like' then case when p_value > 8000 then 1.3 else 1.0 end
    -- Pasar rápido = no le interesa nada; pasar después de mirar harto = casi le gustó
    when 'pass' then case when p_value is null then -0.6 when p_value < 1500 then -1.0
                          when p_value > 7000 then -0.2 else -0.6 end
    when 'view' then case when p_value > 20000 then 1.0 when p_value > 6000 then 0.7 else 0.4 end
    when 'share' then 1.2
    when 'checkout' then 2.0
    when 'purchase' then 3.0
    when 'search' then 0.8
    else 0 end)::real;
$$;

-- Los swipes generan eventos solos (con el tiempo que estuvo mirando la tarjeta)
alter table public.swipes add column if not exists dwell_ms int check (dwell_ms is null or dwell_ms >= 0);

create or replace function public.swipe_to_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    -- Deshacer o cambiar de opinión: se borra lo recién aprendido.
    -- Lo que pasó hace rato se mantiene (sigue siendo una señal real).
    delete from public.user_events
     where user_id = old.user_id and product_id = old.product_id
       and kind in ('like', 'superlike', 'pass')
       and (tg_op = 'UPDATE' or created_at > now() - interval '10 minutes');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  insert into public.user_events (user_id, product_id, kind, value)
  values (new.user_id, new.product_id, new.action, new.dwell_ms);
  return new;
end;
$$;

-- El aprendizaje simple anterior se reemplaza por el nuevo
drop trigger if exists swipes_learn on public.swipes;
drop trigger if exists swipes_unlearn on public.swipes;
drop trigger if exists swipes_events on public.swipes;
create trigger swipes_events
  after insert or update of action or delete on public.swipes
  for each row execute function public.swipe_to_event();

-- Traer la historia que ya existe (swipes y compras) para no partir de cero
insert into public.user_events (user_id, product_id, kind, created_at)
select s.user_id, s.product_id, s.action, s.created_at
from public.swipes s
where not exists (
  select 1 from public.user_events e
  where e.user_id = s.user_id and e.product_id = s.product_id and e.kind in ('like', 'superlike', 'pass')
);

insert into public.user_events (user_id, product_id, kind, created_at)
select o.user_id, o.product_id, 'purchase', coalesce(o.paid_at, o.created_at)
from public.orders o
where o.status = 'paid' and o.user_id is not null
  and not exists (
    select 1 from public.user_events e
    where e.user_id = o.user_id and e.product_id = o.product_id and e.kind = 'purchase'
  );

-- -------------------------------------------------------------
-- Lo que la app aprendió de cada comprador (se recalcula solo)
-- traits: {"style:nórdico": {"a": 0.62, "n": 3.1}, ...}
--   a = afinidad entre -1 y 1, n = cuánta evidencia hay
-- -------------------------------------------------------------
create table if not exists public.user_taste (
  user_id uuid primary key references auth.users (id) on delete cascade,
  model text,
  long_vec extensions.vector(512),   -- gustos de fondo (olvida en ~3 semanas)
  short_vec extensions.vector(512),  -- lo que está buscando ahora (últimas horas)
  neg_vec extensions.vector(512),    -- lo que no le gusta
  traits jsonb not null default '{}'::jsonb,
  price_mu real,
  price_sigma real,
  n_pos real not null default 0,
  n_neg real not null default 0,
  n_events int not null default 0,
  last_event_at timestamptz,
  computed_at timestamptz not null default now()
);

-- Ajustes que el comprador hace a mano en "Mis gustos"
create table if not exists public.user_trait_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  trait text not null check (char_length(trait) <= 80),
  adjust smallint not null check (adjust in (-1, 1)),   -- -1 no me muestres, 1 más de esto
  updated_at timestamptz not null default now(),
  primary key (user_id, trait)
);

-- -------------------------------------------------------------
-- Utilidades
-- -------------------------------------------------------------
create or replace function public.jsonb_text_array(j jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(j) = 'array'
    then coalesce((select array_agg(lower(x)) from jsonb_array_elements_text(j) x), '{}')
    else '{}' end;
$$;

-- Rasgos de un producto: "category:muebles", "style:nórdico", "room:living"…
create or replace function public.product_traits(p_category text, p_condition text, a jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['category:' || p_category, 'condition:' || p_condition]
    || (select coalesce(array_agg('style:' || x), '{}') from unnest(public.jsonb_text_array(a -> 'styles')) x)
    || (select coalesce(array_agg('material:' || x), '{}') from unnest(public.jsonb_text_array(a -> 'materials')) x)
    || (select coalesce(array_agg('color:' || x), '{}') from unnest(public.jsonb_text_array(a -> 'colors')) x)
    || (select coalesce(array_agg('room:' || x), '{}') from unnest(public.jsonb_text_array(a -> 'rooms')) x)
    || case when coalesce(a ->> 'size', '') <> '' then array['size:' || lower(a ->> 'size')] else '{}'::text[] end;
$$;

-- Cuánto importa cada tipo de rasgo
create or replace function public.trait_weight(p_trait text)
returns real
language sql
immutable
set search_path = ''
as $$
  select (case split_part(p_trait, ':', 1)
    when 'category' then 1.0 when 'style' then 0.7 when 'room' then 0.5 when 'material' then 0.4
    when 'condition' then 0.4 when 'size' then 0.3 when 'color' then 0.25 else 0.2 end)::real;
$$;

-- Multiplica una huella por un número
create or replace function public.vec_scale(v extensions.vector, s double precision)
returns extensions.vector
language sql
immutable
set search_path = ''
as $$
  select (select array_agg((x * s)::real order by i) from unnest(v::real[]) with ordinality u(x, i))::extensions.vector;
$$;

-- Deja la huella con largo 1 (para comparar solo la "dirección" del gusto)
create or replace function public.vec_unit(v extensions.vector)
returns extensions.vector
language sql
immutable
set search_path = ''
as $$
  select case when v is null then null
    else (select case when n > 1e-9 then public.vec_scale(v, 1.0 / n) end
          from (select sqrt(sum(x * x)) n from unnest(v::real[]) x) t)
  end;
$$;

-- -------------------------------------------------------------
-- Recalcular lo aprendido de un comprador
-- -------------------------------------------------------------
create or replace function public.refresh_taste(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_model text;
begin
  select embedding_model into v_model from public.recsys_config where id = 1;

  with ev as (
    select e.*, public.event_weight(e.kind, e.value) as w,
           power(0.5, extract(epoch from now() - e.created_at) / 86400.0 / 21.0) as decay,   -- olvida a la mitad en 3 semanas
           power(0.5, extract(epoch from now() - e.created_at) / 3600.0 / 6.0) as decay_now  -- "ahora": mitad cada 6 horas
    from public.user_events e
    where e.user_id = p_user and e.created_at > now() - interval '180 days'
    order by e.created_at desc
    limit 600
  ),
  evp as (
    select ev.*, pr.category_slug, pr.condition, public.current_price(pr) as price, f.attributes,
           case
             when ev.kind = 'search' then case when ev.model = v_model then ev.query_embedding end
             when f.model = v_model then f.embedding
           end as emb
    from ev
    left join public.products pr on pr.id = ev.product_id
    left join public.product_features f on f.product_id = ev.product_id
  ),
  vecs as (
    select
      public.vec_unit(sum(public.vec_scale(emb, w * decay)) filter (where w > 0 and emb is not null)) as long_vec,
      public.vec_unit(sum(public.vec_scale(emb, w * decay_now)) filter (where w > 0 and emb is not null and decay_now > 0.02)) as short_vec,
      public.vec_unit(sum(public.vec_scale(emb, -w * decay)) filter (where w < 0 and emb is not null)) as neg_vec,
      coalesce(sum(w * decay) filter (where w > 0), 0) as n_pos,
      coalesce(sum(-w * decay) filter (where w < 0), 0) as n_neg,
      count(*) as n_events,
      max(created_at) as last_event_at
    from evp
  ),
  price as (
    select sum(w * decay * ln(price)) / nullif(sum(w * decay), 0) as mu
    from evp where w > 0 and price > 0
  ),
  price2 as (
    select price.mu,
           greatest(0.35, sqrt(sum(w * decay * power(ln(evp.price) - price.mu, 2)) / nullif(sum(w * decay), 0))) as sigma
    from evp, price
    where evp.w > 0 and evp.price > 0 and price.mu is not null
    group by price.mu
  ),
  tr as (
    select t as trait, sum(w * decay) as s, sum(abs(w) * decay) as n
    from evp, unnest(public.product_traits(category_slug, condition, attributes)) t
    where evp.category_slug is not null
    group by t
  ),
  traits as (
    select coalesce(jsonb_object_agg(trait, jsonb_build_object(
             'a', round((s / (n + 1.5))::numeric, 3),
             's', round(s::numeric, 2),
             'n', round(n::numeric, 2))), '{}'::jsonb) as j
    from tr
  )
  insert into public.user_taste as ut
    (user_id, model, long_vec, short_vec, neg_vec, traits, price_mu, price_sigma,
     n_pos, n_neg, n_events, last_event_at, computed_at)
  select p_user, v_model, vecs.long_vec, vecs.short_vec, vecs.neg_vec, traits.j,
         (select mu from price2), (select sigma from price2),
         vecs.n_pos, vecs.n_neg, vecs.n_events, vecs.last_event_at, now()
  from vecs, traits
  on conflict (user_id) do update set
    model = excluded.model, long_vec = excluded.long_vec, short_vec = excluded.short_vec,
    neg_vec = excluded.neg_vec, traits = excluded.traits, price_mu = excluded.price_mu,
    price_sigma = excluded.price_sigma, n_pos = excluded.n_pos, n_neg = excluded.n_neg,
    n_events = excluded.n_events, last_event_at = excluded.last_event_at, computed_at = excluded.computed_at;

  -- Mantiene user_categories.weight (lo usa el medidor de gustos de Descubrir)
  insert into public.user_categories (user_id, category_slug, weight)
  select p_user, substr(key, 10), greatest(-3, least(20, (value ->> 's')::real))
  from public.user_taste ut, jsonb_each(ut.traits)
  where ut.user_id = p_user and key like 'category:%'
    and exists (select 1 from public.categories c where c.slug = substr(key, 10))
  on conflict (user_id, category_slug) do update set weight = excluded.weight;
end;
$$;
revoke execute on function public.refresh_taste(uuid) from public, anon, authenticated;

-- Recalcula los gustos del usuario actual solo si hay algo nuevo
create or replace function public.refresh_my_taste(p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  if p_force or not exists (
    select 1 from public.user_taste t
    where t.user_id = v_uid
      and t.computed_at > now() - interval '6 hours'
      and t.model is not distinct from (select embedding_model from public.recsys_config where id = 1)
      and t.computed_at >= coalesce((select max(e.created_at) from public.user_events e where e.user_id = v_uid), '-infinity')
  ) then
    perform public.refresh_taste(v_uid);
  end if;
end;
$$;
grant execute on function public.refresh_my_taste(boolean) to authenticated;

-- Qué tan bien le va a cada producto con todos los compradores (sin datos personales)
create or replace function public.product_popularity()
returns table (product_id uuid, likes real, passes real, views real)
language sql
stable
security definer
set search_path = ''
as $$
  select e.product_id,
         count(*) filter (where e.kind in ('like', 'superlike', 'share', 'checkout'))::real,
         count(*) filter (where e.kind = 'pass')::real,
         count(*) filter (where e.kind = 'view')::real
  from public.user_events e
  join public.products p on p.id = e.product_id and p.status = 'available'
  where e.created_at > now() - interval '90 days'
  group by e.product_id;
$$;
grant execute on function public.product_popularity() to anon, authenticated;

-- "A gente con gustos como los tuyos le gustó…" (solo productos, nunca quién)
create or replace function public.collab_scores()
returns table (product_id uuid, score real)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with me as (
    select long_vec, model from public.user_taste
    where user_id = auth.uid() and n_pos >= 3 and long_vec is not null
  ),
  nb as (
    select t.user_id, 1 - (t.long_vec <=> me.long_vec) as sim
    from public.user_taste t, me
    where t.user_id <> auth.uid() and t.n_pos >= 3 and t.long_vec is not null and t.model = me.model
    order by t.long_vec <=> me.long_vec
    limit 40
  )
  select e.product_id, sum(nb.sim * public.event_weight(e.kind, e.value))::real
  from nb
  join public.user_events e on e.user_id = nb.user_id
  join public.products p on p.id = e.product_id and p.status = 'available'
  where nb.sim > 0.2
    and e.kind in ('like', 'superlike', 'view', 'share', 'checkout', 'purchase')
    and e.created_at > now() - interval '60 days'
  group by e.product_id
  having sum(nb.sim * public.event_weight(e.kind, e.value)) > 0;
$$;
grant execute on function public.collab_scores() to authenticated;

-- -------------------------------------------------------------
-- EL RECOMENDADOR
-- Devuelve productos en orden, con la razón de cada uno.
-- Es "security invoker": respeta la seguridad (RLS) de productos.
-- -------------------------------------------------------------
create or replace function public.recommend(
  p_limit int default 15,
  p_categories text[] default null,
  p_exclude uuid[] default null
)
returns table (product public.products, score real, reason text, explore boolean, pos int)
language plpgsql
volatile
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int := greatest(1, least(coalesce(p_limit, 15), 50));
  v_taste public.user_taste;
  v_profile public.profiles;
  v_alpha real;
  v_short real;
  v_filter boolean := p_categories is not null and cardinality(p_categories) > 0;
  v_picked uuid[] := '{}';
  v_reasons text[] := '{}';
  v_explore boolean[] := '{}';
  v_id uuid;
  v_cat text;
  v_reason text;
  v_is_explore boolean;
  v_e1 extensions.vector; v_e2 extensions.vector; v_e3 extensions.vector;  -- huellas de los últimos 3 elegidos
  v_c1 text; v_c2 text; v_c3 text;                                         -- categorías de los últimos 3
  v_emb extensions.vector;
  i int := 0;
begin
  perform public.refresh_my_taste(false);
  select * into v_taste from public.user_taste where user_id = v_uid;
  select * into v_profile from public.profiles where id = v_uid;

  -- Cuánto confiar en lo aprendido: crece con la evidencia
  v_alpha := coalesce(v_taste.n_pos, 0) / (coalesce(v_taste.n_pos, 0) + 4.0);
  v_short := case when v_taste.short_vec is not null then 1 else 0 end;

  drop table if exists _rec_cand;
  create temp table _rec_cand (
    id uuid primary key,
    pr public.products,
    category_slug text,
    emb extensions.vector(512),
    score real,
    explore_score real,
    unknown_cat boolean,
    c_sim real, c_short real, c_cat real, c_style real, c_traits real, c_manual real, c_ctx real,
    c_sel real, c_price real, c_dist real, c_flash real, c_new real, c_pop real, c_collab real,
    style text, material text, ctx_reason text, comuna text
  ) on commit drop;

  insert into _rec_cand
  with prefs as (
    select trait, adjust from public.user_trait_prefs where user_id = v_uid
  ),
  ctx as (
    select cp.trait, sum(cp.weight) as w, min(mc.reason) as reason
    from public.context_priors cp
    join public.moving_contexts mc on mc.slug = cp.context
    where cp.context = any (coalesce(v_profile.context, '{}'))
    group by cp.trait
  ),
  sel as (
    select category_slug from public.user_categories where user_id = v_uid and selected
  ),
  sat as (
    -- Si ya compró algo de esa categoría hace poco, no insistir
    select distinct p2.category_slug
    from public.user_events e join public.products p2 on p2.id = e.product_id
    where e.user_id = v_uid and e.kind = 'purchase' and e.created_at > now() - interval '21 days'
  ),
  pop as (select * from public.product_popularity()),
  col as (select * from public.collab_scores()),
  me_geo as (select g.lat, g.lng from public.comuna_geo g where g.name = v_profile.comuna),
  base as (
    select pr, f.attributes as attrs,
           case when f.model is not distinct from v_taste.model then f.embedding end as emb,
           public.product_traits(pr.category_slug, pr.condition, f.attributes) as traits,
           public.current_price(pr) as price,
           extract(epoch from now() - pr.created_at) / 86400.0 as age_days
    from public.products pr
    left join public.product_features f on f.product_id = pr.id
    where pr.status = 'available'
      and public.available_units(pr) > 0
      and (not v_filter or pr.category_slug = any (p_categories))
      and (p_exclude is null or pr.id <> all (p_exclude))
      and not exists (select 1 from public.swipes s where s.user_id = v_uid and s.product_id = pr.id)
      -- Categorías silenciadas no aparecen (salvo que las filtre a propósito)
      and (v_filter or not exists (
        select 1 from prefs where prefs.adjust = -1 and prefs.trait = 'category:' || pr.category_slug))
  ),
  sims as (
    select b.*,
      case when v_taste.long_vec is not null and b.emb is not null then 1 - (b.emb <=> v_taste.long_vec) end as s_long,
      case when v_taste.short_vec is not null and b.emb is not null then 1 - (b.emb <=> v_taste.short_vec) end as s_short,
      case when v_taste.neg_vec is not null and b.emb is not null then 1 - (b.emb <=> v_taste.neg_vec) end as s_neg
    from base b
  ),
  z as (
    -- Normaliza los parecidos dentro de los candidatos (sirve con cualquier modelo de huellas)
    select s.*,
      (s.s_long - avg(s.s_long) over ()) / nullif(stddev_pop(s.s_long) over (), 0) as z_long,
      (s.s_short - avg(s.s_short) over ()) / nullif(stddev_pop(s.s_short) over (), 0) as z_short,
      (s.s_neg - avg(s.s_neg) over ()) / nullif(stddev_pop(s.s_neg) over (), 0) as z_neg
    from sims s
  ),
  parts as (
    select z.*,
      (z.pr).id as pid,
      (z.pr).category_slug as cat,
      coalesce((v_taste.traits -> ('category:' || (z.pr).category_slug) ->> 'n')::real, 0) as cat_n,
      v_alpha * 0.9 * greatest(-2, least(2.5, coalesce(z.z_long, 0)))
        - v_alpha * 0.5 * greatest(0, least(2.5, coalesce(z.z_neg, 0))) as c_sim,
      v_short * 0.7 * greatest(-1.5, least(2.5, coalesce(z.z_short, 0))) as c_short,
      2.0 * coalesce((v_taste.traits -> ('category:' || (z.pr).category_slug) ->> 'a')::real, 0) as c_cat,
      (select coalesce(max(1.4 * (v_taste.traits -> t ->> 'a')::real), 0)
         from unnest(z.traits) t where t like 'style:%' and v_taste.traits ? t) as c_style,
      (select coalesce(sum(public.trait_weight(t) * (v_taste.traits -> t ->> 'a')::real), 0)
         from unnest(z.traits) t
         where (t like 'room:%' or t like 'material:%' or t like 'color:%' or t like 'size:%' or t like 'condition:%')
           and v_taste.traits ? t) as c_traits,
      (select coalesce(sum(case pf.adjust when 1 then 1.5 else -4 end), 0)
         from unnest(z.traits) t join prefs pf on pf.trait = t) as c_manual,
      (select coalesce(sum(ctx.w), 0) from unnest(z.traits) t join ctx on ctx.trait = t) as c_ctx,
      (select min(ctx.reason) from unnest(z.traits) t join ctx on ctx.trait = t and ctx.w > 0) as ctx_reason,
      case when exists (select 1 from sel where sel.category_slug = (z.pr).category_slug) then 0.8 else 0 end as c_sel,
      -- Precio: el rango que realmente le gusta + su presupuesto
      (case when v_taste.price_mu is not null and coalesce(v_taste.n_pos, 0) >= 3 and z.price > 0
            then 0.9 * (exp(-power(ln(z.price) - v_taste.price_mu, 2) / (2 * power(v_taste.price_sigma, 2))) - 0.4)
            else 0 end)
      + (case when v_profile.budget_max is null then 0
              when z.price <= v_profile.budget_max then 0.3
              else -1.5 * least(1.0, (z.price - v_profile.budget_max)::real / greatest(v_profile.budget_max, 1) + 0.3) end) as c_price,
      (select 0.7 * exp(-(111.2 * sqrt(power(g.lat - mg.lat, 2) + power((g.lng - mg.lng) * cos(radians(mg.lat)), 2))) / 8.0)
         from public.comuna_geo g, me_geo mg where g.name = (z.pr).comuna) as c_dist,
      case when (z.pr).flash_until > now() and (z.pr).flash_price is not null then 0.6 else 0 end as c_flash,
      0.9 * exp(-z.age_days / 5.0) as c_new,
      coalesce((select 0.8 * ((pop.likes + 1) / (pop.likes + pop.passes + 3) - 0.4) + 0.05 * ln(1 + pop.views)
                  from pop where pop.product_id = (z.pr).id), 0) as c_pop,
      coalesce((select 0.8 * ln(1 + col.score) from col where col.product_id = (z.pr).id), 0) as c_collab,
      case when exists (select 1 from sat where sat.category_slug = (z.pr).category_slug) then -1.2 else 0 end as c_sat,
      (select min(substr(t, 7)) from unnest(z.traits) t
         where t like 'style:%' and coalesce((v_taste.traits -> t ->> 'a')::real, 0) > 0.15) as style,
      (select min(substr(t, 10)) from unnest(z.traits) t
         where t like 'material:%' and coalesce((v_taste.traits -> t ->> 'a')::real, 0) > 0.15) as material
    from z
  )
  select pid, pr, cat, emb,
    (c_sim + c_short + c_cat + c_style + c_traits + c_manual + c_ctx + c_sel + c_price
      + coalesce(c_dist, 0) + c_flash + c_new + c_pop + c_collab + c_sat
      -- Exploración (tipo Thompson): más azar donde aún sabemos poco
      + random() * (0.35 + 1.0 / (1.0 + cat_n)))::real,
    (c_new + c_pop + c_manual + c_ctx + random() * 1.5)::real,
    cat_n < 1.0,
    c_sim, c_short, c_cat, c_style, c_traits, c_manual, c_ctx, c_sel, c_price, coalesce(c_dist, 0),
    c_flash, c_new, c_pop, c_collab, style, material, ctx_reason, (pr).comuna
  from parts;

  -- Solo los mejores candidatos pasan a la selección final (más rápido)
  delete from _rec_cand c
  where c.id not in (select k.id from _rec_cand k order by k.score desc limit 150)
    and c.id not in (select k.id from _rec_cand k where k.unknown_cat order by k.explore_score desc limit 30);
  analyze _rec_cand;

  -- Elegir uno por uno: el mejor puntaje, pero sin repetir lo mismo seguido
  -- y dejando ~1 de cada 6 lugares para explorar categorías que no conoce.
  while i < v_limit loop
    v_id := null;
    v_is_explore := false;

    if i % 6 = 4 and coalesce(v_taste.n_events, 0) >= 5 and not v_filter then
      select c.id, c.category_slug into v_id, v_cat
      from _rec_cand c
      where c.unknown_cat and c.id <> all (v_picked) and c.c_manual >= 0
      order by c.explore_score desc
      limit 1;
      v_is_explore := v_id is not null;
    end if;

    if v_id is null then
      select c.id, c.category_slug into v_id, v_cat
      from _rec_cand c
      where c.id <> all (v_picked)
      order by c.score
        - 1.5 * ((c.category_slug is not distinct from v_c1)::int
               + (c.category_slug is not distinct from v_c2)::int
               + (c.category_slug is not distinct from v_c3)::int)
        - case when c.emb is not null and (
                 (v_e1 is not null and (c.emb <=> v_e1) < 0.06)
              or (v_e2 is not null and (c.emb <=> v_e2) < 0.06)
              or (v_e3 is not null and (c.emb <=> v_e3) < 0.06)) then 1.0 else 0 end
        desc
      limit 1;
    end if;

    exit when v_id is null;

    -- Por qué se muestra: el componente que más aportó
    select case
      when v_is_explore then 'Algo distinto, para conocerte mejor'
      else (
        select r.txt from (values
          (c.c_collab, 'A gente con gustos como los tuyos le encantó'),
          (greatest(c.c_sim, c.c_short), 'sim'),
          (c.c_manual, 'Pediste ver más de esto'),
          (c.c_style, 'Porque te gusta el estilo ' || c.style),
          (c.c_cat * 0.9, 'Porque te gusta ' || lower(coalesce((select name from public.categories where slug = c.category_slug), c.category_slug))),
          (c.c_traits, case when c.material is not null then 'Te gustan las cosas de ' || c.material end),
          (c.c_ctx, c.ctx_reason),
          (c.c_sel, 'Elegiste ' || lower(coalesce((select name from public.categories where slug = c.category_slug), '')) || ' al empezar'),
          (c.c_price, 'En el rango de precio que te gusta'),
          (c.c_dist, 'Cerca de ti, en ' || c.comuna),
          (c.c_flash, 'Oferta relámpago'),
          (c.c_new, 'Recién llegado'),
          (c.c_pop, 'Está gustando harto')
        ) as r(v, txt)
        where r.txt is not null and r.v > 0.25
        order by r.v desc
        limit 1)
      end
    into v_reason
    from _rec_cand c where c.id = v_id;

    -- "Parecido a <algo que te gustó>"
    if v_reason = 'sim' then
      select 'Parecido a "' || p2.title || '", que te gustó'
      into v_reason
      from public.user_events e
      join public.product_features f2 on f2.product_id = e.product_id and f2.model is not distinct from v_taste.model
      join public.products p2 on p2.id = e.product_id
      cross join (select emb from _rec_cand where id = v_id) me
      where e.user_id = v_uid and e.kind in ('like', 'superlike', 'checkout', 'purchase')
        and e.product_id <> v_id and me.emb is not null and f2.embedding is not null
      order by f2.embedding <=> me.emb
      limit 1;
      v_reason := coalesce(v_reason, 'Parecido a lo que te gusta');
    end if;

    select emb into v_emb from _rec_cand where id = v_id;
    v_e3 := v_e2; v_e2 := v_e1; v_e1 := v_emb;
    v_c3 := v_c2; v_c2 := v_c1; v_c1 := v_cat;
    v_picked := v_picked || v_id;
    v_reasons := v_reasons || coalesce(v_reason, 'Para ti');
    v_explore := v_explore || v_is_explore;
    i := i + 1;
  end loop;

  return query
  select c.pr, c.score, u.reason, u.explore, u.pos::int
  from unnest(v_picked, v_reasons, v_explore) with ordinality as u(id, reason, explore, pos)
  join _rec_cand c on c.id = u.id
  order by u.pos;
end;
$$;
grant execute on function public.recommend(int, text[], uuid[]) to anon, authenticated;

-- get_feed sigue existiendo (mismos parámetros) y ahora usa el recomendador
create or replace function public.get_feed(p_limit int default 20, p_categories text[] default null)
returns setof public.products
language sql
volatile
security invoker
set search_path = ''
as $$
  select (r.product).* from public.recommend(p_limit, p_categories, null) r order by r.pos;
$$;
grant execute on function public.get_feed(int, text[]) to anon, authenticated;

-- -------------------------------------------------------------
-- Seguridad (RLS)
-- -------------------------------------------------------------
alter table public.recsys_config enable row level security;
alter table public.product_features enable row level security;
alter table public.comuna_geo enable row level security;
alter table public.moving_contexts enable row level security;
alter table public.context_priors enable row level security;
alter table public.user_events enable row level security;
alter table public.user_taste enable row level security;
alter table public.user_trait_prefs enable row level security;

drop policy if exists "config visible" on public.recsys_config;
create policy "config visible" on public.recsys_config for select using (true);

drop policy if exists "rasgos visibles" on public.product_features;
create policy "rasgos visibles" on public.product_features for select using (true);

drop policy if exists "comunas visibles" on public.comuna_geo;
create policy "comunas visibles" on public.comuna_geo for select using (true);

drop policy if exists "situaciones visibles" on public.moving_contexts;
create policy "situaciones visibles" on public.moving_contexts for select using (true);
drop policy if exists "admin gestiona situaciones" on public.moving_contexts;
create policy "admin gestiona situaciones" on public.moving_contexts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "priors visibles" on public.context_priors;
create policy "priors visibles" on public.context_priors for select using (true);
drop policy if exists "admin gestiona priors" on public.context_priors;
create policy "admin gestiona priors" on public.context_priors
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "mis eventos" on public.user_events;
create policy "mis eventos" on public.user_events
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "admin ve eventos" on public.user_events;
create policy "admin ve eventos" on public.user_events
  for select to authenticated using (public.is_admin());

drop policy if exists "mis gustos aprendidos" on public.user_taste;
create policy "mis gustos aprendidos" on public.user_taste
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "mis ajustes de gustos" on public.user_trait_prefs;
create policy "mis ajustes de gustos" on public.user_trait_prefs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Que la API (PostgREST) vea los cambios de inmediato
notify pgrst, 'reload schema';
