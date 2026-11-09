import type { Task } from '@/lib/tasks/types';
import type { Quiz } from './types';

/** Vprašanje na tiskanem kvizu: izbirno (krogci A–F na vrhu) ali prosto (račun / zapis odgovora). */
export interface PrintItem {
  id: string;
  choice: boolean;
  /** več pravilnih možnosti (pobarva se več krogcev) */
  multi?: boolean;
  /** besedilo vprašanja kot HTML */
  html: string;
  /** besedilo vprašanja brez oblikovanja (posnetek seje za statistiko) */
  prompt: string;
  options: { id: string; text: string }[];
  /** id-ji pravilnih možnosti */
  correct: string[];
  points: number;
  /** prostor za odgovor pri prostih vprašanjih (mm) */
  space: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plainHtml = (s: string) => esc(s).replace(/\n/g, '<br>');

export function itemsFromTasks(tasks: Task[], toPlain: (html: string) => string): PrintItem[] {
  return tasks.map(t => {
    const choice = (t.answer_kind === 'mc' || t.answer_kind === 'multi' || t.answer_kind === 'tf') && !!t.options && t.options.length >= 2;
    const correct = !choice ? [] : t.answer_kind === 'multi' ? (t.correct ?? '').split(',').filter(Boolean) : t.correct ? [t.correct] : [];
    return {
      id: t.id, choice, multi: t.answer_kind === 'multi', html: t.body, prompt: toPlain(t.body),
      options: choice ? t.options!.map(o => ({ id: o.id, text: o.text })) : [],
      correct, points: t.points > 0 ? t.points : 1,
      space: t.answer_kind === 'numeric' ? 15 : t.answer_kind === 'short' ? 15 : 25,
    };
  });
}

export function itemsFromQuiz(quiz: Quiz): PrintItem[] {
  return quiz.questions.map(q => {
    const img = q.image ? `<p><img src="${q.image}" alt=""></p>` : '';
    const html = `<p>${plainHtml(q.prompt)}</p>${img}`;
    if (q.kind === 'mc') return { id: q.id, choice: true, html, prompt: q.prompt, options: q.options.map(o => ({ id: o.id, text: o.text })), correct: q.correct ? [q.correct] : [], points: q.points, space: 0 };
    if (q.kind === 'open') return { id: q.id, choice: false, html: q.html || html, prompt: q.prompt, options: [], correct: [], points: q.points, space: Math.min(q.space ?? 25, 25) };
    return { id: q.id, choice: false, html, prompt: q.prompt, options: [], correct: [], points: q.points, space: 15 };
  });
}

/** Deterministični generator (mulberry32) iz besedilnega semena — enak kot v sedežnem redu. */
function makeRng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Postavka za razpored: pri skeniranju zadošča brez besedila (id, izbirnost, možnosti). */
export type LayoutItem = Pick<PrintItem, 'id' | 'choice' | 'multi' | 'options'>;
export interface SheetItem<T extends LayoutItem = PrintItem> { n: number; item: T; options: { letter: string; id: string; text: string }[] }
export interface SheetLayout<T extends LayoutItem = PrintItem> { choice: SheetItem<T>[]; free: SheetItem<T>[] }

export const LETTERS = 'ABCDEFGHIJKL';

/**
 * Razpored enega lista: izbirna vprašanja zgoraj (številčenje od 1), prosta za njimi.
 * Z `seed` se vrstni red vprašanj in možnosti določi deterministično (isti seed → isti list),
 * zato skener iz QR kode ugotovi, katera črka je katera izvirna možnost.
 */
export function layoutSheet<T extends LayoutItem>(items: T[], seed: string | null, opts: { questions?: boolean; options?: boolean } = {}): SheetLayout<T> {
  const rng = seed ? makeRng(seed) : null;
  const qRng = opts.questions === false ? null : rng;
  const oRng = opts.options === false ? null : rng;
  const order = <U,>(a: U[]) => (qRng ? shuffled(a, qRng) : a);
  const choice = order(items.filter(i => i.choice));
  const free = order(items.filter(i => !i.choice));
  let n = 0;
  const wrap = (item: T): SheetItem<T> => ({
    n: ++n, item,
    options: (oRng ? shuffled(item.options, oRng) : item.options).map((o, i) => ({ letter: LETTERS[i], id: o.id, text: o.text })),
  });
  return { choice: choice.map(wrap), free: free.map(wrap) };
}

/** Vsebina QR kode: verzija | seja (natisnjen kviz) | učenec. Brez osebnih podatkov. */
export const sheetToken = (sessionId: string, studentId: string) => `UN1|${sessionId}|${studentId}`;
export function parseToken(s: string): { sessionId: string; studentId: string } | null {
  const m = /^UN1\|([0-9a-f-]{36})\|(.+)$/i.exec(s.trim());
  return m ? { sessionId: m[1], studentId: m[2] } : null;
}
/** Kaj se premeša na listu: vprašanja in/ali vrstni red odgovorov (starejše seje: `shuffle` = oboje). */
export const shuffleOpts = (p: { shuffle: boolean; shuffleQuestions?: boolean; shuffleOptions?: boolean }) => ({
  questions: p.shuffleQuestions ?? p.shuffle, options: p.shuffleOptions ?? p.shuffle,
});
/** Seme mešanja za učenca (sol je shranjena v seji). */
export const sheetSeed = (salt: string, studentId: string) => `${salt}${studentId}`;

// ───────────────────────── geometrija okvirja z odgovori (mm) ─────────────────────────
// Okvir se natisne z absolutnimi merami; skener iz istih mer izračuna, kje so krogci.

export const FRAME = {
  w: 178,          // širina (A4 210 mm − 2 × 16 mm rob)
  mark: 4,         // stranica črnega kvadratka
  markInset: 1.5,  // odmik kvadratka od roba okvirja
  rowY0: 3.5,      // prva vrstica krogcev (brez naslova v okvirju)
  rowH: 6.8,
  padX: 9,
  qr: 22,
  qrGap: 4,
  colGap: 5,
  numW: 6,         // številka vprašanja
  bubGap: 1.3,
  bottom: 3.5,
} as const;

export interface FrameGeometry {
  w: number; h: number;
  /** središča kvadratkov: zgoraj levo, zgoraj desno, spodaj levo, spodaj desno */
  marks: [number, number][];
  qr: { x: number; y: number; size: number } | null;
  bub: number;
  rows: number;
  colW: number;
  cells: { n: number; multi: boolean; x: number; y: number; bubbles: { letter: string; optionId: string; cx: number; cy: number }[] }[];
}

export function frameGeometry<T extends LayoutItem>(layout: SheetLayout<T>, withQr: boolean): FrameGeometry {
  const F = FRAME;
  const n = layout.choice.length;
  const rows = Math.max(1, Math.ceil(n / 4));
  const areaW = F.w - F.padX - (withQr ? F.qr + F.qrGap : 0) - F.padX;
  const colW = (areaW - 3 * F.colGap) / 4;
  const maxOpts = Math.max(1, ...layout.choice.map(c => c.options.length));
  const avail = colW - F.numW - F.bubGap;
  const bub = Math.max(3.4, Math.min(5.4, Math.floor(((avail - (maxOpts - 1) * F.bubGap) / maxOpts) * 10) / 10));
  const h = Math.max(F.rowY0 + rows * F.rowH, withQr ? F.rowY0 + F.qr : 0) + F.bottom;
  const cells = layout.choice.map((c, i) => {
    const col = Math.floor(i / rows), row = i % rows;
    const x = F.padX + col * (colW + F.colGap);
    const y = F.rowY0 + row * F.rowH;
    return {
      n: c.n, multi: !!c.item.multi, x, y,
      bubbles: c.options.map((o, k) => ({ letter: o.letter, optionId: o.id, cx: x + F.numW + F.bubGap + bub / 2 + k * (bub + F.bubGap), cy: y + F.rowH / 2 })),
    };
  });
  const m = F.markInset + F.mark / 2;
  return {
    w: F.w, h, rows, colW, bub, cells,
    marks: [[m, m], [F.w - m, m], [m, h - m], [F.w - m, h - m]],
    qr: withQr ? { x: F.w - F.padX - F.qr, y: F.rowY0, size: F.qr } : null,
  };
}
