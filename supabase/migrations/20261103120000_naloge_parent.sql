-- Naloga, generirana iz druge naloge (podobna / zamenjane številke), se ugnezdi pod izvorno.
alter table public.tasks add column if not exists parent_id uuid references public.tasks (id) on delete set null;
create index if not exists tasks_parent on public.tasks (parent_id);
