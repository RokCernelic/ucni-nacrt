'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Question } from './types';
import type { LayoutItem, PrintItem } from './printSheet';
import type { QuizSession } from './sessionApi';
import { sortByLastName } from '@/lib/names';

/** Podatki natisnjenega kviza v seji (stolpec `paper`): dovolj, da skener obnovi razpored vsakega lista. */
export interface PaperInfo {
  salt: string;
  /** vsaj nekaj se premeša (starejše seje: vprašanja in odgovori) */
  shuffle: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  /** vse postavke v izvirnem vrstnem redu (brez besedila) */
  items: (LayoutItem & { correct: string[]; points: number })[];
}
export type PaperSession = QuizSession & { paper: PaperInfo | null };

const code = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

/**
 * Ustvari sejo za natisnjen kviz (odprta, dokler je učitelj ročno ne konča; brez naprav): odgovori iz skenerja gredo v iste
 * tabele kot pri kvizu v živo, zato je statistika skupna. V posnetek vprašanj gredo le izbirna
 * z eno pravilno možnostjo (samodejno točkovanje); ostalo učitelj pregleda ročno.
 */
export async function createPaperSession(opts: {
  title: string; quizId: string | null; classId: string; className: string;
  students: { id: string; name: string; pin?: string }[]; items: PrintItem[]; shuffleQuestions: boolean; shuffleOptions: boolean;
}): Promise<PaperSession> {
  const sb = getSupabaseBrowserClient();
  const salt = Math.random().toString(36).slice(2, 10);
  const questions: Question[] = opts.items
    .filter(i => i.choice && !i.multi && i.correct.length === 1)
    .map(i => ({ id: i.id, kind: 'mc', prompt: i.prompt, points: i.points, options: i.options, correct: i.correct[0] }));
  const paper: PaperInfo = {
    salt, shuffle: opts.shuffleQuestions || opts.shuffleOptions, shuffleQuestions: opts.shuffleQuestions, shuffleOptions: opts.shuffleOptions,
    items: opts.items.map(i => ({ id: i.id, choice: i.choice, multi: i.multi, options: i.options.map(o => ({ id: o.id, text: '' })), correct: i.correct, points: i.points })),
  };
  const { data, error } = await sb.from('quiz_sessions').insert({
    code: code(), quiz_id: opts.quizId, quiz_title: opts.title || 'Kviz', quiz: { questions },
    class_id: opts.classId, class_name: opts.className, mode: 'student', shuffle: opts.shuffleQuestions || opts.shuffleOptions, show_solutions: false,
    status: 'open', phase: 'revealed', paper,
  }).select().single();
  if (error) throw new Error(error.message);
  const session = data as PaperSession;
  const rows = opts.students.map((s, i) => ({ session_id: session.id, student_id: s.id, name: s.name, pin: s.pin || `p${String(i).padStart(3, '0')}` }));
  const { error: e2 } = await sb.from('quiz_session_students').insert(rows);
  if (e2) { await sb.from('quiz_sessions').delete().eq('id', session.id); throw new Error(e2.message); }
  return session;
}

export async function loadPaperSession(id: string) {
  const sb = getSupabaseBrowserClient();
  const [s, st] = await Promise.all([
    sb.from('quiz_sessions').select('*').eq('id', id).single(),
    sb.from('quiz_session_students').select('student_id, name, submitted_at').eq('session_id', id),
  ]);
  if (s.error) throw new Error(s.error.message);
  return { session: s.data as PaperSession, students: sortByLastName((st.data ?? []) as { student_id: string; name: string; submitted_at: string | null }[]) };
}

/** Shrani prebrane odgovore enega lista (prepiše prejšnje skeniranje tega učenca). */
export async function savePaperAnswers(sessionId: string, studentId: string, answers: { questionId: string; value: string }[]) {
  const sb = getSupabaseBrowserClient();
  const now = new Date().toISOString();
  const { error: d } = await sb.from('quiz_answers').delete().eq('session_id', sessionId).eq('student_id', studentId);
  if (d) throw new Error(d.message);
  if (answers.length) {
    const { error } = await sb.from('quiz_answers').insert(answers.map(a => ({ session_id: sessionId, student_id: studentId, question_id: a.questionId, value: a.value, answered_at: now })));
    if (error) throw new Error(error.message);
  }
  const { error: e3 } = await sb.from('quiz_session_students').update({ submitted_at: now, joined_at: now }).eq('session_id', sessionId).eq('student_id', studentId);
  if (e3) throw new Error(e3.message);
}

/** Ali je seja natisnjenega kviza še odprta (skeniranje dovoljeno)? Po ročnem koncu seje skeniranje ni več mogoče. */
export async function isPaperOpen(sessionId: string): Promise<boolean> {
  const { data, error } = await getSupabaseBrowserClient().from('quiz_sessions').select('status').eq('id', sessionId).single();
  if (error) throw new Error(error.message);
  return data?.status === 'open';
}
