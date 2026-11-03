import type { Task } from './types';
import type { Question } from '@/lib/quiz/types';

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', n: 'ⁿ' };
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '−': '₋' };
const map = (s: string, m: Record<string, string>) => (s.split('').every(c => c in m) ? s.split('').map(c => m[c]).join('') : null);

/** Obogaten HTML naloge → navadno besedilo (kviz ima besedilo vprašanj brez oblikovanja). */
export function htmlToPlain(html: string): string {
  if (typeof window === 'undefined') return html.replace(/<[^>]*>/g, '');
  const root = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
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

/** Naloge → vprašanja kviza (naloge, ki niso primerne za kviz, so v `skipped`). */
export function tasksToQuestions(tasks: Task[]): { questions: Question[]; skipped: Task[] } {
  const questions: Question[] = [];
  const skipped: Task[] = [];
  for (const t of tasks) {
    if (!quizReady(t)) { skipped.push(t); continue; }
    const image = firstImage(t.body);
    const base = { id: crypto.randomUUID(), points: t.points > 0 ? t.points : 1, ...(image ? { image } : {}) };
    let prompt = htmlToPlain(t.body);
    if (t.answer_kind === 'numeric') {
      if (t.unit) prompt += `\n(odgovor v ${t.unit})`;
      questions.push({ ...base, kind: 'numeric', prompt, correct: t.correct!.trim(), tolerance: t.tolerance ?? 0 });
    } else {
      const options = t.options!.map(o => ({ id: o.id, text: o.text }));
      questions.push({ ...base, kind: 'mc', prompt, options, correct: t.correct });
    }
  }
  return { questions, skipped };
}
