-- Baza nalog in vprašanj — en vir za učni načrt, učne liste (tisk) in kvize.
-- Vsak učitelj vidi in ureja le svoje naloge (RLS po stolpcu owner).

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- vsebina (očiščen HTML; slike so URL-ji v vedru task-images)
  body         text not null,
  answer       text,                       -- končni odgovor / rešitev
  solution     text,                       -- postopek ali namig

  -- oblika odgovora: mc/tf/numeric gredo v kviz (samodejno ocenjevanje), short/open le na papir
  answer_kind  text not null default 'open' check (answer_kind in ('mc', 'tf', 'numeric', 'short', 'open')),
  options      jsonb,                      -- mc/tf: [{ "id": "...", "text": "..." }]
  correct      text,                       -- mc/tf: id pravilne možnosti; numeric: vrednost
  tolerance    numeric,                    -- numeric: dovoljeno ± odstopanje
  unit         text,                       -- numeric: enota (npr. N, m/s)

  -- razvrstitev
  difficulty   smallint check (difficulty between 1 and 3),   -- 1 lahka, 2 srednja, 3 zahtevna
  bloom        smallint check (bloom between 1 and 6),        -- prenovljena Bloomova taksonomija
  kinds        text[] not null default '{}',                  -- racunska, besedilna, graficna, skica, eksperimentalna, povezovanje
  curriculum   text,                                          -- id učnega načrta (npr. 'fizika')
  topics       text[] not null default '{}',                  -- podpoglavja: '<curriculum>:<podpoglavjeId>'
  standards    text[] not null default '{}',                  -- id-ji standardov znanja
  points       numeric not null default 1,
  minutes      smallint,
  source       text,                                          -- lastna, ucbenik, npz, tekmovanje, ai …
  tags         text[] not null default '{}',
  status       text not null default 'verified' check (status in ('draft', 'verified'))
);

create index if not exists tasks_owner on public.tasks (owner, updated_at desc);
create index if not exists tasks_topics on public.tasks using gin (topics);

alter table public.tasks enable row level security;
drop policy if exists tasks_owner_all on public.tasks;
create policy tasks_owner_all on public.tasks
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

create or replace function public.tasks_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.tasks_touch();

-- ───────────── slike nalog (skice, enačbe kot slike) ─────────────
-- Javno branje (URL je nenapovedljiv; slike se morajo videti tudi na iPadih učencev brez prijave
-- in pri tisku). Pisati sme vsak le v svojo mapo <uid>/….
insert into storage.buckets (id, name, public)
values ('task-images', 'task-images', true)
on conflict (id) do nothing;

drop policy if exists task_images_insert on storage.objects;
create policy task_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists task_images_delete on storage.objects;
create policy task_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-images' and (storage.foldername(name))[1] = auth.uid()::text);
