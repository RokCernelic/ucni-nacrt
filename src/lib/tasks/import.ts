/**
 * Uvoz nalog v bazo iz .tex (okolje `naloga` z oznakami) ali preprostega .txt
 * (primer: public/primer-naloge.txt).
 */
import { sanitizeRichHtml } from '@/lib/richText';
import { parseNumber } from '@/lib/quiz/scoring';
import { topicsOf, chaptersOf } from './topics';
import { emptyTask, type TaskDraft, type TaskKind, type BloomLevel, type Difficulty, type TaskOption } from './types';

export interface ImportResult {
  drafts: TaskDraft[];
  /** opozorila po nalogah (npr. neznano podpoglavje) */
  warnings: string[];
  errors: string[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const uid = () => crypto.randomUUID();
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** '6.1' (ali cel ključ 'fizika:delo-1') → ključ podpoglavja. */
function resolveTopic(curriculum: string, ref: string): string | null {
  const r = ref.trim();
  if (!r) return null;
  if (r.includes(':')) return topicsOf(r.split(':')[0]).some(t => t.key === r) ? r : null;
  return topicsOf(curriculum).find(t => t.number === r)?.key ?? null;
}

/** '6' (številka poglavja) ali celoten ključ poglavja → ključ poglavja. */
function resolveChapter(curriculum: string, ref: string): string | null {
  const r = ref.trim();
  if (!r) return null;
  if (r.includes(':')) return chaptersOf(r.split(':')[0]).some(c => c.key === r) ? r : null;
  if (!/^\d+$/.test(r)) return null;
  return chaptersOf(curriculum).find(c => c.number === r)?.key ?? null;
}

const KIND_WORDS: [RegExp, TaskKind[]][] = [
  [/^racun/, ['racunska']],
  [/^kombin/, ['racunska', 'besedilna']],
  [/^(pojmov|besedil|nastev|opis|izbir|razlag)/, ['besedilna']],
  [/^graf/, ['graficna']],
  [/^(skic|risanj|risba)/, ['skica']],
  [/^(eksperiment|poskus|meritev|merjen)/, ['eksperimentalna']],
  [/^(poveza|razvrs|urejan)/, ['povezovanje']],
];
function kindsFrom(text: string): TaskKind[] {
  const out = new Set<TaskKind>();
  for (const w of text.split(/[,/;]|\s+in\s+/).map(norm).filter(Boolean)) {
    const hit = KIND_WORDS.find(([re]) => re.test(w));
    hit?.[1].forEach(k => out.add(k));
  }
  return [...out];
}
const toBloom = (v: string): BloomLevel | null => { const n = Number(v); return n >= 1 && n <= 6 ? (n as BloomLevel) : null; };
const toDifficulty = (v: string): Difficulty | null => {
  const n = Number(v); if (n >= 1 && n <= 3) return n as Difficulty;
  const w = norm(v); return w.startsWith('lah') ? 1 : w.startsWith('sred') ? 2 : w.startsWith('zaht') || w.startsWith('tez') ? 3 : null;
};
const list = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean);

const paragraphs = (html: string) => html.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  .map(p => (/^<(p|ul|ol|table)\b/.test(p) ? p : `<p>${p.replace(/\n/g, ' ')}</p>`)).join('');
const clean = (html: string) => sanitizeRichHtml(html).html;

// ───────────────────────────── LaTeX ─────────────────────────────

/** Prebere {skupino} od položaja i (preskoči presledke); vrne vsebino in konec. */
function readGroup(s: string, i: number): { body: string; end: number } | null {
  let j = i;
  while (j < s.length && /\s/.test(s[j])) j++;
  if (s[j] !== '{') return null;
  let depth = 0;
  for (let k = j; k < s.length; k++) {
    if (s[k] === '\\') { k++; continue; }
    if (s[k] === '{') depth++;
    else if (s[k] === '}' && --depth === 0) return { body: s.slice(j + 1, k), end: k + 1 };
  }
  return null;
}
function readOptional(s: string, i: number): { body: string; end: number } | null {
  if (s[i] !== '[') return null;
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === '{') depth++; else if (s[k] === '}') depth--;
    else if (s[k] === ']' && depth === 0) return { body: s.slice(i + 1, k), end: k + 1 };
  }
  return null;
}

const SYMBOLS: Record<string, string> = {
  ldots: '…', dots: '…', cdots: '⋯', cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', degree: '°', circ: '°',
  approx: '≈', neq: '≠', ne: '≠', leq: '≤', le: '≤', geq: '≥', ge: '≥', infty: '∞', rightarrow: '→', to: '→', Rightarrow: '⇒',
  Delta: 'Δ', delta: 'δ', alpha: 'α', beta: 'β', gamma: 'γ', rho: 'ρ', mu: 'μ', eta: 'η', lambda: 'λ', pi: 'π', omega: 'ω', Omega: 'Ω',
  varphi: 'φ', phi: 'φ', theta: 'θ', sigma: 'σ', tau: 'τ', quad: ' ', qquad: '  ', ',': ' ', ';': ' ', ' ': ' ', '%': '%', '&': '&amp;',
  '_': '_', '#': '#', '$': '$', '{': '{', '}': '}', textendash: '–', textemdash: '—', euro: '€', newline: '<br>', par: '\n\n',
  textquotedbl: '"', textdegree: '°', textbackslash: '\\', textasciitilde: '~', textasciicircum: '^', noindent: '', smallskip: '', medskip: '', bigskip: '', centering: '', hfill: ' ', newpage: '', clearpage: '', displaystyle: '',
};
const WRAP: Record<string, [string, string]> = {
  textsubscript: ['<sub>', '</sub>'], textsuperscript: ['<sup>', '</sup>'], textbf: ['<b>', '</b>'], textit: ['<i>', '</i>'],
  emph: ['<i>', '</i>'], underline: ['<u>', '</u>'], text: ['', ''], mathrm: ['', ''], textrm: ['', ''], mbox: ['', ''],
  si: ['', ''], unit: ['', ''], textnormal: ['', ''], mathit: ['<i>', '</i>'], mathbf: ['<b>', '</b>'],
};

/** Pretvori LaTeX besedilo v HTML (osnovno: oblikovanje, simboli, ulomki, koreni, indeksi, podnaloge). */
export function texToHtml(src: string, math = false): string {
  let out = '';
  let i = 0;
  const s = src;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      if (s[i + 1] === '\\') { out += '<br>'; i += 2; continue; }
      const m = s.slice(i + 1).match(/^([A-Za-z]+|.)/);
      const name = m ? m[1] : '';
      i += 1 + name.length;
      if (name in SYMBOLS) { out += SYMBOLS[name]; if (/^[A-Za-z]/.test(name)) { const g = readGroup(s, i); if (g && g.body === '') i = g.end; } continue; }
      if (name in WRAP) {
        const g = readGroup(s, i);
        if (g) { out += WRAP[name][0] + texToHtml(g.body, math) + WRAP[name][1]; i = g.end; }
        continue;
      }
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const a = readGroup(s, i); const b = a && readGroup(s, a.end);
        if (a && b) { out += `<math><mfrac><mrow><mtext>${texToHtml(a.body, true).replace(/<[^>]*>/g, '')}</mtext></mrow><mrow><mtext>${texToHtml(b.body, true).replace(/<[^>]*>/g, '')}</mtext></mrow></mfrac></math>`; i = b.end; }
        continue;
      }
      if (name === 'sqrt') {
        const g = readGroup(s, i);
        if (g) { out += `<math><msqrt><mtext>${texToHtml(g.body, true).replace(/<[^>]*>/g, '')}</mtext></msqrt></math>`; i = g.end; }
        continue;
      }
      if (name === 'podnaloga') {
        const a = readGroup(s, i); const b = a && readGroup(s, a.end);
        if (a && b) { out += `\n\n<p><b>${texToHtml(a.body)})</b> ${texToHtml(b.body)}</p>\n\n`; i = b.end; }
        continue;
      }
      if (name === 'opomba') { const g = readGroup(s, i); if (g) { out += `\n\n<p><i>${texToHtml(g.body)}</i></p>\n\n`; i = g.end; } continue; }
      if (name === 'moznosti') { const g = readGroup(s, i); if (g) { out += `\n\n<p>${texToHtml(g.body)}</p>\n\n`; i = g.end; } continue; }
      if (name === 'begin' || name === 'end') {
        const g = readGroup(s, i); if (!g) continue; i = g.end;
        const env = g.body;
        if (env === 'itemize') out += name === 'begin' ? '\n\n<ul>' : '</ul>\n\n';
        else if (env === 'enumerate') out += name === 'begin' ? '\n\n<ol>' : '</ol>\n\n';
        else if (env === 'center' || env === 'flushleft') out += '\n\n';
        continue;
      }
      if (name === 'item') { out += '<li>'; continue; }
      if (name === 'slika' || name === 'resitev') { const g = readGroup(s, i); if (g) i = g.end; continue; }
      if (name === 'includegraphics') { const o = readOptional(s, i); if (o) i = o.end; const g = readGroup(s, i); if (g) { out += ` [slika: ${esc(g.body)}] `; i = g.end; } continue; }
      // neznan ukaz: obdrži vsebino morebitnih argumentov
      const o = readOptional(s, i); if (o) i = o.end;
      let g = readGroup(s, i);
      while (g) { out += texToHtml(g.body, math); i = g.end; g = s[i] === '{' ? readGroup(s, i) : null; }
      continue;
    }
    if (c === '$') {
      const dbl = s[i + 1] === '$';
      const start = i + (dbl ? 2 : 1);
      const end = s.indexOf(dbl ? '$$' : '$', start);
      if (end < 0) { i++; continue; }
      out += texToHtml(s.slice(start, end), true);
      i = end + (dbl ? 2 : 1);
      continue;
    }
    if (math && (c === '^' || c === '_')) {
      const g = readGroup(s, i + 1);
      const tag = c === '^' ? 'sup' : 'sub';
      if (g) { out += `<${tag}>${texToHtml(g.body, true)}</${tag}>`; i = g.end; }
      else { out += `<${tag}>${esc(s[i + 1] ?? '')}</${tag}>`; i += 2; }
      continue;
    }
    if (c === '{' || c === '}') { i++; continue; }
    if (c === '~') { out += ' '; i++; continue; }
    if (c === '-' && s.startsWith('---', i)) { out += '—'; i += 3; continue; }
    if (c === '-' && s.startsWith('--', i)) { out += '–'; i += 2; continue; }
    if (c === '<' || c === '>' || c === '&' || c === '"') { out += esc(c); i++; continue; }
    out += c; i++;
  }
  return out;
}

/** key=vrednost, key={vrednost z vejicami} → slovar */
function parseKeyVals(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    const m = s.slice(i).match(/^\s*([A-Za-z0-9čšžČŠŽ_]+)\s*=\s*/);
    if (!m) { i++; continue; }
    i += m[0].length;
    let val = '';
    if (s[i] === '{') { const g = readGroup(s, i)!; val = g.body; i = g.end; }
    else { const k = s.indexOf(',', i); val = s.slice(i, k < 0 ? s.length : k); i = k < 0 ? s.length : k; }
    out[m[1].toLowerCase()] = val.trim();
    while (s[i] === ',' || /\s/.test(s[i] ?? '')) i++;
  }
  return out;
}

export function parseTex(text: string, curriculum: string): ImportResult {
  const res: ImportResult = { drafts: [], warnings: [], errors: [] };
  const src = text.replace(/\r\n?/g, '\n').replace(/(^|[^\\])%.*$/gm, '$1');
  const re = /\\begin\{naloga\}/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(src))) {
    n++;
    let i = m.index + m[0].length;
    const opt = readOptional(src, i);
    const keys = opt ? parseKeyVals(opt.body) : {};
    if (opt) i = opt.end;
    const end = src.indexOf('\\end{naloga}', i);
    if (end < 0) { res.errors.push(`naloga ${n}: manjka \\end{naloga}`); break; }
    const body = src.slice(i, end).trim();
    re.lastIndex = end;

    const label = keys.id ? `naloga ${keys.id}` : `naloga ${n}`;
    const topic = keys.un ? resolveTopic(curriculum, keys.un) : null;
    const chapter = keys.un && !topic ? resolveChapter(curriculum, keys.un) : null;
    if (keys.un && !topic && !chapter) res.warnings.push(`${label}: podpoglavja »${keys.un}« ni v učnem načrtu — uvožena brez povezave`);
    const tags = [
      ...(keys.teme ? list(keys.teme) : []),
      ...(keys.predznanje ? [`predznanje ${keys.predznanje}`] : []),
      ...(norm(keys.izbirno ?? '') === 'da' ? ['izbirni standard'] : []),
    ];
    const needsImage = norm(keys.slika ?? '') === 'da';
    const html = clean(paragraphs(texToHtml(body)));
    if (!html) { res.errors.push(`${label}: prazno besedilo`); continue; }
    res.drafts.push(emptyTask({
      body: html,
      bloom: keys.bloom ? toBloom(keys.bloom) : null,
      difficulty: keys.tezavnost ? toDifficulty(keys.tezavnost) : null,
      kinds: keys.tip ? kindsFrom(keys.tip) : [],
      curriculum: topic || chapter ? curriculum : (keys.un ? curriculum : null),
      topics: topic ? [topic] : [],
      chapters: chapter ? [chapter] : [],
      tags: needsImage ? [...tags, 'manjka slika'] : tags,
      source: 'ucbenik',
      // naloge, ki potrebujejo sliko iz knjige, ostanejo osnutek, dokler slike ne dodaš
      status: needsImage ? 'draft' : 'verified',
    }));
  }
  if (!n) res.errors.push('V datoteki ni nobenega okolja \\begin{naloga} … \\end{naloga}.');
  return res;
}

// ───────────────────────────── TXT ─────────────────────────────

const META_KEYS: Record<string, string> = {
  tema: 'topic', un: 'topic', podpoglavje: 'topic', bloom: 'bloom', tezavnost: 'difficulty', tip: 'kind', vrsta: 'kind',
  kljucniki: 'tags', teme: 'tags', oznake: 'tags', resitev: 'answer', odgovor: 'answer', postopek: 'solution', namig: 'solution',
  tocke: 'points', cas: 'minutes', vir: 'source', stanje: 'status',
};
const SUBTASK_RE = /^([a-zčšž])\)\s+(.*)$/;
const OPTION_RE = /^(\*)?\s*([A-F])[).]\s+(.*)$/;
const DASH_OPTION_RE = /^(\*)?\s*[-•–]\s+(.*)$/;

export function parseTxt(text: string, defaultCurriculum: string): ImportResult {
  const res: ImportResult = { drafts: [], warnings: [], errors: [] };
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let curriculum = defaultCurriculum;

  const blocks: { line: number; text: string }[][] = [];
  let cur: { line: number; text: string }[] = [];
  lines.forEach((raw, idx) => {
    const t = raw.trim();
    if (!t) { if (cur.length) { blocks.push(cur); cur = []; } return; }
    if (t.startsWith('#')) return;
    const pm = t.match(/^predmet\s*:\s*(.+)$/i);
    if (pm && !blocks.length && !cur.length) { curriculum = norm(pm[1]); return; }
    cur.push({ line: idx + 1, text: t });
  });
  if (cur.length) blocks.push(cur);

  blocks.forEach(block => {
    const at = block[0].line;
    const body: string[] = [];
    const subtasks: string[] = [];
    const options: TaskOption[] = [];
    let correct: string | null = null;
    let numeric: { value: string; tolerance: number | null; unit: string | null } | null = null;
    const meta: Record<string, string> = {};

    for (const { text: t } of block) {
      const mm = t.match(/^([A-Za-zčšžČŠŽ]+)\s*:\s*(.*)$/);
      const key = mm ? META_KEYS[norm(mm[1])] : undefined;
      if (mm && key) { meta[key] = mm[2].trim(); continue; }
      const num = t.match(/^=\s*(.+)$/);
      if (num) {
        const mv = num[1].match(/^([-+]?[\d.,\s]+?)\s*(?:(?:±|\+\/-|\+-)\s*([\d.,]+))?\s*([^\d\s±+].*)?$/);
        if (mv && parseNumber(mv[1]) !== null) numeric = { value: mv[1].trim(), tolerance: mv[2] ? parseNumber(mv[2]) : null, unit: mv[3]?.trim() || null };
        else res.errors.push(`vrstica ${at}: »${num[1]}« ni število`);
        continue;
      }
      const op = t.match(OPTION_RE) ?? (body.length ? (t.match(DASH_OPTION_RE) ? [t, t.match(DASH_OPTION_RE)![1], '', t.match(DASH_OPTION_RE)![2]] : null) : null);
      if (op && body.length) {
        const o = { id: uid(), text: op[3].trim() };
        if (op[1]) correct = o.id;
        options.push(o);
        continue;
      }
      const sub = t.match(SUBTASK_RE);
      if (sub && body.length) { subtasks.push(`<p><b>${esc(sub[1])})</b> ${esc(sub[2])}</p>`); continue; }
      body.push(body.length ? t : t.replace(/^\d+\s*[.)]\s+/, ''));
    }

    if (!body.length) { res.errors.push(`vrstica ${at}: manjka besedilo naloge`); return; }
    const html = clean(`<p>${body.map(esc).join(' ')}</p>${subtasks.join('')}`);
    const topic = meta.topic ? resolveTopic(curriculum, meta.topic) : null;
    const chapter = meta.topic && !topic ? resolveChapter(curriculum, meta.topic) : null;
    if (meta.topic && !topic && !chapter) res.warnings.push(`vrstica ${at}: podpoglavja »${meta.topic}« ni v učnem načrtu — uvožena brez povezave`);

    let answerKind: TaskDraft['answer_kind'] = meta.answer ? 'short' : 'open';
    if (numeric) answerKind = 'numeric';
    else if (options.length >= 2 && correct) {
      const tf = options.length === 2 && options.every(o => /^(drži|ne drži|drzi|ne drzi)$/i.test(o.text));
      answerKind = tf ? 'tf' : 'mc';
    } else if (options.length) {
      res.warnings.push(`vrstica ${at}: možnosti brez označenega pravilnega odgovora (*) — vključene v besedilo`);
    }
    const optionsHtml = answerKind === 'mc' || answerKind === 'tf' || !options.length ? '' : `<p>${options.map((o, k) => `${'ABCDEF'[k]}) ${esc(o.text)}`).join(', ')}</p>`;

    res.drafts.push(emptyTask({
      body: html + optionsHtml,
      answer: meta.answer ? clean(`<p>${esc(meta.answer)}</p>`) : null,
      solution: meta.solution ? clean(`<p>${esc(meta.solution)}</p>`) : null,
      answer_kind: answerKind,
      options: answerKind === 'mc' || answerKind === 'tf' ? options : null,
      correct: answerKind === 'numeric' ? numeric!.value : answerKind === 'mc' || answerKind === 'tf' ? correct : null,
      tolerance: numeric?.tolerance ?? null,
      unit: numeric?.unit ?? null,
      bloom: meta.bloom ? toBloom(meta.bloom) : null,
      difficulty: meta.difficulty ? toDifficulty(meta.difficulty) : null,
      kinds: meta.kind ? kindsFrom(meta.kind) : [],
      curriculum: topic || chapter ? curriculum : null,
      topics: topic ? [topic] : [],
      chapters: chapter ? [chapter] : [],
      tags: meta.tags ? list(meta.tags) : [],
      points: meta.points && parseNumber(meta.points) ? parseNumber(meta.points)! : 1,
      minutes: meta.minutes && parseNumber(meta.minutes) ? Math.round(parseNumber(meta.minutes)!) : null,
      source: meta.source ? norm(meta.source) : 'lastna',
      status: meta.status && norm(meta.status).startsWith('osnut') ? 'draft' : 'verified',
    }));
  });
  if (!blocks.length) res.errors.push('Datoteka je prazna.');
  return res;
}

/** Besedilo brez oznak — za iskanje dvojnikov ob uvozu. */
export const plainKey = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
