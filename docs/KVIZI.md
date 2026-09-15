# Kvizi — specifikacija (dogovorjeno 2026-09-15)

Plickers/Kahoot-slog kvizi v Učnem načrtu: kviz na zaslonu, učenci odgovarjajo na iPadih,
brez registracije učencev. Arhitektura sledi Sokrat handoffu (`AnswerEvent`, faze
`collecting → locked → revealed`), vir odgovorov v tej fazi je samo `web` (iPad).
Kamera/Plickers kartice: **ne**. Tiskani kvizi + AI uvoz: **faza 2** (isti model in točkovanje).

## Odločitve

| # | Tema | Odločitev |
|---|---|---|
| 1 | Prikaz na iPadu | Celotno vprašanje (besedilo, možnosti, slika) na vsakem iPadu |
| 2 | Vir resnice | Strežnik (Supabase tabele + Realtime) |
| 3 | Identiteta naprave | Brez prijave; RPC funkcije (`join_session` s kodo + PIN) vrnejo zasebni žeton naprave |
| 4 | ID učenca | Naključen 4-mestni PIN na učenca, dodeljen enkrat, nikoli se ne spremeni; natisljiv seznam. En PIN = en iPad na sejo |
| 5 | Tempo | Oboje, izbira ob zagonu seje: vodi učitelj / vsak sam |
| 6 | Tipi vprašanj | Izbirni (en pravilni; tudi drži/ne drži), številski (vejica = pika, toleranca), neobvezna slika |
| 7 | Odgovori, povratna info | Vodi učitelj: sprememba do zaklepa, velja zadnji; na iPadu le »odgovor prejet«. Vsak sam: sprememba do »Oddaj«, rezultat šele na koncu |
| 8 | Projektor | Med zbiranjem sedežni red »odgovoril / še ne«; po razkritju le anonimna porazdelitev. Imena + pravilno/napačno le v zasebnih rezultatih |
| 9 | Zaslon | Privzeto en (zrcaljen) zaslon z le javnimi podatki + gumb za ločeno okno predavatelja; upravljanje s telefona kasneje |
| 10 | Menjava naprave | Nova naprava čaka; učitelj potrdi »Jan se želi znova povezati — Dovoli?«; prejšnji odgovori ostanejo |
| 11 | Točkovanje | Točke na vprašanje (privzeto 1); rezultat = točke in %; brez samodejne ocene. Številski: vse ali nič. Neodgovorjeno = 0, prikazano ločeno |
| 12 | Organizacija | Ena globalna knjižnica kvizov (brez vezave na predmet). Seja = kviz + razred + način |
| 13 | Življenjski cikel | Zamudnik: vodi učitelj → trenutno vprašanje; vsak sam → od 1. vprašanja. Konec: samo učitelj; samodejni potek po 3 h neaktivnosti. Domače naloge z rokom: kasneje |
| 14 | Mešanje | Vodi učitelj: možnosti premešane na iPadu med zbiranjem; po zaklepu povsod izvirni vrstni red. Vsak sam: vprašanja + možnosti premešani (privzeto vklop, izklop na sejo), fiksno za učenca; kljukica »ohrani mesto« za možnosti. Rezultati vedno glede na izvirnik |
| 15 | Časovne omejitve | Brez |
| 16 | Konec za učenca | Samo skupni rezultat (točke, %). Nastavitev seje »pokaži rešitve na koncu« (privzeto izklop) doda pregled po vprašanjih |
| 17 | Rezultati | Stran seje: tabela učencev, statistika vprašanj, mreža učenec × vprašanje, CSV. Plus zgodovina učenca skozi leto in primerjava istega kviza med razredi |
| 18 | Knjižnica | Mape (z gnezdenjem), vsak kviz v eni mapi |

## Podatkovni model (Supabase)

- `quiz_folders` (id, owner, parent_id, name)
- `quizzes` (id, owner, folder_id, title, questions jsonb, created_at, updated_at, last_used_at)
  - vprašanje: `{ id, kind: 'mc'|'numeric', prompt, image?, options?: [{ id, text, keepPlace? }], correct, tolerance?, points }`
  - stabilni id-ji vprašanj/možnosti → mešanje ne vpliva na rezultate
- `quiz_sessions` (id, owner, quiz_id, class_id, class_name, mode, code, status, phase, current_index, quiz_snapshot jsonb, settings jsonb, last_activity_at, created_at, ended_at)
- `session_students` (session_id, student_id, name, pin, device_token, pending_token, …) — posnetek razreda ob zagonu
- `quiz_answers` (session_id, student_id, question_id, value, answered_at, submitted)
- Storage: `quiz-images`

Varnost: RLS — učitelj (owner) ima dostop do svojih vrstic. iPadi nimajo neposrednega dostopa do
tabel; uporabljajo le `SECURITY DEFINER` RPC funkcije, ki preverijo kodo seje + žeton naprave.
**Pravilni odgovori se na iPad nikoli ne pošljejo pred razkritjem.** PIN-i so v razrednem seznamu
(`useRoster`), ob zagonu seje se kopirajo v `session_students`.

## Vrstni red gradnje

1. **Temelj + knjižnica** — tabele in varnost, mape, urejevalnik kvizov (izbirni, številski, slika, točke), PIN-i v razrednem seznamu + tiskanje
2. **Seja, ki jo vodi učitelj** — koda/QR, prijava s PIN, vprašanje na iPadu, mreža »odgovoril«, zaklep → razkritje → naprej, potrditev menjave naprave, konec, skupni rezultat → **test v razredu**
3. **Vsak sam + stran rezultatov** — mešanje, oddaja, tabela/statistika/mreža/CSV, »pokaži rešitve«
4. **Zgodovina učenca + primerjava razredov + okno predavatelja**
