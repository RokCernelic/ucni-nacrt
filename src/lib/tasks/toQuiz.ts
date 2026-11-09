import type { Task } from './types';
import type { Question } from '@/lib/quiz/types';

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', n: 'ⁿ' };
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '−': '₋' };
const map = (s: string, m: Record<string, string>) => (s.split('').every(c => c in m) ? s.split('').map(c => m[c]).join('') : null);

const SPACED = new Set(['=', '+', '−', '-', '×', '·', '≈', '≠', '<', '>', '≤', '≥', '→', '⇒', '±']);
const simple = (t: string) => /^[\p{L}\p{N}.,²³¹⁰⁴-⁹⁻⁺_]+$/u.test(t);
const paren = (t: string) => (simple(t) ? t : `(${t})`);

/** MathML → navadno besedilo (kviz nima enačb): ulomek a/b, potence in indeksi z Unicode, koren √. */
function mathToText(el: Element): string {
  const kids = Array.from(el.children);
  const txt = (e: Element | undefined) => (e ? mathToText(e) : '');
  switch (el.localName) {
    case 'mfrac': return `${paren(txt(kids[0]))}/${paren(txt(kids[1]))}`;
    case 'msup': { const e = txt(kids[1]); return txt(kids[0]) + (map(e, SUP) ?? `^(${e})`); }
    case 'msub': { const e = txt(kids[1]); return txt(kids[0]) + (map(e, SUB) ?? `_(${e})`); }
    case 'msubsup': { const lo = txt(kids[1]), up = txt(kids[2]); return txt(kids[0]) + (map(lo, SUB) ?? `_(${lo})`) + (map(up, SUP) ?? `^(${up})`); }
    case 'msqrt': { const i = kids.map(mathToText).join(''); return simple(i) ? `√${i}` : `√(${i})`; }
    case 'mroot': return `${txt(kids[1])}√(${txt(kids[0])})`;
    case 'mspace': return ' ';
    case 'annotation': case 'annotation-xml': return '';
    case 'mo': { const t = (el.textContent ?? '').trim(); return SPACED.has(t) ? ` ${t} ` : t; }
    case 'mtext': return el.textContent ?? '';
    default: return kids.length ? kids.map(mathToText).join('') : (el.textContent ?? '');
  }
}

/** Obogaten HTML naloge → navadno besedilo (kviz ima besedilo vprašanj brez oblikovanja). */
export function htmlToPlain(html: string): string {
  if (typeof window === 'undefined') return html.replace(/<[^>]*>/g, '');
  const root = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  root.querySelectorAll('math').forEach(e => { e.replaceWith(mathToText(e).replace(/[ \u00a0\u202f\u2009]+/g, ' ').trim()); });
  root.querySelectorAll('sup').forEach(e => { const t = e.textContent ?? ''; e.replaceWith(map(t, SUP) ?? `^(${t})`); });
  root.querySelectorAll('sub').forEach(e => { const t = e.textContent ?? ''; e.replaceWith(map(t, SUB) ?? `_(${t})`); });
  root.querySelectorAll('br').forEach(e => e.replaceWith('\n'));
  root.querySelectorAll('p, div, li, tr, h1, h2, h3, h4').forEach(e => e.append('\n'));
  return (root.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();
}

const firstImage = (html: string): string | undefined => html.match(/<img[^>]+src="([^"]+)"/i)?.[1];

/** Ali se naloga lahko uporabi v kvizu (ena pravilna možnost / drži-ne drži / številski odgovor)? */
export const quizReady = (t: Task) =>
  (t.answer_kind === 'mc' || t.answer_kind === 'tf') ? !!t.options && t.options.length >= 2 && !!t.correct && t.options.some(o => o.id === t.correct)
  : t.answer_kind === 'numeric' ? !!t.correct?.trim()
  : false;

/**
 * Naloge → vprašanja kviza. Vse naloge gredo zraven: izbirne (ena pravilna) na začetek,
 * nato številske in odprte (te učitelj pregleda ročno), v izvirnem vrstnem redu.
 */
export function tasksToQuestions(tasks: Task[]): { questions: Question[]; skipped: Task[] } {
  const choice: Question[] = [];
  const rest: Question[] = [];
  for (const t of tasks) {
    const image = firstImage(t.body);
    const base = { id: crypto.randomUUID(), taskId: t.id, points: t.points > 0 ? t.points : 1, ...(image ? { image } : {}) };
    let prompt = htmlToPlain(t.body);
    if (quizReady(t) && t.answer_kind !== 'numeric') {
      choice.push({ ...base, kind: 'mc', prompt, options: t.options!.map(o => ({ id: o.id, text: o.text })), correct: t.correct });
    } else if (quizReady(t)) {
      if (t.unit) prompt += `\n(odgovor v ${t.unit})`;
      rest.push({ ...base, kind: 'numeric', prompt, correct: t.correct!.trim(), tolerance: t.tolerance ?? 0 });
    } else {
      // odprte, kratek odgovor, več možnosti, naloge brez pravilnega odgovora
      if (t.options?.length) prompt += '\n' + t.options.map((o, i) => `${'ABCDEFGHIJKL'[i]}) ${o.text}`).join('\n');
      const sol = [t.answer, t.solution].filter(Boolean).map(h => htmlToPlain(h!)).join('\n');
      rest.push({ ...base, kind: 'open', prompt, html: t.body, ...(sol ? { answer: sol } : {}),
        space: t.answer_kind === 'short' ? 15 : t.answer_kind === 'numeric' ? 15 : 25 });
    }
  }
  return { questions: [...choice, ...rest], skipped: [] };
}
