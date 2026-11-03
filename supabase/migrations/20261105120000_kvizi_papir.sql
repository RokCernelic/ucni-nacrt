-- Natisnjeni kvizi: seja brez naprav (odgovori iz skenerja); posnetek razporeda za skener.
alter table public.quiz_sessions add column if not exists paper jsonb;

-- učitelj (lastnik seje) sme sam vpisati/popraviti odgovore (skener natisnjenih kvizov)
drop policy if exists quiz_answers_owner_write on public.quiz_answers;
create policy quiz_answers_owner_write on public.quiz_answers
  for all to authenticated
  using (exists (select 1 from public.quiz_sessions s where s.id = session_id and s.owner = auth.uid()))
  with check (exists (select 1 from public.quiz_sessions s where s.id = session_id and s.owner = auth.uid()));
