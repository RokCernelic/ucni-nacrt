#!/bin/zsh
export LC_ALL=C LANG=C
# Uporaba: zaženi lokalni PostgreSQL na portu 54329 (glej komentar v kvizi.test.sql), nato ./supabase/tests/run-kvizi-tests.sh
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
P=(psql -h localhost -p 54329 -U postgres)
$P -q -c "drop database if exists kvizi" -c "create database kvizi" >/dev/null
$P -d kvizi -q >/dev/null <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select on auth.users to authenticated;
SQL
$P -d kvizi -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/20260915120000_kvizi.sql" 2>&1 | grep -v NOTICE
# migracija mora biti ponovljiva
$P -d kvizi -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/20260915120000_kvizi.sql" 2>&1 | grep -v NOTICE; echo "migration re-run exit: ${pipestatus[1]}"
$P -d kvizi -f "$ROOT/supabase/tests/kvizi.test.sql" 2>&1 | grep -E "ok  |FAIL|ERROR|PASSED|NOTICE:  ok"
