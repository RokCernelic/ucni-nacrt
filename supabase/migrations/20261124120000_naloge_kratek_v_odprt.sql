-- Oblike odgovora so zdaj: ABCD (mc), več možnosti (multi), da / ne (tf), odprt odgovor (open; številski odgovor
-- 'numeric' ostane v podatkih ločen, ker se v kvizu točkuje samodejno). Stari »kratek odgovor« (short) postane odprt odgovor.
update public.tasks set answer_kind = 'open' where answer_kind = 'short';
