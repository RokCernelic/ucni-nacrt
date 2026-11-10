import type { Question, Quiz } from './types';
import { ceilPct } from '@/lib/quiz/format';

/**
 * Prebere število, kot ga vpiše učenec ali učitelj: vejica = pika, presledki
 * (tudi kot ločilo tisočic) se ignorirajo. Vrne null, če to ni število.
 */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const PREFIX: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, h: 1e2, da: 1e1, d: 1e-1, c: 1e-2, m: 1e-3, 'µ': 1e-6, 'μ': 1e-6, u: 1e-6 };

/**
 * Faktor, s katerim vrednost v enoti `u` (učenčeva) pretvorimo v enoto `e` (pričakovana), če se razlikujeta le v predponi
 * (npr. kJ → J = 1000, cm → m = 0,01). Vrne null, če enot ni mogoče primerjati.
 */
export function unitFactor(u: string, e: string): number | null {
  const norm = (x: string) => x.replace(/\s+/g, '').replace('²', '2').replace('³', '3');
  const a = norm(u), b = norm(e);
  if (!a || !b) return null;
  if (a === b) return 1;
  const split = (x: string): [number, string][] => [[1, x], ...Object.keys(PREFIX).filter(p => x.length > p.length && x.startsWith(p)).map(p => [PREFIX[p], x.slice(p.length)] as [number, string])];
  for (const [fa, ba] of split(a)) for (const [fb, bb] of split(b)) if (ba === bb) return fa / fb;
  if (a.toLowerCase() === b.toLowerCase()) return 1; // npr. »j« namesto »J«
  return null;
}

/**
 * Številski odgovor učenca: število z ali brez enote, s presledkom ali brez (»900 J«, »900J«, »0,9 kJ«).
 * Vrne vrednost v pričakovani enoti (če je enota z drugo predpono, se pretvori) in številko, kot je zapisana.
 */
export function readAnswer(raw: string, expectedUnit?: string | null): { value: number; text: string; factor: number; wrongUnit: boolean } | null {
  const t = raw.replace(/[\u00a0\u202f\u2009]/g, ' ').trim();
  const m = t.match(/^([-+−]?(?:\d[\d ]*(?:[.,]\d+)?|[.,]\d+)(?:[eE][-+]?\d+)?)\s*(.*)$/);
  if (!m) return null;
  const text = m[1].replace('−', '-').replace(/ /g, '');
  const n = parseNumber(text);
  if (n === null) return null;
  const unit = m[2].trim();
  const f = unit && expectedUnit ? unitFactor(unit, expectedUnit) : 1;
  const factor = f ?? 1;
  return { value: n * factor, text, factor, wrongUnit: f === null };
}

/** Vrednost številskega odgovora v pričakovani enoti (za statistiko in združevanje enakih odgovorov). */
export const numericValue = (q: Question, raw: string): number | null =>
  q.kind === 'numeric' ? readAnswer(raw, q.unit)?.value ?? null : null;

/** Dovoljeno relativno odstopanje številskega odgovora (nenatančno zaokroževanje pri fiziki ni bistveno). */
export const NUMERIC_REL_TOLERANCE = 0.05;

/**
 * Ali je odgovor pravilen. `value` je id možnosti (izbirno) ali vpisano število (številsko).
 * Številsko: enota je lahko zapisana ali ne (s presledkom ali brez, z drugo predpono se pretvori; napačna enota ni pravilna); priznano je tudi
 * nenatančno ali napačno zaokroževanje — do 5 % odstopanja ali do ene enote zadnjega zapisanega mesta.
 */
export function isCorrect(q: Question, value: string | null | undefined): boolean {
  if (value == null || value === '') return false;
  if (q.kind === 'mc') return q.correct !== null && value === q.correct;
  if (q.kind === 'open') return false; // ročni pregled
  const given = readAnswer(value, q.unit);
  const expected = parseNumber(q.correct);
  if (given === null || expected === null) return false;
  if (given.wrongUnit) return false; // zapisana enota ne ustreza (npr. N namesto J)
  const diff = Math.abs(given.value - expected);
  // majhen epsilon, da 0.1 + 0.2 ≠ 0.3 ne pokvari točnega ujemanja
  if (diff <= Math.max(0, q.tolerance) + 1e-9) return true;
  if (expected !== 0 && diff <= NUMERIC_REL_TOLERANCE * Math.abs(expected) + 1e-9) return true;
  // napačno zaokroženo: odstopanje do ene enote zadnjega zapisanega mesta (vsaj dve veljavni števki)
  const digits = given.text.replace(/^[-+]/, '').replace(/[.,]/, '').replace(/^0+/, '');
  if (digits.length >= 2) {
    const dec = (given.text.split(/[.,]/)[1] ?? '').length;
    if (diff <= Math.pow(10, -dec) * given.factor + 1e-9) return true;
  }
  return false;
}

export type AnswerStatus = 'correct' | 'wrong' | 'unanswered';

export function answerStatus(q: Question, value: string | null | undefined): AnswerStatus {
  if (value == null || value === '') return 'unanswered';
  return isCorrect(q, value) ? 'correct' : 'wrong';
}

export interface QuizScore {
  points: number;
  maxPoints: number;
  percent: number;
  correct: number;
  wrong: number;
  unanswered: number;
}

/** Točke za odgovore enega učenca (ključ = id vprašanja). Številski: vse ali nič. */
export function scoreAnswers(quiz: Pick<Quiz, 'questions'>, answers: Record<string, string | undefined>): QuizScore {
  let points = 0, maxPoints = 0, correct = 0, wrong = 0, unanswered = 0;
  for (const q of quiz.questions) {
    if (q.kind === 'open') continue; // ne točkuje se samodejno
    maxPoints += q.points;
    const st = answerStatus(q, answers[q.id]);
    if (st === 'correct') { points += q.points; correct++; }
    else if (st === 'wrong') wrong++;
    else unanswered++;
  }
  const percent = maxPoints > 0 ? ceilPct((points / maxPoints) * 100) : 0;
  return { points, maxPoints, percent, correct, wrong, unanswered };
}

/** Kaj še manjka, da je vprašanje uporabno v seji (prazno = pripravljeno). */
export function questionProblems(q: Question): string[] {
  const p: string[] = [];
  if (!q.prompt.trim() && !q.image) p.push('manjka besedilo vprašanja');
  if (!(q.points > 0)) p.push('točke morajo biti več kot 0');
  if (q.kind === 'mc') {
    const filled = q.options.filter(o => o.text.trim());
    if (filled.length < 2) p.push('potrebni sta vsaj 2 možnosti');
    if (!q.correct || !q.options.some(o => o.id === q.correct)) p.push('izberi pravilni odgovor');
    else if (!q.options.find(o => o.id === q.correct)?.text.trim()) p.push('pravilna možnost je prazna');
  } else if (q.kind === 'numeric') {
    if (parseNumber(q.correct) === null) p.push('vpiši pravilno številsko vrednost');
    if (!(q.tolerance >= 0)) p.push('toleranca ne sme biti negativna');
  }
  return p;
}
