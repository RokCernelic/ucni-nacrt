-- Testi za supabase/migrations/20260915120000_kvizi.sql (60 preverjanj).
-- Zagon na lokalnem PostgreSQL (brez Dockerja):
--   1) prazna baza + nadomestki za Supabase (vloge in auth.uid()) — glej supabase/tests/run-kvizi-tests.sh
--   2) psql -f supabase/migrations/20260915120000_kvizi.sql
--   3) psql -f supabase/tests/kvizi.test.sql   → na koncu izpiše »ALL SQL TESTS PASSED«
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');

create or replace function pg_temp.check(label text, cond boolean) returns text language plpgsql as $$
begin if cond is distinct from true then raise exception 'FAIL: %', label; end if; return 'ok  ' || label; end $$;

-- ── učitelj T1 ustvari sejo prek RLS ──
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into quiz_sessions (id, code, quiz_title, quiz, class_id, class_name, mode, show_solutions) values
('aaaaaaaa-0000-0000-0000-000000000001', 'ABC234', 'Sile', '{"questions":[
  {"id":"q1","kind":"mc","prompt":"Enota za silo?","points":1,"image":"data:image/jpeg;base64,xyz","options":[{"id":"o1","text":"kg"},{"id":"o2","text":"N"}],"correct":"o2"},
  {"id":"q2","kind":"numeric","prompt":"g?","points":2,"correct":"9,81","tolerance":0.05}
]}', 'm8a', '8A', 'teacher', false);
insert into quiz_session_students (session_id, student_id, name, pin) values
('aaaaaaaa-0000-0000-0000-000000000001','s1','Ana','8320'),
('aaaaaaaa-0000-0000-0000-000000000001','s2','Jan','9952');
select pg_temp.check('owner sees own session', (select count(*) from quiz_sessions) = 1);

-- ── drug učitelj T2 ne vidi ničesar ──
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.check('other teacher sees no sessions', (select count(*) from quiz_sessions) = 0);
select pg_temp.check('other teacher sees no students/pins', (select count(*) from quiz_session_students) = 0);
with u as (update quiz_sessions set phase='locked' returning 1) select pg_temp.check('other teacher cannot update', (select count(*) from u) = 0);
reset role;

-- ── anonimni iPad: brez neposrednega dostopa do tabel ──
set role anon;
do $$ begin perform count(*) from quiz_session_students; raise exception 'FAIL: anon read table'; exception when insufficient_privilege then raise notice 'ok  anon cannot read tables'; end $$;

-- prijava
select pg_temp.check('bad pin', quiz_join('abc234','0000','d0000000-0000-0000-0000-00000000000a')->>'status' = 'bad_pin');
select pg_temp.check('join (code case-insensitive)', quiz_join(' abc234 ','8320','d0000000-0000-0000-0000-00000000000a')->>'status' = 'joined');
select pg_temp.check('rejoin same device', quiz_join('ABC234','8320','d0000000-0000-0000-0000-00000000000a')->>'status' = 'joined');
select pg_temp.check('same PIN other device -> pending', quiz_join('ABC234','8320','d0000000-0000-0000-0000-00000000000b')->>'status' = 'pending');
select pg_temp.check('pending device state', quiz_state('ABC234','d0000000-0000-0000-0000-00000000000b')->>'status' = 'pending');
select pg_temp.check('unknown device not_joined', quiz_state('ABC234','d0000000-0000-0000-0000-0000000000ff')->>'status' = 'not_joined');
select pg_temp.check('no session', quiz_join('ZZZZZZ','8320','d0000000-0000-0000-0000-00000000000a')->>'status' = 'no_session');

-- stanje: brez pravilnih odgovorov
select pg_temp.check('state active teacher', quiz_state('ABC234','d0000000-0000-0000-0000-00000000000a')->>'status' = 'active');
select pg_temp.check('question has no correct', not (quiz_state('ABC234','d0000000-0000-0000-0000-00000000000a')->'question' ? 'correct'));
select pg_temp.check('question has no image blob', not (quiz_state('ABC234','d0000000-0000-0000-0000-00000000000a')->'question' ? 'image'));
select pg_temp.check('hasImage flag', (quiz_state('ABC234','d0000000-0000-0000-0000-00000000000a')->'question'->>'hasImage')::boolean);
select pg_temp.check('no correct anywhere in state json', position('"correct"' in quiz_state('ABC234','d0000000-0000-0000-0000-00000000000a')::text) = 0);
select pg_temp.check('image for joined device', quiz_image('ABC234','d0000000-0000-0000-0000-00000000000a','q1') like 'data:image%');
select pg_temp.check('no image for stranger', quiz_image('ABC234','d0000000-0000-0000-0000-0000000000ff','q1') is null);

-- odgovori
select pg_temp.check('mc invalid option rejected', quiz_answer('ABC234','d0000000-0000-0000-0000-00000000000a','q1','o9')->>'reason' = 'bad_value');
select pg_temp.check('mc answer ok', (quiz_answer('ABC234','d0000000-0000-0000-0000-00000000000a','q1','o1')->>'ok')::boolean);
select pg_temp.check('change answer ok', (quiz_answer('ABC234','d0000000-0000-0000-0000-00000000000a','q1','o2')->>'ok')::boolean);
select pg_temp.check('answer echoed', quiz_state('ABC234','d0000000-0000-0000-0000-00000000000a')->>'answer' = 'o2');
select pg_temp.check('not current question -> locked', quiz_answer('ABC234','d0000000-0000-0000-0000-00000000000a','q2','9.8')->>'reason' = 'locked');
select pg_temp.check('stranger cannot answer', quiz_answer('ABC234','d0000000-0000-0000-0000-0000000000ff','q1','o2')->>'reason' = 'not_joined');
reset role;

-- ── učitelj: zaklep, potrditev menjave naprave, naslednje vprašanje ──
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update quiz_sessions set phase = 'locked' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role; set role anon;
select pg_temp.check('answer after lock rejected', quiz_answer('ABC234','d0000000-0000-0000-0000-00000000000a','q1','o1')->>'reason' = 'locked');
reset role;
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.check('teacher sees pending device', (select pending_device from quiz_session_students where student_id='s1') = 'd0000000-0000-0000-0000-00000000000b');
select pg_temp.check('teacher reads answers', (select value from quiz_answers where student_id='s1' and question_id='q1') = 'o2');
update quiz_session_students set device_id = pending_device, pending_device = null where session_id='aaaaaaaa-0000-0000-0000-000000000001' and student_id='s1';
update quiz_sessions set phase='collecting', current_index=1 where id='aaaaaaaa-0000-0000-0000-000000000001';
reset role; set role anon;
select pg_temp.check('old device replaced', quiz_state('ABC234','d0000000-0000-0000-0000-00000000000a')->>'status' = 'not_joined');
select pg_temp.check('new device keeps earlier answers', quiz_state('ABC234','d0000000-0000-0000-0000-00000000000b')->>'status' = 'active');
select pg_temp.check('numeric too long rejected', quiz_answer('ABC234','d0000000-0000-0000-0000-00000000000b','q2', repeat('9',41))->>'reason' = 'bad_value');
select pg_temp.check('numeric answer (comma) ok', (quiz_answer('ABC234','d0000000-0000-0000-0000-00000000000b','q2','9,8')->>'ok')::boolean);
-- PIN brute force
select quiz_join('ABC234', lpad(i::text,4,'0'), 'd0000000-0000-0000-0000-0000000000cc') from generate_series(1,10) i \g /dev/null
select pg_temp.check('locked after 10 bad pins', quiz_join('ABC234','9952','d0000000-0000-0000-0000-0000000000cc')->>'status' = 'locked');
reset role;

-- ── konec seje: rezultat brez rešitev ──
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update quiz_sessions set status='ended', ended_at=now() where id='aaaaaaaa-0000-0000-0000-000000000001';
reset role; set role anon;
select pg_temp.check('ended status', quiz_state('ABC234','d0000000-0000-0000-0000-00000000000b')->>'status' = 'ended');
select pg_temp.check('score 3/3 (o2 + 9,8 within ±0.05)', quiz_state('ABC234','d0000000-0000-0000-0000-00000000000b')->>'points' = '3' and quiz_state('ABC234','d0000000-0000-0000-0000-00000000000b')->>'maxPoints' = '3');
select pg_temp.check('no review when solutions off', quiz_state('ABC234','d0000000-0000-0000-0000-00000000000b')->'review' = 'null'::jsonb);
select pg_temp.check('no join after end', quiz_join('ABC234','9952','d0000000-0000-0000-0000-00000000000e')->>'status' = 'no_session');
select pg_temp.check('no answer after end', quiz_answer('ABC234','d0000000-0000-0000-0000-00000000000b','q2','1')->>'reason' = 'ended');
reset role;

-- ── način »vsak sam« + pokaži rešitve + potek po 3 h ──
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into quiz_sessions (id, code, quiz_title, quiz, class_id, class_name, mode, show_solutions) values
('aaaaaaaa-0000-0000-0000-000000000002', 'ABC234', 'Sile 2', (select quiz from quiz_sessions where id='aaaaaaaa-0000-0000-0000-000000000001'), 'm8a', '8A', 'student', true);
insert into quiz_session_students (session_id, student_id, name, pin) values ('aaaaaaaa-0000-0000-0000-000000000002','s1','Ana','8320');
reset role; set role anon;
select pg_temp.check('code reusable after previous ended', quiz_join('ABC234','8320','d0000000-0000-0000-0000-000000000011')->>'status' = 'joined');
select pg_temp.check('student mode lists all questions', jsonb_array_length(quiz_state('ABC234','d0000000-0000-0000-0000-000000000011')->'questions') = 2);
select pg_temp.check('student mode no correct', position('"correct"' in quiz_state('ABC234','d0000000-0000-0000-0000-000000000011')::text) = 0);
select pg_temp.check('answer any question (q2 first)', (quiz_answer('ABC234','d0000000-0000-0000-0000-000000000011','q2','10')->>'ok')::boolean);
select pg_temp.check('answer q1', (quiz_answer('ABC234','d0000000-0000-0000-0000-000000000011','q1','o2')->>'ok')::boolean);
select pg_temp.check('clear answer (empty) ok', (quiz_answer('ABC234','d0000000-0000-0000-0000-000000000011','q2','')->>'ok')::boolean);
select pg_temp.check('cleared answer gone', not (quiz_state('ABC234','d0000000-0000-0000-0000-000000000011')->'answers' ? 'q2'));
select pg_temp.check('submit', (quiz_submit('ABC234','d0000000-0000-0000-0000-000000000011')->>'ok')::boolean);
select pg_temp.check('score after submit 1/3', quiz_state('ABC234','d0000000-0000-0000-0000-000000000011')->>'points' = '1');
select pg_temp.check('no correct after submit while session live', position('"correct"' in quiz_state('ABC234','d0000000-0000-0000-0000-000000000011')::text) = 0);
select pg_temp.check('answer after submit rejected', quiz_answer('ABC234','d0000000-0000-0000-0000-000000000011','q2','9.81')->>'reason' = 'submitted');
reset role;
update quiz_sessions set last_activity_at = now() - interval '4 hours' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
set role anon;
select pg_temp.check('expired after 3h inactivity -> ended', quiz_state('ABC234','d0000000-0000-0000-0000-000000000011')->>'status' = 'ended');
select pg_temp.check('review with solutions when on', jsonb_array_length(quiz_state('ABC234','d0000000-0000-0000-0000-000000000011')->'review') = 2 and quiz_state('ABC234','d0000000-0000-0000-0000-000000000011')->'review'->0->>'correct' = 'o2');
reset role;

-- ── enaka pravila točkovanja kot scoring.ts ──
select pg_temp.check('parse 12,45', quiz_parse_number('12,45') = 12.45);
select pg_temp.check('parse spaces', quiz_parse_number(' 1 000,5 ') = 1000.5);
select pg_temp.check('parse garbage null', quiz_parse_number('12a') is null);
select pg_temp.check('parse 1e3', quiz_parse_number('1e3') = 1000);
select pg_temp.check('tol inside', quiz_is_correct('{"kind":"numeric","correct":"9,81","tolerance":0.05}', '9.76'));
select pg_temp.check('tol outside', not quiz_is_correct('{"kind":"numeric","correct":"9,81","tolerance":0.05}', '9.7'));
select pg_temp.check('exact 0.3', quiz_is_correct('{"kind":"numeric","correct":"0.3","tolerance":0}', '0,3'));
select pg_temp.check('mc wrong', not quiz_is_correct('{"kind":"mc","correct":"o2"}', 'o1'));
select pg_temp.check('empty unanswered', not quiz_is_correct('{"kind":"mc","correct":"o2"}', ''));
select 'ALL SQL TESTS PASSED';
