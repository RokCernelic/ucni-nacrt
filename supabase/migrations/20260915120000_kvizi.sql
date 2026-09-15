-- Kvizi (docs/KVIZI.md) — seje v živo za iPade brez prijave.
-- Učitelj (prijavljen) dostopa do svojih vrstic prek RLS.
-- iPadi NIMAJO dostopa do tabel; uporabljajo le SECURITY DEFINER funkcije quiz_*,
-- ki preverijo kodo seje + id naprave in NIKOLI ne vrnejo pravilnih odgovorov med sejo.

-- ───────────────────────── tabele ─────────────────────────

create table if not exists public.quiz_sessions (
  id               uuid primary key default gen_random_uuid(),
  owner            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code             text not null,
  quiz_id          text,
  quiz_title       text not null,
  quiz             jsonb not null,               -- posnetek vprašanj ob zagonu (s pravilnimi odgovori)
  class_id         text not null,
  class_name       text not null,
  mode             text not null check (mode in ('teacher', 'student')),
  shuffle          boolean not null default true,
  show_solutions   boolean not null default false,
  status           text not null default 'open' check (status in ('open', 'ended')),
  phase            text not null default 'collecting' check (phase in ('collecting', 'locked', 'revealed')),
  current_index    integer not null default 0,
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at         timestamptz
);
-- ista koda je lahko le enkrat odprta
create unique index if not exists quiz_sessions_open_code on public.quiz_sessions (code) where status = 'open';
create index if not exists quiz_sessions_owner on public.quiz_sessions (owner, created_at desc);

create table if not exists public.quiz_session_students (
  session_id     uuid not null references public.quiz_sessions (id) on delete cascade,
  student_id     text not null,
  name           text not null,
  pin            text not null,
  device_id      uuid,
  pending_device uuid,
  joined_at      timestamptz,
  submitted_at   timestamptz,
  primary key (session_id, student_id)
);
create unique index if not exists quiz_session_students_pin on public.quiz_session_students (session_id, pin);

create table if not exists public.quiz_answers (
  session_id  uuid not null,
  student_id  text not null,
  question_id text not null,
  value       text not null,
  answered_at timestamptz not null default now(),
  primary key (session_id, student_id, question_id),
  foreign key (session_id, student_id) references public.quiz_session_students (session_id, student_id) on delete cascade
);

-- zaščita pred ugibanjem PIN-ov (na napravo)
create table if not exists public.quiz_join_failures (
  session_id uuid not null references public.quiz_sessions (id) on delete cascade,
  device_id  uuid not null,
  fails      integer not null default 0,
  primary key (session_id, device_id)
);

-- ───────────────────────── RLS (učitelj = lastnik) ─────────────────────────

alter table public.quiz_sessions         enable row level security;
alter table public.quiz_session_students enable row level security;
alter table public.quiz_answers          enable row level security;
alter table public.quiz_join_failures    enable row level security;

drop policy if exists quiz_sessions_owner_all on public.quiz_sessions;
create policy quiz_sessions_owner_all on public.quiz_sessions
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists quiz_session_students_owner_all on public.quiz_session_students;
create policy quiz_session_students_owner_all on public.quiz_session_students
  for all to authenticated
  using (exists (select 1 from public.quiz_sessions s where s.id = session_id and s.owner = auth.uid()))
  with check (exists (select 1 from public.quiz_sessions s where s.id = session_id and s.owner = auth.uid()));

drop policy if exists quiz_answers_owner_select on public.quiz_answers;
create policy quiz_answers_owner_select on public.quiz_answers
  for select to authenticated
  using (exists (select 1 from public.quiz_sessions s where s.id = session_id and s.owner = auth.uid()));
-- quiz_join_failures: brez politik → dostop le prek funkcij

-- ───────────────────────── točkovanje (enaka pravila kot src/lib/quiz/scoring.ts) ─────────────────────────

create or replace function public.quiz_parse_number(t text) returns numeric
language plpgsql immutable set search_path = public as $$
declare s text;
begin
  if t is null then return null; end if;
  s := replace(regexp_replace(t, '\s+', '', 'g'), ',', '.');
  if s !~ '^[-+]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?$' then return null; end if;
  return s::numeric;
exception when others then
  return null;
end $$;

create or replace function public.quiz_is_correct(q jsonb, v text) returns boolean
language plpgsql immutable set search_path = public as $$
declare g numeric; e numeric; tol numeric;
begin
  if v is null or v = '' then return false; end if;
  if q->>'kind' = 'mc' then
    return (q->>'correct') is not null and v = q->>'correct';
  end if;
  g := public.quiz_parse_number(v);
  e := public.quiz_parse_number(q->>'correct');
  if g is null or e is null then return false; end if;
  tol := greatest(coalesce(public.quiz_parse_number(q->>'tolerance'), 0), 0);
  return abs(g - e) <= tol;
end $$;

-- vprašanje brez pravilnega odgovora, tolerance in slike (slika gre prek quiz_image)
create or replace function public.quiz_public_question(q jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select (q - 'correct' - 'tolerance' - 'image')
         || jsonb_build_object('hasImage', coalesce(q->>'image', '') <> '')
$$;

-- ───────────────────────── notranje pomožne ─────────────────────────

create or replace function public.quiz_open_session(p_code text) returns public.quiz_sessions
language sql stable security definer set search_path = public as $$
  select * from public.quiz_sessions
  where code = upper(trim(p_code))
  order by (status = 'open') desc, created_at desc
  limit 1
$$;

create or replace function public.quiz_is_live(s public.quiz_sessions) returns boolean
language sql stable set search_path = public as $$
  select s.id is not null and s.status = 'open' and s.last_activity_at > now() - interval '3 hours'
$$;

-- ───────────────────────── funkcije za iPad ─────────────────────────

-- Prijava s kodo seje + PIN. Vrne status: joined | pending | bad_pin | locked | no_session.
create or replace function public.quiz_join(p_code text, p_pin text, p_device uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s  public.quiz_sessions;
  st public.quiz_session_students;
  f  integer;
begin
  s := public.quiz_open_session(p_code);
  if p_device is null or not public.quiz_is_live(s) then
    return jsonb_build_object('status', 'no_session');
  end if;

  select fails into f from public.quiz_join_failures where session_id = s.id and device_id = p_device;
  if coalesce(f, 0) >= 10 then
    return jsonb_build_object('status', 'locked');
  end if;

  select * into st from public.quiz_session_students
  where session_id = s.id and pin = trim(p_pin)
  for update;

  if not found then
    insert into public.quiz_join_failures (session_id, device_id, fails) values (s.id, p_device, 1)
    on conflict (session_id, device_id) do update set fails = public.quiz_join_failures.fails + 1;
    return jsonb_build_object('status', 'bad_pin');
  end if;

  update public.quiz_sessions set last_activity_at = now() where id = s.id;

  if st.device_id is null or st.device_id = p_device then
    update public.quiz_session_students
       set device_id = p_device,
           pending_device = case when pending_device = p_device then null else pending_device end,
           joined_at = coalesce(joined_at, now())
     where session_id = s.id and student_id = st.student_id;
    return jsonb_build_object('status', 'joined', 'name', st.name);
  end if;

  -- PIN je že povezan na drugo napravo → učitelj mora potrditi
  update public.quiz_session_students set pending_device = p_device
   where session_id = s.id and student_id = st.student_id;
  return jsonb_build_object('status', 'pending', 'name', st.name);
end $$;

-- Stanje za napravo (brez pravilnih odgovorov med sejo).
create or replace function public.quiz_state(p_code text, p_device uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s        public.quiz_sessions;
  st       public.quiz_session_students;
  qs       jsonb;
  q        jsonb;
  total    integer;
  answers  jsonb;
  pts      numeric := 0;
  maxpts   numeric := 0;
  review   jsonb := '[]'::jsonb;
  base     jsonb;
  i        integer;
  v        text;
begin
  s := public.quiz_open_session(p_code);
  if s.id is null or p_device is null then
    return jsonb_build_object('status', 'no_session');
  end if;

  select * into st from public.quiz_session_students where session_id = s.id and device_id = p_device;
  if not found then
    if exists (select 1 from public.quiz_session_students where session_id = s.id and pending_device = p_device) then
      return jsonb_build_object('status', 'pending');
    end if;
    return jsonb_build_object('status', case when public.quiz_is_live(s) then 'not_joined' else 'no_session' end);
  end if;

  qs := coalesce(s.quiz->'questions', '[]'::jsonb);
  total := jsonb_array_length(qs);

  select coalesce(jsonb_object_agg(question_id, value), '{}'::jsonb) into answers
  from public.quiz_answers where session_id = s.id and student_id = st.student_id;

  base := jsonb_build_object(
    'status', case when public.quiz_is_live(s) then 'active' else 'ended' end,
    'title', s.quiz_title,
    'name', st.name,
    'mode', s.mode,
    'shuffle', s.shuffle,
    'seed', md5(s.id::text || ':' || st.student_id),
    'total', total,
    'submitted', st.submitted_at is not null
  );

  if not public.quiz_is_live(s) then
    -- konec: skupni rezultat (+ pregled po vprašanjih, če ga je učitelj vklopil)
    for i in 0 .. total - 1 loop
      q := qs->i;
      v := answers->>(q->>'id');
      maxpts := maxpts + coalesce((q->>'points')::numeric, 1);
      if public.quiz_is_correct(q, v) then pts := pts + coalesce((q->>'points')::numeric, 1); end if;
      if s.show_solutions then
        review := review || jsonb_build_array(public.quiz_public_question(q) || jsonb_build_object(
          'correct', q->'correct', 'tolerance', q->'tolerance',
          'yourAnswer', v, 'isCorrect', public.quiz_is_correct(q, v)));
      end if;
    end loop;
    return base || jsonb_build_object('points', pts, 'maxPoints', maxpts,
      'review', case when s.show_solutions then review else null end);
  end if;

  if s.mode = 'teacher' then
    q := qs->s.current_index;
    return base || jsonb_build_object(
      'phase', s.phase,
      'index', s.current_index,
      'question', case when q is null then null else public.quiz_public_question(q) end,
      'answer', case when q is null then null else answers->>(q->>'id') end);
  end if;

  -- vsak sam
  if st.submitted_at is not null then
    for i in 0 .. total - 1 loop
      q := qs->i;
      maxpts := maxpts + coalesce((q->>'points')::numeric, 1);
      if public.quiz_is_correct(q, answers->>(q->>'id')) then pts := pts + coalesce((q->>'points')::numeric, 1); end if;
    end loop;
    return base || jsonb_build_object('points', pts, 'maxPoints', maxpts);
  end if;

  return base || jsonb_build_object(
    'questions', (select coalesce(jsonb_agg(public.quiz_public_question(x) order by n), '[]'::jsonb)
                  from jsonb_array_elements(qs) with ordinality as t(x, n)),
    'answers', answers);
end $$;

-- Oddaja/sprememba odgovora. Prazna vrednost izbriše odgovor.
create or replace function public.quiz_answer(p_code text, p_device uuid, p_question_id text, p_value text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s  public.quiz_sessions;
  st public.quiz_session_students;
  q  jsonb;
begin
  s := public.quiz_open_session(p_code);
  if not public.quiz_is_live(s) then return jsonb_build_object('ok', false, 'reason', 'ended'); end if;

  select * into st from public.quiz_session_students where session_id = s.id and device_id = p_device;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_joined'); end if;

  select x into q from jsonb_array_elements(s.quiz->'questions') as t(x) where x->>'id' = p_question_id;
  if q is null then return jsonb_build_object('ok', false, 'reason', 'bad_question'); end if;

  if s.mode = 'teacher' then
    if s.phase <> 'collecting' or (s.quiz->'questions'->s.current_index->>'id') is distinct from p_question_id then
      return jsonb_build_object('ok', false, 'reason', 'locked');
    end if;
  elsif st.submitted_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'submitted');
  end if;

  if p_value is null or trim(p_value) = '' then
    delete from public.quiz_answers where session_id = s.id and student_id = st.student_id and question_id = p_question_id;
  else
    if q->>'kind' = 'mc' then
      if not exists (select 1 from jsonb_array_elements(q->'options') o where o->>'id' = p_value) then
        return jsonb_build_object('ok', false, 'reason', 'bad_value');
      end if;
    elsif length(p_value) > 40 then
      return jsonb_build_object('ok', false, 'reason', 'bad_value');
    end if;
    insert into public.quiz_answers (session_id, student_id, question_id, value)
    values (s.id, st.student_id, p_question_id, trim(p_value))
    on conflict (session_id, student_id, question_id)
    do update set value = excluded.value, answered_at = now();
  end if;

  update public.quiz_sessions set last_activity_at = now() where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

-- Oddaja celotnega kviza (način »vsak sam«).
create or replace function public.quiz_submit(p_code text, p_device uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.quiz_sessions;
begin
  s := public.quiz_open_session(p_code);
  if not public.quiz_is_live(s) or s.mode <> 'student' then return jsonb_build_object('ok', false); end if;
  update public.quiz_session_students set submitted_at = coalesce(submitted_at, now())
   where session_id = s.id and device_id = p_device;
  if not found then return jsonb_build_object('ok', false); end if;
  update public.quiz_sessions set last_activity_at = now() where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

-- Slika vprašanja (ločeno, da se ne prenaša ob vsakem osveževanju stanja).
create or replace function public.quiz_image(p_code text, p_device uuid, p_question_id text) returns text
language plpgsql stable security definer set search_path = public as $$
declare s public.quiz_sessions;
begin
  s := public.quiz_open_session(p_code);
  if s.id is null or not exists (select 1 from public.quiz_session_students where session_id = s.id and device_id = p_device) then
    return null;
  end if;
  return (select x->>'image' from jsonb_array_elements(s.quiz->'questions') as t(x) where x->>'id' = p_question_id);
end $$;

-- ───────────────────────── pravice ─────────────────────────

revoke all on function public.quiz_join(text, text, uuid)           from public;
revoke all on function public.quiz_state(text, uuid)                from public;
revoke all on function public.quiz_answer(text, uuid, text, text)   from public;
revoke all on function public.quiz_submit(text, uuid)               from public;
revoke all on function public.quiz_image(text, uuid, text)          from public;
revoke all on function public.quiz_open_session(text)               from public;

grant execute on function public.quiz_join(text, text, uuid)         to anon, authenticated;
grant execute on function public.quiz_state(text, uuid)              to anon, authenticated;
grant execute on function public.quiz_answer(text, uuid, text, text) to anon, authenticated;
grant execute on function public.quiz_submit(text, uuid)             to anon, authenticated;
grant execute on function public.quiz_image(text, uuid, text)        to anon, authenticated;

grant select, insert, update, delete on public.quiz_sessions, public.quiz_session_students to authenticated;
grant select on public.quiz_answers to authenticated;
