import { emptyTask, type Task, type TaskDraft, type AnswerKind } from './types';
import { tasksToQuestions } from './toQuiz';
import type { Question } from '@/lib/quiz/types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plainHtml = (s: string) => esc(s).replace(/\n/g, '<br>');

/** Oznaka naloge, ki je nastala v urejevalniku danega kviza (kopija urejenega vprašanja ali ročno dodano vprašanje). */
export const quizTag = (quizId: string) => `kviz:${quizId}`;

/**
 * Vprašanje kviza → osnutek naloge za bazo. Z `base` (izvirna naloga) kopija podeduje poglavje, standarde, težavnost,
 * Bloomovo stopnjo in vrste; `parentId` jo ugnezdi pod izvirnik. Brez `base` gre za ročno napisano vprašanje.
 */
export function questionToDraft(q: Question, opts: { base?: Task; parentId?: string | null; tag?: string } = {}): TaskDraft {
  const { base } = opts;
  const img = q.image ? `<p><img src="${q.image}" alt=""></p>` : '';
  const body = q.kind === 'open' && q.html ? q.html : `<p>${plainHtml(q.prompt)}</p>${img}`;
  const inherit: Partial<TaskDraft> = base ? {
    curriculum: base.curriculum, chapters: base.chapters, topics: base.topics, standards: base.standards,
    difficulty: base.difficulty, bloom: base.bloom, kinds: base.kinds, minutes: base.minutes, source: base.source, status: base.status,
  } : {};
  const common = { ...inherit, body, points: q.points > 0 ? q.points : 1, parent_id: opts.parentId ?? null, tags: opts.tag ? [opts.tag] : [] };
  if (q.kind === 'mc') {
    const tf = q.options.length === 2 && q.options[0].text === 'Drži' && q.options[1].text === 'Ne drži';
    return emptyTask({ ...common, answer_kind: (tf ? 'tf' : 'mc') as AnswerKind, options: q.options.map(o => ({ id: o.id, text: o.text })), correct: q.correct,
      answer: base?.answer ?? null, solution: base?.solution ?? null });
  }
  if (q.kind === 'numeric') {
    return emptyTask({ ...common, answer_kind: 'numeric', correct: q.correct, tolerance: q.tolerance || null, unit: q.unit ?? null,
      answer: base?.answer ?? null, solution: base?.solution ?? null });
  }
  return emptyTask({ ...common, answer_kind: base && (base.answer_kind === 'short' || base.answer_kind === 'open') ? base.answer_kind : 'open',
    answer: q.answer ? `<p>${plainHtml(q.answer)}</p>` : null, solution: null });
}

const pick = (q: Question) => JSON.stringify({
  k: q.kind, p: q.prompt, pts: q.points, img: q.image ?? null,
  o: q.kind === 'mc' ? q.options.map(o => [o.id, o.text]) : null, c: q.kind === 'mc' ? q.correct : q.kind === 'numeric' ? q.correct : null,
  t: q.kind === 'numeric' ? q.tolerance : null, a: q.kind === 'open' ? (q.answer ?? '') : null, h: q.kind === 'open' ? (q.html ?? '') : null,
});

/** Ali je vprašanje v kvizu še enako temu, kar bi nastalo iz naloge v bazi (brez urejanja)? */
export function questionMatchesTask(q: Question, task: Task): boolean {
  const q2 = tasksToQuestions([task]).questions[0];
  return !!q2 && pick(q) === pick(q2);
}
