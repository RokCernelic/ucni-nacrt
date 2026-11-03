import type { Task } from '@/lib/tasks/types';
import type { Quiz } from './types';
import { makeRng } from '@/hooks/useSeating';

/** Vprašanje na tiskanem kvizu: izbirno (krogci A–F na vrhu) ali prosto (račun / zapis odgovora). */
export interface PrintItem {
  id: string;
  choice: boolean;
  /** več pravilnih možnosti (pobarva se več krogcev) */
  multi?: boolean;
  /** besedilo vprašanja kot HTML */
  html: string;
  options: { id: string; text: string }[];
  /** prostor za odgovor pri prostih vprašanjih (mm) */
  space: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plainHtml = (s: string) => esc(s).replace(/\n/g, '<br>');

export function itemsFromTasks(tasks: Task[]): PrintItem[] {
  return tasks.map(t => {
    const choice = (t.answer_kind === 'mc' || t.answer_kind === 'multi' || t.answer_kind === 'tf') && !!t.options && t.options.length >= 2;
    return {
      id: t.id, choice, multi: t.answer_kind === 'multi', html: t.body,
      options: choice ? t.options!.map(o => ({ id: o.id, text: o.text })) : [],
      space: t.answer_kind === 'numeric' ? 12 : t.answer_kind === 'short' ? 18 : 32,
    };
  });
}

export function itemsFromQuiz(quiz: Quiz): PrintItem[] {
  return quiz.questions.map(q => {
    const img = q.image ? `<p><img src="${q.image}" alt=""></p>` : '';
    if (q.kind === 'mc') return { id: q.id, choice: true, html: `<p>${plainHtml(q.prompt)}</p>${img}`, options: q.options.map(o => ({ id: o.id, text: o.text })), space: 0 };
    return { id: q.id, choice: false, html: `<p>${plainHtml(q.prompt)}</p>${img}`, options: [], space: 12 };
  });
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export interface SheetItem { n: number; item: PrintItem; options: { letter: string; id: string; text: string }[] }
export interface SheetLayout { choice: SheetItem[]; free: SheetItem[] }

export const LETTERS = 'ABCDEFGHIJKL';

/**
 * Razpored enega lista: izbirna vprašanja zgoraj (številčenje od 1), prosta za njimi.
 * Z `seed` se vrstni red vprašanj in možnosti določi deterministično (isti seed → isti list),
 * zato lahko skener kasneje iz žetona ugotovi, katera črka je katera izvirna možnost.
 */
export function layoutSheet(items: PrintItem[], seed: string | null): SheetLayout {
  const rng = seed ? makeRng(seed) : null;
  const order = <T,>(a: T[]) => (rng ? shuffled(a, rng) : a);
  const choice = order(items.filter(i => i.choice));
  const free = order(items.filter(i => !i.choice));
  let n = 0;
  const wrap = (item: PrintItem): SheetItem => ({
    n: ++n, item,
    options: (rng ? shuffled(item.options, rng) : item.options).map((o, i) => ({ letter: LETTERS[i], id: o.id, text: o.text })),
  });
  return { choice: choice.map(wrap), free: free.map(wrap) };
}

/** Vsebina QR kode: verzija | tiskovni posel (kviz) | učenec | seed. Brez osebnih podatkov. */
export const sheetToken = (jobId: string, studentId: string, seed: string) => `UN1|${jobId}|${studentId}|${seed}`;
