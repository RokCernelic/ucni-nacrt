-- Številski odgovori v kvizu: enaka pravila kot src/lib/quiz/scoring.ts (isCorrect).
--  - enota je lahko zapisana ali ne, s presledkom ali brez (»900 J«, »900J«); z drugo predpono se pretvori (»0,9 kJ«);
--    napačna enota (npr. »900 N« namesto J) ni pravilna;
--  - priznano je nenatančno ali napačno zaokroževanje: do 5 % odstopanja ali do ene enote zadnjega zapisanega mesta
--    (če ima število vsaj dve veljavni števki); učiteljeva toleranca velja, če je večja.

create or replace function public.quiz_unit_factor(u text, e text) returns numeric
language plpgsql immutable set search_path = public as $$
declare
  prefixes text[] := array['G', 'M', 'k', 'h', 'da', 'd', 'c', 'm', 'µ', 'μ', 'u'];
  factors numeric[] := array[1e9, 1e6, 1e3, 1e2, 1e1, 1e-1, 1e-2, 1e-3, 1e-6, 1e-6, 1e-6];
  a text; b text; ia int; ib int; fa numeric; fb numeric; ba text; bb text;
begin
  a := replace(replace(regexp_replace(coalesce(u, ''), '\s+', '', 'g'), '²', '2'), '³', '3');
  b := replace(replace(regexp_replace(coalesce(e, ''), '\s+', '', 'g'), '²', '2'), '³', '3');
  if a = '' or b = '' then return null; end if;
  if a = b then return 1; end if;
  for ia in 0..array_length(prefixes, 1) loop
    if ia = 0 then fa := 1; ba := a;
    elsif length(a) > length(prefixes[ia]) and left(a, length(prefixes[ia])) = prefixes[ia] then
      fa := factors[ia]; ba := substr(a, length(prefixes[ia]) + 1);
    else continue;
    end if;
    for ib in 0..array_length(prefixes, 1) loop
      if ib = 0 then fb := 1; bb := b;
      elsif length(b) > length(prefixes[ib]) and left(b, length(prefixes[ib])) = prefixes[ib] then
        fb := factors[ib]; bb := substr(b, length(prefixes[ib]) + 1);
      else continue;
      end if;
      if ba = bb then return fa / fb; end if;
    end loop;
  end loop;
  if lower(a) = lower(b) then return 1; end if; -- npr. »j« namesto »J«
  return null;
end $$;

create or replace function public.quiz_is_correct(q jsonb, v text) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  m text[]; t text; numtxt text; unit text; digits text;
  g numeric; e numeric; tol numeric; f numeric := 1; diff numeric; dec int;
begin
  if v is null or v = '' then return false; end if;
  if q->>'kind' = 'mc' then
    return (q->>'correct') is not null and v = q->>'correct';
  end if;
  if q->>'kind' = 'open' then return false; end if;

  t := btrim(translate(v, chr(160) || chr(8239) || chr(8201), '   '));
  m := regexp_match(t, '^([-+−]?(?:[0-9][0-9 ]*(?:[.,][0-9]+)?|[.,][0-9]+)(?:[eE][-+]?[0-9]+)?)\s*(.*)$');
  if m is null then return false; end if;
  numtxt := replace(replace(m[1], '−', '-'), ' ', '');
  g := public.quiz_parse_number(numtxt);
  e := public.quiz_parse_number(q->>'correct');
  if g is null or e is null then return false; end if;

  unit := btrim(m[2]);
  if unit <> '' and coalesce(q->>'unit', '') <> '' then
    f := public.quiz_unit_factor(unit, q->>'unit');
    if f is null then return false; end if; -- zapisana enota ne ustreza
    g := g * f;
  end if;

  diff := abs(g - e);
  tol := greatest(coalesce(public.quiz_parse_number(q->>'tolerance'), 0), 0);
  if diff <= tol + 1e-9 then return true; end if;
  if e <> 0 and diff <= 0.05 * abs(e) + 1e-9 then return true; end if;
  -- napačno zaokroženo: do ene enote zadnjega zapisanega mesta (vsaj dve veljavni števki)
  digits := ltrim(regexp_replace(regexp_replace(numtxt, '^[-+]', ''), '[.,]', ''), '0');
  if length(digits) >= 2 then
    dec := coalesce(length(substring(numtxt from '[.,]([0-9]+)')), 0);
    if diff <= power(10::numeric, -dec) * f + 1e-9 then return true; end if;
  end if;
  return false;
end $$;
