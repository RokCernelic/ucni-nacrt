-- Rezultat natisnjenega kviza za učenca (QR koda): poleg njegovih odgovorov še anonimni odgovori razreda
-- (brez imen) za povprečje razreda in porazdelitev odgovorov po vprašanjih. Le za zaključeno sejo.
create or replace function public.quiz_paper_result(p_session uuid, p_student text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s record; st record; ans jsonb; cls jsonb;
begin
  select id, quiz_title, class_name, status, quiz, paper, created_at into s from public.quiz_sessions where id = p_session;
  if not found or s.paper is null then return jsonb_build_object('status', 'not_found'); end if;
  select student_id, name into st from public.quiz_session_students where session_id = p_session and student_id = p_student;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if s.status <> 'ended' then return jsonb_build_object('status', 'open', 'title', s.quiz_title); end if;
  select coalesce(jsonb_object_agg(question_id, value), '{}'::jsonb) into ans
    from public.quiz_answers where session_id = p_session and student_id = p_student;
  -- odgovori vseh sodelujočih učencev, anonimno (en objekt vprašanje → odgovor na učenca)
  select coalesce(jsonb_agg(m), '[]'::jsonb) into cls from (
    select coalesce((select jsonb_object_agg(a.question_id, a.value) from public.quiz_answers a
                     where a.session_id = p_session and a.student_id = x.student_id), '{}'::jsonb) as m
      from public.quiz_session_students x
     where x.session_id = p_session and x.student_id <> '__ucitelj__' and (x.submitted_at is not null or x.device_id is not null)
  ) t;
  return jsonb_build_object('status', 'ended', 'title', s.quiz_title, 'className', s.class_name, 'name', st.name,
    'createdAt', s.created_at, 'quiz', s.quiz, 'paper', s.paper, 'answers', ans, 'classAnswers', cls);
end $$;

grant execute on function public.quiz_paper_result(uuid, text) to anon, authenticated;
