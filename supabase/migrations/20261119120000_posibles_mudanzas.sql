-- =============================================================
-- MUVEO · Posibles mudanzas
-- Detecta a quien probablemente se va a cambiar de casa, le pregunta
-- "¿Te cambias de casa?" y, si dice que sí, le explica de a poco
-- (una idea por visita) cómo funcionan las mudanzas, el retiro gratis
-- y los créditos. El equipo ve la lista en Admin -> Mudanzas -> Posibles mudanzas.
--
-- Correr a mano en Supabase > SQL Editor. Se puede correr más de una vez.
-- Va después de 20261114100000_recomendador.sql y 20261116120000_carrito.sql.
-- =============================================================

-- -------------------------------------------------------------
-- Ajustes (una sola fila)
-- -------------------------------------------------------------
create table if not exists public.moving_lead_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  -- Puntaje (0 a 100) desde el que se le pregunta
  threshold int not null default 40 check (threshold between 1 and 100),
  -- Días hacia atrás que se miran
  window_days int not null default 30 check (window_days between 3 and 180),
  -- Si dice "No": cuántos días sin preguntarle de nuevo
  ask_again_no_days int not null default 120 check (ask_again_no_days between 7 and 730),
  -- Si dice "Más adelante": cuántos días
  ask_again_later_days int not null default 10 check (ask_again_later_days between 1 and 180),
  -- Texto del paso 4 (por ejemplo un descuento si reserva). Vacío = sin oferta.
  reminder_offer text not null default '' check (char_length(reminder_offer) <= 200),
  updated_at timestamptz not null default now()
);
insert into public.moving_lead_settings (id) values (1) on conflict (id) do nothing;
alter table public.moving_lead_settings enable row level security;
drop policy if exists "moving_lead_settings lectura" on public.moving_lead_settings;
create policy "moving_lead_settings lectura" on public.moving_lead_settings
  for select to anon, authenticated using (true);
grant select on public.moving_lead_settings to anon, authenticated;

-- -------------------------------------------------------------
-- Señales de visita (páginas que no son productos). Una por tipo y día.
-- -------------------------------------------------------------
create table if not exists public.moving_signals (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'pagina_mudanzas',   -- entró a /mudanzas
    'conocenos',         -- entró a /mudanzas/conocenos
    'cotizador',         -- abrió el cotizador
    'retiramos',         -- entró a /retiramos
    'solicitud_retiro',  -- pidió un retiro
    'reserva'            -- reservó una mudanza
  )),
  day date not null default (now() at time zone 'America/Santiago')::date,
  created_at timestamptz not null default now(),
  unique (user_id, kind, day)
);
create index if not exists moving_signals_user_idx on public.moving_signals (user_id, created_at desc);
alter table public.moving_signals enable row level security;
-- Se escriben con log_moving_signal() o desde el servidor; nadie las lee directo.

-- -------------------------------------------------------------
-- Cada persona en el flujo: qué respondió y en qué paso va
-- -------------------------------------------------------------
create table if not exists public.moving_leads (
  user_id uuid primary key references auth.users (id) on delete cascade,
  answer text check (answer in ('si', 'no', 'despues')),
  asked_at timestamptz,
  answered_at timestamptz,
  -- No se le vuelve a preguntar antes de esta fecha
  ask_after timestamptz,
  -- Cuándo se cambia (lo dice al responder "Sí")
  move_when text check (move_when in ('este_mes', 'proximo_mes', 'mas_adelante', 'no_se')),
  -- Pasos explicados: 0 = ninguno, 1 a 4 = el último mostrado, 5 = terminó o no quiere más
  step int not null default 0 check (step between 0 and 5),
  step_at timestamptz,
  step_closed_at timestamptz,
  -- Autorizó que le escribamos por WhatsApp o correo
  contact_ok boolean not null default false,
  contact_name text check (contact_name is null or char_length(contact_name) <= 80),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 30),
  -- Seguimiento del equipo
  team_status text not null default 'nuevo'
    check (team_status in ('nuevo', 'contactado', 'cotizo', 'reservo', 'descartado')),
  team_note text check (team_note is null or char_length(team_note) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.moving_leads enable row level security;
drop policy if exists "moving_leads propio" on public.moving_leads;
create policy "moving_leads propio" on public.moving_leads
  for select to authenticated using (user_id = auth.uid() or public.can_admin('mudanzas'));
drop policy if exists "moving_leads equipo" on public.moving_leads;
create policy "moving_leads equipo" on public.moving_leads
  for update to authenticated using (public.can_admin('mudanzas')) with check (public.can_admin('mudanzas'));
grant select, update on public.moving_leads to authenticated;

-- -------------------------------------------------------------
-- Puntaje: cuánto parece que se va a cambiar de casa (0 a 100)
-- Devuelve {"score": n, "reasons": ["…", …]}
-- -------------------------------------------------------------
create or replace function public.moving_score_for(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg public.moving_lead_settings;
  since timestamptz;
  pts int := 0;
  why text[] := '{}';
  n int;
  n2 int;
  ctx text[];
  home_cats text[] := array['muebles', 'electro', 'dormitorio', 'cocina'];
begin
  select * into cfg from public.moving_lead_settings where id = 1;
  since := now() - make_interval(days => coalesce(cfg.window_days, 30));

  -- 1) Mira o le gustan cosas grandes para la casa (muebles, electro, dormitorio, cocina o tamaño grande)
  select count(distinct e.product_id) into n
  from public.user_events e
  join public.products pr on pr.id = e.product_id
  left join public.product_features f on f.product_id = pr.id
  where e.user_id = p_user and e.created_at >= since
    and (e.kind in ('like', 'superlike', 'share', 'checkout')
         or (e.kind = 'view' and coalesce(e.value, 0) >= 6000))
    and (pr.category_slug = any(home_cats) or f.attributes->>'size' = 'grande');
  if n > 0 then
    pts := pts + least(30, n * 3);
    why := why || format('Interés en %s productos grandes para la casa', n);
  end if;

  -- 2) Mucho en poco tiempo: 5 o más de esos en una semana
  select count(distinct e.product_id) into n2
  from public.user_events e
  join public.products pr on pr.id = e.product_id
  where e.user_id = p_user and e.created_at >= now() - interval '7 days'
    and e.kind in ('view', 'like', 'superlike', 'share', 'checkout')
    and pr.category_slug = any(home_cats);
  if n2 >= 5 then
    pts := pts + 10;
    why := why || 'Mucho interés en la última semana'::text;
  end if;

  -- 3) Compró cosas para la casa
  select count(distinct e.product_id) into n
  from public.user_events e
  join public.products pr on pr.id = e.product_id
  where e.user_id = p_user and e.created_at >= since and e.kind = 'purchase'
    and pr.category_slug = any(home_cats);
  if n > 0 then
    pts := pts + least(24, n * 8);
    why := why || format('Compró %s cosas para la casa', n);
  end if;

  -- 4) Busca palabras de cambio de casa
  select count(*) into n
  from public.user_events e
  where e.user_id = p_user and e.created_at >= since and e.kind = 'search'
    and e.query ~* '(mudanz|cambio de casa|caja|embal|cart[oó]n|depa nuevo|casa nueva|arriendo)';
  if n > 0 then
    pts := pts + least(12, n * 6);
    why := why || 'Buscó cosas de cambio de casa'::text;
  end if;

  -- 5) Despacho a otra comuna que la de su perfil, o a varias comunas distintas
  select count(distinct c.comuna),
         count(*) filter (where p.comuna is not null and c.comuna is not null and c.comuna <> p.comuna)
    into n, n2
  from public.checkouts c
  left join public.profiles p on p.id = c.user_id
  where c.user_id = p_user and c.created_at >= now() - interval '90 days'
    and c.delivery = 'despacho' and c.comuna is not null;
  if n >= 2 or n2 > 0 then
    pts := pts + 15;
    why := why || 'Pidió despacho a otra dirección'::text;
  end if;

  -- 6) Dijo en su perfil que se cambia (primer depa, casa nueva, algo más chico)
  select p.context into ctx from public.profiles p where p.id = p_user;
  if ctx && array['primer_depa', 'casa_nueva', 'achicando'] then
    pts := pts + 20;
    why := why || 'En su perfil dice que se cambia'::text;
  end if;

  -- 7) Páginas de mudanzas, retiros y cotizador
  select
    coalesce(sum(case s.kind
      when 'pagina_mudanzas' then 10 when 'conocenos' then 8 when 'cotizador' then 20
      when 'retiramos' then 8 when 'solicitud_retiro' then 15 when 'reserva' then 40 else 0 end), 0),
    count(*)
    into n, n2
  from public.moving_signals s
  where s.user_id = p_user and s.created_at >= since;
  if n > 0 then
    pts := pts + least(50, n);
    why := why || (select array_agg(distinct case s.kind
        when 'pagina_mudanzas' then 'Entró a la página de mudanzas'
        when 'conocenos' then 'Entró a Conócenos'
        when 'cotizador' then 'Abrió el cotizador'
        when 'retiramos' then 'Entró a retiros gratis'
        when 'solicitud_retiro' then 'Pidió un retiro'
        when 'reserva' then 'Reservó una mudanza' end)
      from public.moving_signals s where s.user_id = p_user and s.created_at >= since);
  end if;

  return jsonb_build_object('score', least(100, pts), 'reasons', to_jsonb(why));
end;
$$;
revoke execute on function public.moving_score_for(uuid) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Registrar una visita (desde la web, solo para uno mismo)
-- -------------------------------------------------------------
create or replace function public.log_moving_signal(p_kind text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_kind not in ('pagina_mudanzas', 'conocenos', 'cotizador', 'retiramos') then
    return;
  end if;
  insert into public.moving_signals (user_id, kind) values (auth.uid(), p_kind)
  on conflict (user_id, kind, day) do nothing;
end;
$$;
revoke execute on function public.log_moving_signal(text) from public, anon;
grant execute on function public.log_moving_signal(text) to authenticated;

-- ¿Tiene una mudanza reservada (pedida o confirmada, de hoy en adelante)?
create or replace function public.has_upcoming_booking(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
    where b.user_id = p_user and b.status in ('requested', 'confirmed')
      and b.day >= (now() at time zone 'America/Santiago')::date
  );
$$;
revoke execute on function public.has_upcoming_booking(uuid) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Qué mostrarle ahora a quien navega.
-- Devuelve {"show": "pregunta" | "paso" | null, "step": n, "offer": "…"}
-- Un paso nuevo por día de visita (Chile). Avanza solo.
-- -------------------------------------------------------------
create or replace function public.moving_prompt_state()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cfg public.moving_lead_settings;
  lead public.moving_leads;
  today date := (now() at time zone 'America/Santiago')::date;
  booked boolean;
  next_step int;
  sc int;
begin
  if uid is null then return jsonb_build_object('show', null); end if;
  select * into cfg from public.moving_lead_settings where id = 1;
  if cfg.id is null or not cfg.enabled then return jsonb_build_object('show', null); end if;
  select * into lead from public.moving_leads where user_id = uid;

  -- Ya dijo que sí: un paso por visita
  if lead.answer = 'si' then
    if lead.step >= 5 then return jsonb_build_object('show', null); end if;
    -- El paso de hoy ya se mostró: se vuelve a mostrar solo si no lo cerró
    if lead.step_at is not null and (lead.step_at at time zone 'America/Santiago')::date = today then
      if lead.step_closed_at is null or lead.step_closed_at < lead.step_at then
        return jsonb_build_object('show', 'paso', 'step', lead.step, 'offer', cfg.reminder_offer);
      end if;
      return jsonb_build_object('show', null);
    end if;
    -- Toca el siguiente. Si ya tiene mudanza reservada, se salta "cotiza" y "recordatorio"
    booked := public.has_upcoming_booking(uid);
    next_step := lead.step + 1;
    if booked and next_step = 1 then next_step := 2; end if;
    if booked and next_step = 4 then next_step := 5; end if;
    update public.moving_leads
       set step = next_step, step_at = now(), updated_at = now(),
           team_status = case when booked and team_status in ('nuevo', 'contactado', 'cotizo') then 'reservo' else team_status end
     where user_id = uid;
    if next_step >= 5 then return jsonb_build_object('show', null); end if;
    return jsonb_build_object('show', 'paso', 'step', next_step, 'offer', cfg.reminder_offer);
  end if;

  -- Todavía no toca preguntarle de nuevo
  if lead.ask_after is not null and lead.ask_after > now() then
    return jsonb_build_object('show', null);
  end if;

  sc := (public.moving_score_for(uid)->>'score')::int;
  if sc < cfg.threshold then return jsonb_build_object('show', null); end if;

  insert into public.moving_leads (user_id, asked_at) values (uid, now())
  on conflict (user_id) do update set asked_at = now(), updated_at = now();
  return jsonb_build_object('show', 'pregunta');
end;
$$;
revoke execute on function public.moving_prompt_state() from public, anon;
grant execute on function public.moving_prompt_state() to authenticated;

-- -------------------------------------------------------------
-- Responder la pregunta: 'si' | 'no' | 'despues' | 'cerrar' (la X)
-- -------------------------------------------------------------
create or replace function public.moving_prompt_answer(
  p_answer text,
  p_when text default null,
  p_contact_ok boolean default false,
  p_name text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cfg public.moving_lead_settings;
  phone text := nullif(left(regexp_replace(coalesce(p_phone, ''), '[^0-9+ ]', '', 'g'), 30), '');
  nm text := nullif(left(btrim(coalesce(p_name, '')), 80), '');
begin
  if uid is null or p_answer not in ('si', 'no', 'despues', 'cerrar') then
    return jsonb_build_object('ok', false);
  end if;
  select * into cfg from public.moving_lead_settings where id = 1;

  insert into public.moving_leads (user_id) values (uid) on conflict (user_id) do nothing;

  if p_answer = 'si' then
    update public.moving_leads set
      answer = 'si', answered_at = now(), ask_after = null,
      move_when = case when p_when in ('este_mes', 'proximo_mes', 'mas_adelante', 'no_se') then p_when else null end,
      contact_ok = coalesce(p_contact_ok, false) and phone is not null,
      contact_name = coalesce(nm, contact_name),
      contact_phone = case when coalesce(p_contact_ok, false) then phone else null end,
      -- Se muestra el primer paso de inmediato (o el segundo si ya reservó)
      step = case when public.has_upcoming_booking(uid) then 2 else 1 end,
      step_at = now(), step_closed_at = null, updated_at = now()
    where user_id = uid;
  elsif p_answer = 'no' then
    update public.moving_leads set answer = 'no', answered_at = now(),
      ask_after = now() + make_interval(days => coalesce(cfg.ask_again_no_days, 120)), updated_at = now()
    where user_id = uid;
  elsif p_answer = 'despues' then
    update public.moving_leads set answer = 'despues', answered_at = now(),
      ask_after = now() + make_interval(days => coalesce(cfg.ask_again_later_days, 10)), updated_at = now()
    where user_id = uid;
  else
    -- Cerró con la X sin responder: se vuelve a preguntar en 3 días
    update public.moving_leads set ask_after = now() + interval '3 days', updated_at = now()
    where user_id = uid;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.moving_prompt_answer(text, text, boolean, text, text) from public, anon;
grant execute on function public.moving_prompt_answer(text, text, boolean, text, text) to authenticated;

-- Cerrar el paso de hoy ('cerrar') o no ver más pasos ('basta')
create or replace function public.moving_step_close(p_stop boolean default false)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.moving_leads
     set step_closed_at = now(),
         step = case when p_stop then 5 else step end,
         updated_at = now()
   where user_id = auth.uid() and answer = 'si';
$$;
revoke execute on function public.moving_step_close(boolean) from public, anon;
grant execute on function public.moving_step_close(boolean) to authenticated;

-- -------------------------------------------------------------
-- Lista para el admin (solo el servidor, después de revisar el permiso "mudanzas")
-- Incluye a quien está en el flujo y a quien tiene puntaje >= p_min_score.
-- -------------------------------------------------------------
create or replace function public.admin_moving_leads(p_min_score int default 15, p_limit int default 200)
returns table (
  user_id uuid,
  score int,
  reasons jsonb,
  answer text,
  answered_at timestamptz,
  move_when text,
  step int,
  contact_ok boolean,
  contact_name text,
  contact_phone text,
  team_status text,
  team_note text,
  known_name text,
  known_email text,
  comuna text,
  has_booking boolean,
  last_activity timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (select coalesce(window_days, 30) as d from public.moving_lead_settings where id = 1),
  candidates as (
    select e.user_id from public.user_events e, cfg where e.created_at >= now() - make_interval(days => cfg.d)
    union
    select s.user_id from public.moving_signals s, cfg where s.created_at >= now() - make_interval(days => cfg.d)
    union
    select l.user_id from public.moving_leads l
  ),
  scored as (
    select c.user_id, public.moving_score_for(c.user_id) as sc from candidates c
  )
  select s.user_id,
         (s.sc->>'score')::int,
         s.sc->'reasons',
         l.answer, l.answered_at, l.move_when, coalesce(l.step, 0), coalesce(l.contact_ok, false),
         l.contact_name, l.contact_phone, coalesce(l.team_status, 'nuevo'), l.team_note,
         coalesce(nullif(p.display_name, ''),
                  (select ck.buyer_name from public.checkouts ck where ck.user_id = s.user_id order by ck.created_at desc limit 1),
                  (select b.contact_name from public.bookings b where b.user_id = s.user_id order by b.created_at desc limit 1)),
         coalesce(u.email,
                  (select ck.buyer_email from public.checkouts ck where ck.user_id = s.user_id order by ck.created_at desc limit 1)),
         p.comuna,
         public.has_upcoming_booking(s.user_id),
         greatest(
           (select max(e.created_at) from public.user_events e where e.user_id = s.user_id),
           (select max(m.created_at) from public.moving_signals m where m.user_id = s.user_id),
           l.updated_at)
  from scored s
  left join public.moving_leads l on l.user_id = s.user_id
  left join public.profiles p on p.id = s.user_id
  left join auth.users u on u.id = s.user_id
  where l.user_id is not null or (s.sc->>'score')::int >= p_min_score
  order by (l.answer = 'si') desc nulls last, (s.sc->>'score')::int desc
  limit greatest(1, least(p_limit, 1000));
$$;
revoke execute on function public.admin_moving_leads(int, int) from public, anon, authenticated;

notify pgrst, 'reload schema';
