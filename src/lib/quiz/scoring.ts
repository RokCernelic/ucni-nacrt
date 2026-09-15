import type { Question, Quiz } from './types';

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

/** Ali je odgovor pravilen. `value` je id možnosti (izbirno) ali vpisano število (številsko). */
export function isCorrect(q: Question, value: string | null | undefined): boolean {
  if (value == null || value === '') return false;
  if (q.kind === 'mc') return q.correct !== null && value === q.correct;
  const given = parseNumber(value);
  const expected = parseNumber(q.correct);
  if (given === null || expected === null) return false;
  // majhen epsilon, da 0.1 + 0.2 ≠ 0.3 ne pokvari točnega ujemanja
  return Math.abs(given - expected) <= Math.max(0, q.tolerance) + 1e-9;
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
    maxPoints += q.points;
    const st = answerStatus(q, answers[q.id]);
    if (st === 'correct') { points += q.points; correct++; }
    else if (st === 'wrong') wrong++;
    else unanswered++;
  }
  const percent = maxPoints > 0 ? Math.round((points / maxPoints) * 1000) / 10 : 0;
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
  } else {
    if (parseNumber(q.correct) === null) p.push('vpiši pravilno številsko vrednost');
    if (!(q.tolerance >= 0)) p.push('toleranca ne sme biti negativna');
  }
  return p;
}
