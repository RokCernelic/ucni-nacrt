-- Naloga se lahko poveže tudi samo s poglavjem učnega načrta (brez podpoglavja).
-- Ključ: '<curriculum>:<poglavjeId>' (enako kot topics: '<curriculum>:<podpoglavjeId>').
alter table public.tasks add column if not exists chapters text[] not null default '{}';
create index if not exists tasks_chapters on public.tasks using gin (chapters);
