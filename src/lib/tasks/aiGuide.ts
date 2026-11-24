/**
 * »Navodila za AI« (JSON za prenos v bazi nalog): kako naj jezikovni model pripravi ali pregleda naloge, da jih
 * uvoziš z gumbom »⬆ Uvozi ZIP« (format ucni-nacrt-naloge, glej exportJson.ts) z vsemi metapodatki.
 * Vsebuje tudi katalog učnih načrtov (ključi poglavij, podpoglavij in standardov), da AI naloge pravilno umesti.
 */
import { CURRICULA } from '@/data/registry';
import { chaptersOf, topicsOf } from './topics';
import { JSON_FORMAT } from './exportJson';
import { ANSWER_KINDS, BLOOM, DIFFICULTY, KINDS, SOURCES } from './types';

export function buildAiGuide() {
  const catalog = CURRICULA.map(c => {
    const topics = topicsOf(c.id);
    return {
      curriculum: c.id,
      predmet: c.predmet.naslov,
      poglavja: chaptersOf(c.id).map(ch => {
        const pg = c.predmet.poglavja.find(p => `${c.id}:${p.id}` === ch.key);
        return {
          key: ch.key, stevilka: ch.number, naslov: ch.title, razred: ch.grade,
          podpoglavja: topics.filter(t => t.chapterKey === ch.key).map(t => {
            const pp = pg?.podpoglavja.find(p => `${c.id}:${p.id}` === t.key);
            return {
              key: t.key, stevilka: t.number, naslov: t.title,
              ...(pp?.cilji.length ? { cilji: pp.cilji.map(x => `${x.tip === 'I' ? '(izbirni) ' : ''}${x.text}`) } : {}),
              ...(pp?.noviPojmi?.length ? { noviPojmi: pp.noviPojmi } : {}),
              standardi: t.standards.map(s => ({ id: s.id, text: s.text, ...(s.minimalni ? { minimalni: true } : {}), ...(s.izbirni ? { izbirni: true } : {}) })),
            };
          }),
        };
      }),
    };
  });

  return {
    _opis: 'Navodila za AI: priprava in pregled nalog za uvoz v »Bazo nalog« aplikacije Učni načrt. To datoteko v celoti priloži pogovoru z AI (npr. Claude) skupaj z nalogami ali gradivom. AI naj vrne IZKLJUČNO datoteko JSON v obliki »izhodna_oblika«, ki jo nato uvoziš z gumbom »⬆ Uvozi ZIP« v bazi nalog (sprejme tudi .json).',
    ustvarjeno: new Date().toISOString(),

    vloga: 'Si izkušen učitelj fizike in tehnike v slovenski osnovni šoli in strokovnjak za preverjanje znanja. Pripravljaš naloge za bazo nalog: strokovno pravilne, jezikovno brezhibne (slovenski knjižni jezik, SI enote, decimalna vejica), primerne starosti učencev in v celoti opremljene z metapodatki.',

    delovni_postopek: {
      _opis: 'Uporabi glede na to, kaj prejmeš: (A) naloge iz drugih virov (učbenik, delovni zvezek, NPZ, tekmovanje, splet, fotografija, PDF, Word) ali (B) prošnjo za nove naloge.',
      A_pregled_zunanjih_nalog: [
        '1. PREPIS: vsako nalogo prepiši natančno in v celoti (besedilo, podatki, podvprašanja, možnosti). Ne izpuščaj podatkov. Če je naloga s fotografije ali skena, preveri vsako številko in enoto; nečitljiva mesta označi z [NEČITLJIVO] in nalogi daj status "draft".',
        '2. RAZDELITEV: naloga s podvprašanji a), b), c) ostane ENA naloga (podvprašanja v besedilu kot seznam <ol type="a"> ali odstavki »a) …«), razen če so podvprašanja povsem neodvisna — takrat jih razdeli v ločene naloge.',
        '3. STROKOVNI PREGLED: nalogo reši sam, korak za korakom. Preveri, ali so podatki zadostni in skladni, ali je rezultat smiseln (red velikosti, enota), ali je pri izbirnih nalogah natanko ena pravilna možnost (pri "multi" vse pravilne) in ali so napačne možnosti verjetne (tipične napake učencev). Če v izvirniku najdeš napako, jo popravi in to zapiši v "_opombe_ai".',
        '4. JEZIKOVNI PREGLED: popravi slovnico, pravopis in izrazje (»sila teže« ali »teža« po učnem načrtu, »hitrost«, ne »brzina«), oznake količin ležeče (<i>F</i>, <i>m</i>), enote pokončno s presledkom (5 N, 12,5 m/s), decimalna vejica, znak za množenje »·«.',
        '5. UMESTITEV: na podlagi »katalog_ucnih_nacrtov« izberi predmet (curriculum), podpoglavje ali več podpoglavij (topics — uporabi celoten ključ "key") in standarde znanja (standards — id-ji standardov IZ IZBRANIH podpoglavij), ki jih naloga dejansko preverja. Pomagaj si s cilji in novimi pojmi podpoglavja. Če naloga sodi k poglavju kot celoti in ne h kateremu podpoglavju, uporabi "chapters".',
        '6. DOPOLNITEV METAPODATKOV: določi answer_kind, pravilni odgovor (correct, answer), postopek rešitve (solution), tolerance in unit pri številskih odgovorih, difficulty, bloom, kinds, points, minutes, source in tags — po pravilih v »polja«. Nobeno polje, ki ga je mogoče smiselno določiti, naj ne ostane prazno.',
        '7. PRETVORBA OBLIKE (le če uporabnik to izrecno želi): npr. odprto nalogo spremeni v ABCD z dobrimi distraktorji. Sicer ohrani izvirno obliko naloge.',
        '8. DVOJNIKI: če se dve nalogi v gradivu razlikujeta le v številkah, ju uvozi obe; drugo poveži s prvo prek "parent_id".',
        '9. POROČILO: v "_porocilo_ai" na vrhu datoteke na kratko naštej, koliko nalog si pripravil, kaj si popravil in kje si negotov. Pri posamezni nalogi negotovosti zapiši v "_opombe_ai" (aplikacija polja z podčrtajem ne uvozi, služijo le tebi in uporabniku za pregled).',
      ],
      B_nove_naloge: [
        'Upoštevaj zahtevani predmet, razred, podpoglavje, obliko in težavnost. Naloge naj bodo raznolike (različne situacije iz vsakdanjega življenja, ne le menjava številk).',
        'Vsako nalogo sam reši in preveri, da je rezultat »lep« (smiselno zaokrožen) in fizikalno realističen.',
        'source = "ai", status = "draft" (učitelj jih pregleda pred uporabo).',
        'Variante iste naloge (npr. lažja / težja / druge številke) poveži z izvirno prek "parent_id".',
      ],
    },

    izhodna_oblika: {
      _opis: 'Natanko ta zgradba. Vrni veljaven JSON (brez komentarjev, brez besedila pred ali za njim). Ključi z »_« se ne uvozijo.',
      format: JSON_FORMAT,
      version: 1,
      exportedAt: '<datum in čas v obliki ISO 8601>',
      count: '<število nalog>',
      _porocilo_ai: '<kratko poročilo o pripravi in pregledu>',
      tasks: ['<naloge — glej »polja« in »primeri«>'],
    },

    polja: {
      id: 'Začasni enolični id naloge v tej datoteki, OBVEZNO s predpono "ai-", npr. "ai-001", "ai-002". (Če bi se id ujemal z obstoječo nalogo v bazi, bi jo uvoz prepisal — zato vedno "ai-".)',
      parent_id: 'id izvirne naloge v ISTI datoteki (npr. "ai-001"), če je ta naloga njena različica; sicer null.',
      body: 'Besedilo naloge v HTML. Dovoljene oznake: p, br, b, strong, i, em, u, sub, sup, ul, ol, li, table, thead, tbody, tr, th, td, span, div, img ter MathML (math, mi, mn, mo, mfrac, msup, msub, msqrt, mrow, mtext …). Količine ležeče (<i>v</i>), indeksi s <sub> (<i>F</i><sub>g</sub>), potence s <sup> (m/s<sup>2</sup>). Ulomke in zahtevnejše enačbe zapiši v MathML. Pri izbirnih nalogah možnosti NE piši v body (so v "options"). ⚠ Pri vstavljanju besed (gap) manjkajočo besedo zapiši v dvojnih oglatih oklepajih, npr. [[newton]] — ne kot črto ____ — sicer naloge ni mogoče shraniti. Brez slogov (style), razredov in skript.',
      slike: 'Slik ne izmišljuj. Če naloga potrebuje sliko, ki je nimaš kot spletni naslov (https://…), v body na tisto mesto zapiši <p><i>[SLIKA: natančen opis, kaj mora biti na sliki]</i></p>, dodaj oznako "manjka-slika" v tags in status "draft". Sliko učitelj doda v urejevalniku.',
      answer_kind: Object.fromEntries(ANSWER_KINDS.filter(k => k.id !== 'short').map(k => [k.id, k.name])),
      answer_kind_pravila: [
        'mc — ena pravilna možnost; options 3–5 možnosti; correct = id pravilne možnosti.',
        'multi — več pravilnih; correct = id-ji pravilnih, ločeni z vejico brez presledkov, npr. "b,d".',
        'tf — da / ne (trditev drži ali ne drži); options natanko [{"id":"d","text":"Drži"},{"id":"n","text":"Ne drži"}]; correct "d" ali "n"; body je ena nedvoumna trditev.',
        'numeric — odgovor je eno število; correct = število kot besedilo z decimalno vejico ali piko (npr. "12,5"); unit = enota (npr. "m/s") ali null; tolerance = dovoljeno absolutno odstopanje (npr. 0.1) ali null. Uporabi, kadar je končni rezultat eno število (tak odgovor se v kvizu točkuje samodejno).',
        'open — odprt odgovor: učenec odgovor zapiše sam (beseda, pojem, razlaga, izračun z več koraki, skica, graf); answer = pričakovani oz. vzorčni odgovor ali končni rezultat. Oblike »short« ne uporabljaj.',
        'gap — vstavljanje besed: kratko besedilo (ena do nekaj povedi), v katerem manjka ključna beseda ali besedna zveza; vsako manjkajočo besedo zapiši v body v DVOJNIH OGLATIH OKLEPAJIH, npr. "<p>Enota za silo je [[newton]].</p>" (učenec vidi črto ________). Praviloma ena vrzel, največ tri; manjkajo naj strokovni pojmi, ne mašila. options null, correct null, answer null (odgovor so besede v oklepajih).',
        'match — povezovanje: body = kratko navodilo (npr. "<p>Poveži količino z njeno enoto.</p>"); options = pari {"id","text": pojem v levem stolpcu, "match": pripadajoči pojem v desnem stolpcu}, praviloma 4–6 parov; odvečen pojem le v desnem stolpcu ima "text": "" (prazno). Aplikacija levi stolpec oštevilči, desnega označi s črkami in premeša. correct null, answer null.',
      ],
      options: 'Pri mc, multi, tf: seznam {"id": kratek id ("a","b","c" …), "text": besedilo možnosti brez črke}. Ne dodajaj »A)«; aplikacija sama doda črke in jih lahko premeša. Pri match: pari {"id", "text" (levo), "match" (desno)} — glej answer_kind_pravila. Pri ostalih oblikah null.',
      correct: 'Glej answer_kind_pravila. Pri open, gap in match null.',
      answer: 'Končni odgovor v HTML (npr. "<p><i>v</i> = 12,5 m/s</p>"). Pri izbirnih nalogah lahko kratko pojasnilo, zakaj je odgovor pravilen; sicer null.',
      solution: 'Postopek rešitve v HTML, po korakih: podatki (z enotami), iskana količina, enačba, vstavljanje, rezultat z enoto. Pri besedilnih nalogah ključne točke pravilnega odgovora. Za izbirne naloge kratko pojasni, zakaj so napačne možnosti napačne.',
      tolerance: 'Število ali null (le numeric).',
      unit: 'Besedilo ali null (le numeric).',
      difficulty: DIFFICULTY.map(d => `${d.level} = ${d.name}`).join(', ') + '. Merilo: 1 — en korak, neposredna uporaba znanja; 2 — dva ali trije koraki ali pretvorba enot; 3 — več korakov, povezovanje vsebin, nova situacija.',
      bloom: BLOOM.map(b => `${b.level} = ${b.name} (${b.hint})`).join('; ') + '. Izberi najvišjo raven, ki jo naloga dejansko zahteva.',
      kinds: 'Seznam (lahko več): ' + KINDS.map(k => `"${k.id}" (${k.name})`).join(', ') + '.',
      curriculum: 'id predmeta iz kataloga: ' + CURRICULA.map(c => `"${c.id}"`).join(' ali ') + '.',
      topics: 'Seznam CELIH ključev podpoglavij iz kataloga (polje "key", npr. "' + (topicsOf(CURRICULA[0].id)[0]?.key ?? 'fizika:…') + '"). Običajno eno, največ tri.',
      chapters: 'Seznam ključev poglavij (polje "key" poglavja) — le, če naloga sodi k poglavju v celoti in ne h kateremu podpoglavju; sicer [].',
      standards: 'Seznam id-jev standardov znanja, ki jih naloga preverja (npr. ["s2"]) — SAMO iz seznama "standardi" izbranega podpoglavja. POZOR: id-ji standardov (s1, s2 …) se ponavljajo v vsakem podpoglavju in veljajo le skupaj s podpoglavjem v topics; zato naloga s standardi naj ima praviloma eno podpoglavje. Običajno 1–2 standarda. Minimalni standardi so označeni z "minimalni": true.',
      points: 'Število točk: praviloma 1 na korak ali na pravilni podatek (ABCD in da/ne 1; vstavljanje besed 1 na vrzel; povezovanje 1 na par; računska z enim korakom 1–2; večkoračne 3–5).',
      minutes: 'Ocenjen čas reševanja v minutah za povprečnega učenca (celo število).',
      source: 'Vir: ' + SOURCES.map(s => `"${s.id}" (${s.name})`).join(', ') + '. Za prepisane naloge vir, iz katerega so; za nove "ai".',
      tags: 'Ključne besede za iskanje (male črke): pojmi, situacija, vir podrobneje (npr. "npz 2019", "učbenik str. 45"), "manjka-slika" ipd. NE uporabljaj oznak, ki se začnejo s "kviz:".',
      status: '"verified" za preverjene naloge iz zanesljivih virov, ki si jih le prepisal in opremil; "draft" za nove (AI) naloge, naloge z [NEČITLJIVO] ali [SLIKA: …] in vse, kjer si negotov.',
      _opombe_ai: 'Neobvezno: kratka opomba za učitelja (popravki izvirnika, negotovosti). Se ne uvozi.',
    },

    primeri: [
      {
        id: 'ai-001', parent_id: null,
        body: '<p>Kolesar prevozi 3,6 km v 12 minutah. Kolikšna je njegova povprečna hitrost v m/s?</p>',
        answer_kind: 'numeric', options: null, correct: '5', tolerance: 0.1, unit: 'm/s',
        answer: '<p><i>v</i> = 5 m/s</p>',
        solution: '<p><i>s</i> = 3,6 km = 3600 m, <i>t</i> = 12 min = 720 s</p><p><i>v</i> = <i>s</i> / <i>t</i> = 3600 m / 720 s = 5 m/s</p>',
        difficulty: 2, bloom: 3, kinds: ['racunska'],
        curriculum: 'fizika', topics: ['<ključ ustreznega podpoglavja iz kataloga>'], chapters: [], standards: ['<id standarda iz tega podpoglavja>'],
        points: 2, minutes: 3, source: 'ai', tags: ['hitrost', 'pretvarjanje enot', 'kolo'], status: 'draft',
      },
      {
        id: 'ai-002', parent_id: null,
        body: '<p>Katera enota je enota za silo?</p>',
        answer_kind: 'mc', options: [{ id: 'a', text: 'joule (J)' }, { id: 'b', text: 'newton (N)' }, { id: 'c', text: 'watt (W)' }, { id: 'd', text: 'pascal (Pa)' }],
        correct: 'b', tolerance: null, unit: null,
        answer: '<p>newton (N)</p>', solution: '<p>Sila se meri v newtonih. Joule je enota za delo in energijo, watt za moč, pascal za tlak.</p>',
        difficulty: 1, bloom: 1, kinds: ['besedilna'],
        curriculum: 'fizika', topics: ['<ključ podpoglavja>'], chapters: [], standards: [],
        points: 1, minutes: 1, source: 'ucbenik', tags: ['sila', 'enote'], status: 'verified',
      },
      {
        id: 'ai-003', parent_id: null,
        body: '<p>Telo, na katerega ne deluje nobena sila, se vedno ustavi.</p>',
        answer_kind: 'tf', options: [{ id: 'd', text: 'Drži' }, { id: 'n', text: 'Ne drži' }], correct: 'n', tolerance: null, unit: null,
        answer: null, solution: '<p>Ne drži. Brez sile telo miruje ali se giblje premo enakomerno (prvi Newtonov zakon).</p>',
        difficulty: 2, bloom: 2, kinds: ['besedilna'],
        curriculum: 'fizika', topics: ['<ključ podpoglavja>'], chapters: [], standards: [],
        points: 1, minutes: 1, source: 'ai', tags: ['sila', 'gibanje'], status: 'draft',
      },
      {
        id: 'ai-004', parent_id: 'ai-001',
        body: '<p>Avtomobil prevozi 54 km v 45 minutah. Kolikšna je njegova povprečna hitrost v m/s?</p>',
        answer_kind: 'numeric', options: null, correct: '20', tolerance: 0.1, unit: 'm/s',
        answer: '<p><i>v</i> = 20 m/s</p>',
        solution: '<p><i>s</i> = 54 km = 54 000 m, <i>t</i> = 45 min = 2700 s</p><p><i>v</i> = <i>s</i> / <i>t</i> = 54 000 m / 2700 s = 20 m/s</p>',
        difficulty: 2, bloom: 3, kinds: ['racunska'],
        curriculum: 'fizika', topics: ['<ključ podpoglavja>'], chapters: [], standards: [],
        points: 2, minutes: 3, source: 'ai', tags: ['hitrost', 'pretvarjanje enot', 'avto'], status: 'draft',
        _opombe_ai: 'Različica naloge ai-001 z drugimi podatki.',
      },
      {
        id: 'ai-005', parent_id: null,
        body: '<p>Telo, ki se giblje s stalno hitrostjo po premici, se giblje [[premo enakomerno]]. Pot, ki jo opravi v enoti časa, imenujemo [[hitrost]].</p>',
        answer_kind: 'gap', options: null, correct: null, tolerance: null, unit: null,
        answer: null, solution: null,
        difficulty: 1, bloom: 1, kinds: ['besedilna'],
        curriculum: 'fizika', topics: ['<ključ podpoglavja>'], chapters: [], standards: [],
        points: 2, minutes: 1, source: 'ai', tags: ['gibanje', 'hitrost'], status: 'draft',
      },
      {
        id: 'ai-006', parent_id: null,
        body: '<p>Poveži količino z njeno enoto.</p>',
        answer_kind: 'match',
        options: [{ id: 'a', text: 'sila', match: 'newton (N)' }, { id: 'b', text: 'delo', match: 'joule (J)' }, { id: 'c', text: 'moč', match: 'watt (W)' }, { id: 'd', text: 'tlak', match: 'pascal (Pa)' }, { id: 'x', text: '', match: 'kelvin (K)' }],
        correct: null, tolerance: null, unit: null,
        answer: null, solution: null,
        difficulty: 1, bloom: 1, kinds: ['povezovanje'],
        curriculum: 'fizika', topics: ['<ključ podpoglavja>'], chapters: [], standards: [],
        points: 4, minutes: 2, source: 'ai', tags: ['enote', 'količine'], status: 'draft',
        _opombe_ai: 'Kelvin je odvečen pojem v desnem stolpcu.',
      },
    ],

    preverjanje_pred_oddajo: [
      'JSON je veljaven (dvojni narekovaji, brez odvečnih vejic, brez komentarjev); "count" = število nalog.',
      'Vsak id je enoličen in se začne z "ai-"; vsak parent_id kaže na id v isti datoteki.',
      'Vsak ključ v topics, chapters in standards obstaja v katalogu (natančno ujemanje); standardi pripadajo izbranim podpoglavjem.',
      'Pri mc/tf je correct id ene od možnosti; pri multi so vsi id-ji v options; pri numeric je correct število.',
      'Pri gap ima body vsaj eno [[manjkajočo besedo]]; pri match ima vsaj dva para z izpolnjenima "text" in "match".',
      'Vsaka naloga je rešena in rešitev se ujema s correct / answer.',
      'Primerov iz »primeri« ne vključuj v izhod (razen če jih uporabnik izrecno želi).',
    ],

    katalog_ucnih_nacrtov: catalog,
  };
}

/** Prenese navodila kot »Navodila za AI — naloge.json«. */
export function downloadAiGuide() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(buildAiGuide(), null, 2)], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'Navodila za AI — naloge.json'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
