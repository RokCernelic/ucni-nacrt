-- Novi obliki odgovora: vstavljanje besed (gap) in povezovanje (match).
alter table public.tasks drop constraint if exists tasks_answer_kind_check;
alter table public.tasks add constraint tasks_answer_kind_check
  check (answer_kind in ('mc', 'multi', 'tf', 'numeric', 'short', 'open', 'gap', 'match'));
