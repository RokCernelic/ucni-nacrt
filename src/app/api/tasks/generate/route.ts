import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { topicsOf, topicInfo, allCurricula } from '@/lib/tasks/topics';
import { genInstruction } from '@/lib/tasks/genOptions';
import { emptyTask, type TaskDraft, type AnswerKind, type TaskKind } from '@/lib/tasks/types';

export const maxDuration = 60;

/** Previdnostno čiščenje modelovega HTML-ja (urejevalnik ga ob shranjevanju še enkrat počisti). */
const cleanHtml = (h: string) => h
  .replace(/<\s*(script|style|iframe|object|embed|img)[\s\S]*?(<\/\s*\1\s*>|>)/gi, '')
  .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  .replace(/javascript:/gi, '');

const MODEL = 'claude-sonnet-5-5';
const ANSWER_KINDS: AnswerKind[] = ['mc', 'multi', 'tf', 'numeric', 'short', 'open'];
const KIND_IDS: TaskKind[] = ['racunska', 'besedilna', 'graficna', 'skica', 'eksperimentalna', 'povezovanje'];

const SIMILAR_SYSTEM = 'Si slovenski učitelj naravoslovja in tehnike v osnovni šoli. Pišeš naloge v lepi slovenščini, primerne za učence, strokovno pravilne. ' +
  'Dobiš obstoječo nalogo in seznam podpoglavij učnega načrta s standardi znanja. Ugotovi, v katero podpoglavje naloga spada in katere standarde preverja, nato napiši PODOBNO novo nalogo: ' +
  'ista tema, isti standardi, ista težavnost, Bloomova stopnja, vrsta in oblika odgovora, podobna dolžina in struktura, vendar z drugimi podatki, drugačnim kontekstom in drugim izidom (ne le zamenjane številke). ' +
  'Če so podane ZAHTEVANE SPREMEMBE, imajo prednost pred zahtevo po enakosti z originalom (npr. druga težavnost ali oblika odgovora). Za izbirne naloge (mc) podaj natanko toliko možnosti, kot jih zahteva naloga (običajno 4) in correct_index. ' +
  'Poskrbi, da so rešitev in odgovor pravilni (preveri račun). Uporabljaj SI enote. Odgovori SAMO s klicem orodja »ustvari_nalogo« (brez besedila).';

const COMPLETE_SYSTEM = 'Si slovenski učitelj naravoslovja in tehnike v osnovni šoli. Dobiš obstoječo nalogo (morda nepopolno ali nepravilno oblikovano) in seznam podpoglavij s standardi. ' +
  'Besedila naloge NE spreminjaj (razen da ločiš vprašanje od naštetih možnosti A), B), C) … ) — le dopolni manjkajoče: pravilno obliko odgovora (answer_kind) in možnosti s pravilnim odgovorom, ' +
  'kratek odgovor, rešitev s postopkom (preprost HTML, jasno razložena za učenca), podpoglavje in standarde, težavnost, Bloomovo stopnjo, vrste naloge, točke in čas. ' +
  'Že izpolnjene vrednosti prepiši nespremenjene. Če naloga vsebuje A) B) C) D) možnosti, jih vrni v polju options (brez črk), v body pa samo vprašanje. Rešitev preveri z računom. Odgovori SAMO s klicem orodja »ustvari_nalogo« (brez besedila).';

const VARIANT_SYSTEM = 'Si slovenski učitelj naravoslovja in tehnike v osnovni šoli. Dobiš obstoječo nalogo in seznam podpoglavij s standardi. ' +
  'Naredi MINIMALNO različico iste naloge (za drugo skupino učencev): besedilo, zgradba, podnaloge, kontekst, enote in oblika odgovora ostanejo enaki. ' +
  'Zamenjaj številske podatke (tako, da so smiselni in da račun še vedno lepo izide ali ima razumen rezultat), po želji lahko zamenjaš še kakšno besedo ali ime. ' +
  'Nič drugega ne spreminjaj. Če so možnosti izbirne, ostanejo enake po zgradbi (spremeni le številke in pravilni odgovor ustrezno preračunaj). ' +
  'Popolnoma na novo izračunaj odgovor in rešitev ter ju preveri. Težavnost, Bloomovo stopnjo, vrste, točke in minute prepiši iz originala. ' +
  'Podpoglavje in standarde določi enako kot pri originalu. Odgovori SAMO s klicem orodja »ustvari_nalogo« (brez besedila).';

const tool: Anthropic.Tool = {
  name: 'ustvari_nalogo',
  description: 'Vrne podobno novo nalogo in njeno umestitev v učni načrt.',
  input_schema: {
    type: 'object',
    properties: {
      topic_key: { type: ['string', 'null'], description: 'Ključ podpoglavja iz seznama, v katerega spada ORIGINALNA naloga (natančno kot v seznamu). Če je naloga že povezana, uporabi ta ključ.' },
      standard_ids: { type: 'array', items: { type: 'string' }, description: 'ID-ji standardov izbranega podpoglavja, ki jih nova naloga preverja (natančno kot v seznamu).' },
      body: { type: 'string', description: 'Besedilo nove naloge kot preprost HTML (<p>, <b>, <i>, <sub>, <sup>, <ul>/<ol>/<li>, <br>). Brez LaTeXa, brez slik. Podnaloge a), b), c) v svojih <p> z <b>a)</b>.' },
      answer_kind: { type: 'string', enum: ANSWER_KINDS },
      options: { type: 'array', items: { type: 'string' }, description: 'Besedila možnosti (za mc in multi; za tf pusti prazno).' },
      correct_index: { type: ['integer', 'null'], description: 'Indeks pravilne možnosti (mc: 0 = A …; tf: 0 = Drži, 1 = Ne drži).' },
      correct_indices: { type: 'array', items: { type: 'integer' }, description: 'Indeksi vseh pravilnih možnosti (samo za multi; 0 = A).' },
      correct_numeric: { type: ['string', 'null'], description: 'Pravilna številska vrednost (samo za numeric), npr. "42,5".' },
      unit: { type: ['string', 'null'] },
      tolerance: { type: ['number', 'null'], description: 'Dovoljen odmik za numeric (absolutni), sicer null.' },
      answer: { type: ['string', 'null'], description: 'Kratek končni odgovor (npr. "a) 420 N, b) 21 J, c) 21 J").' },
      solution: { type: ['string', 'null'], description: 'Postopek reševanja kot preprost HTML.' },
      difficulty: { type: 'integer', enum: [1, 2, 3] },
      bloom: { type: 'integer', enum: [1, 2, 3, 4, 5, 6] },
      kinds: { type: 'array', items: { type: 'string', enum: KIND_IDS } },
      points: { type: 'number' },
      minutes: { type: ['number', 'null'] },
      note: { type: 'string', description: 'Ena poved: v katerem poglavju je naloga in kaj preverja nova naloga.' },
    },
    required: ['topic_key', 'standard_ids', 'body', 'answer_kind', 'answer', 'solution', 'difficulty', 'bloom', 'kinds', 'points', 'note'],
  },
};

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Za generiranje se prijavi.' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: 'Na strežniku ni nastavljen ANTHROPIC_API_KEY.' }, { status: 503 });

  let src: Partial<TaskDraft>;
  let mode: 'similar' | 'variant' | 'complete' = 'similar';
  let changes: string[] = [];
  try {
    const req = await request.json() as { task?: Partial<TaskDraft>; mode?: string; mods?: unknown; extra?: unknown };
    src = req.task ?? {};
    if (req.mode === 'variant') mode = 'variant';
    else if (req.mode === 'complete') mode = 'complete';
    else {
      changes = (Array.isArray(req.mods) ? req.mods : []).map(m => genInstruction(String(m))).filter((x): x is string => !!x);
      const extra = typeof req.extra === 'string' ? req.extra.trim().slice(0, 600) : '';
      if (extra) changes.push(`Dodatno navodilo učitelja: ${extra}`);
    }
  } catch { return Response.json({ error: 'Neveljavna zahteva.' }, { status: 400 }); }
  if (!src.body || typeof src.body !== 'string') return Response.json({ error: 'Naloga nima besedila.' }, { status: 400 });

  // Kandidati za umestitev: podpoglavja (z standardi) predmeta naloge; če predmet ni znan, vsi predmeti.
  const known = (src.topics ?? []).filter(k => topicInfo(k));
  const currIds = src.curriculum ? [src.curriculum] : allCurricula().map(c => c.id);
  const candidates = known.length ? known.map(k => topicInfo(k)!) : currIds.flatMap(c => topicsOf(c));
  const catalog = candidates.map(t =>
    `[${t.key}] ${t.predmet}${t.grade ? `, ${t.grade}. razred` : ''} · poglavje ${t.chapter} · ${t.number} ${t.title}\n` +
    t.standards.map(s => `  - ${s.id}${s.minimalni ? ' (minimalni)' : ''}: ${s.text}`).join('\n')).join('\n');

  const original = {
    besedilo_html: src.body, vrsta_odgovora: src.answer_kind, moznosti: (src.options ?? []).map(o => o.text),
    pravilno: src.correct, enota: src.unit, odgovor: src.answer, resitev_html: src.solution,
    tezavnost: src.difficulty, bloom: src.bloom, vrste: src.kinds, tocke: src.points, minute: src.minutes,
  };

  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: mode === 'variant' ? VARIANT_SYSTEM : mode === 'complete' ? COMPLETE_SYSTEM : SIMILAR_SYSTEM,
      tools: [tool],
      tool_choice: { type: 'auto' }, // model ne podpira prisilne izbire orodja; sistemsko navodilo zahteva klic
      messages: [{
        role: 'user',
        content: `SEZNAM PODPOGLAVIJ IN STANDARDOV:\n${catalog}\n\nORIGINALNA NALOGA (JSON):\n${JSON.stringify(original, null, 2)}` +
          (changes.length ? `\n\nZAHTEVANE SPREMEMBE (uveljavi jih; vse ostalo naj ostane podobno originalu — tema, standardi; težavnost, Bloomovo stopnjo, vrsto, obliko odgovora, točke in minute pa uskladi z novo nalogo):\n${changes.map(c => `- ${c}`).join('\n')}` : ''),
      }],
    });
    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!block) return Response.json({ error: 'Model ni vrnil naloge.' }, { status: 502 });
    const o = block.input as Record<string, unknown>;

    const info = typeof o.topic_key === 'string' ? topicInfo(o.topic_key) : null;
    const validStd = new Set(info?.standards.map(s => s.id) ?? []);
    const kind = ANSWER_KINDS.includes(o.answer_kind as AnswerKind) ? o.answer_kind as AnswerKind : (src.answer_kind ?? 'open');
    const optTexts = Array.isArray(o.options) ? (o.options as unknown[]).map(String) : [];
    const ci = typeof o.correct_index === 'number' ? o.correct_index : null;
    let options: TaskDraft['options'] = null;
    let correct: string | null = null;
    if (kind === 'mc') {
      options = optTexts.map(text => ({ id: crypto.randomUUID(), text }));
      correct = ci !== null && options[ci] ? options[ci].id : null;
    } else if (kind === 'multi') {
      options = optTexts.map(text => ({ id: crypto.randomUUID(), text }));
      const idx = Array.isArray(o.correct_indices) ? (o.correct_indices as unknown[]).filter((n): n is number => typeof n === 'number') : [];
      correct = idx.map(i => options![i]?.id).filter(Boolean).join(',') || null;
    } else if (kind === 'tf') {
      options = [{ id: crypto.randomUUID(), text: 'Drži' }, { id: crypto.randomUUID(), text: 'Ne drži' }];
      correct = ci === 0 || ci === 1 ? options[ci].id : null;
    } else if (kind === 'numeric') {
      correct = typeof o.correct_numeric === 'string' ? o.correct_numeric : '';
    }
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const draft = emptyTask({
      body: cleanHtml(String(o.body ?? '')),
      answer: typeof o.answer === 'string' ? o.answer : null,
      solution: typeof o.solution === 'string' && o.solution ? cleanHtml(o.solution) : null,
      answer_kind: kind, options, correct,
      unit: typeof o.unit === 'string' ? o.unit : null,
      tolerance: kind === 'numeric' ? num(o.tolerance) : null,
      difficulty: ([1, 2, 3] as const).find(d => d === o.difficulty) ?? src.difficulty ?? null,
      bloom: ([1, 2, 3, 4, 5, 6] as const).find(d => d === o.bloom) ?? src.bloom ?? null,
      kinds: Array.isArray(o.kinds) ? (o.kinds as unknown[]).filter((k): k is TaskKind => KIND_IDS.includes(k as TaskKind)) : (src.kinds ?? []),
      curriculum: info?.curriculum ?? src.curriculum ?? null,
      topics: info ? [info.key] : (src.topics ?? []),
      chapters: info ? [] : (src.chapters ?? []),
      standards: Array.isArray(o.standard_ids) ? (o.standard_ids as unknown[]).map(String).filter(id => validStd.has(id)) : [],
      points: num(o.points) ?? src.points ?? 1,
      minutes: num(o.minutes) ?? src.minutes ?? null,
      source: 'ai', status: 'draft',
    });
    if (mode === 'complete') {
      // Že izpolnjeno ostane, kot je; model le dopolni manjkajoče.
      const keepKind = !['open', 'short'].includes(src.answer_kind ?? 'open');
      const sameKind = keepKind || draft.answer_kind === (src.answer_kind ?? 'open');
      const filled = (v: string | null | undefined) => !!v && v.replace(/<[^>]*>/g, '').trim() !== '';
      Object.assign(draft, {
        body: (draft.answer_kind === 'mc' || draft.answer_kind === 'multi') && src.answer_kind !== 'mc' && src.answer_kind !== 'multi' ? draft.body : src.body,
        answer_kind: keepKind ? src.answer_kind : draft.answer_kind,
        options: sameKind && src.options?.length ? src.options : draft.options,
        correct: sameKind && src.correct ? src.correct : draft.correct,
        unit: src.unit ?? draft.unit,
        tolerance: src.tolerance ?? draft.tolerance,
        answer: filled(src.answer) ? src.answer : draft.answer,
        solution: filled(src.solution) ? src.solution : draft.solution,
        difficulty: src.difficulty ?? draft.difficulty,
        bloom: src.bloom ?? draft.bloom,
        kinds: src.kinds?.length ? src.kinds : draft.kinds,
        curriculum: (src.topics ?? []).length ? src.curriculum : draft.curriculum,
        topics: (src.topics ?? []).length ? src.topics : draft.topics,
        chapters: (src.topics ?? []).length ? src.chapters : draft.chapters,
        standards: (src.standards ?? []).length ? src.standards : draft.standards,
        points: src.points ?? draft.points,
        minutes: src.minutes ?? draft.minutes,
        source: src.source ?? draft.source,
        status: src.status ?? draft.status,
      });
    }
    return Response.json({ draft, note: typeof o.note === 'string' ? o.note : '' });
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `Napaka API (${e.status}): ${e.message}` : e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 502 });
  }
}
