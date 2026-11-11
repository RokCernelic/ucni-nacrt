-- Rezultat natisnjenega kviza za učenca (QR koda na listu → /r/<seja>/<učenec>), brez prijave.
-- Vrne podatke le za ta list (seja + učenec iz QR kode) in šele, ko je seja zaključena; sicer le stanje.
create or replace function public.quiz_paper_result(p_session uuid, p_student text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s record; st record; ans jsonb;
begin
  select id, quiz_title, class_name, status, quiz, paper, created_at into s from public.quiz_sessions where id = p_session;
  if not found or s.paper is null then return jsonb_build_object('status', 'not_found'); end if;
  select student_id, name into st from public.quiz_session_students where session_id = p_session and student_id = p_student;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if s.status <> 'ended' then return jsonb_build_object('status', 'open', 'title', s.quiz_title); end if;
  select coalesce(jsonb_object_agg(question_id, value), '{}'::jsonb) into ans
    from public.quiz_answers where session_id = p_session and student_id = p_student;
  return jsonb_build_object('status', 'ended', 'title', s.quiz_title, 'className', s.class_name, 'name', st.name,
    'createdAt', s.created_at, 'quiz', s.quiz, 'paper', s.paper, 'answers', ans);
end $$;

grant execute on function public.quiz_paper_result(uuid, text) to anon, authenticated;
