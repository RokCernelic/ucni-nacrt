'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Question, Quiz } from './types';
import { sortByLastName } from '@/lib/names';

/*
 * Seje kvizov (docs/KVIZI.md, supabase/migrations/…_kvizi.sql).
 * Učitelj: neposredno do tabel prek RLS. iPad: le funkcije quiz_* (brez prijave).
 * Obvestila v živo: Realtime broadcast na kanalu `kviz-<KODA>`; kot rezerva periodično osveževanje.
 */

export type SessionMode = 'teacher' | 'student';
export type SessionPhase = 'collecting' | 'locked' | 'revealed';

export interface QuizSession {
  id: string;
  code: string;
  quiz_id: string | null;
  quiz_title: string;
  /** `excluded`: naloge, izvzete iz točkovanja v tej izvedbi */
  quiz: { questions: Question[]; excluded?: string[] };
  class_id: string;
  class_name: string;
  mode: SessionMode;
  shuffle: boolean;
  show_solutions: boolean;
  status: 'open' | 'ended';
  phase: SessionPhase;
  current_index: number;
  created_at: string;
  last_activity_at: string;
  ended_at: string | null;
  /** natisnjen kviz (skener); seja je odprta, dokler je učitelj ročno ne konča */
  paper?: unknown | null;
}

export interface SessionStudent {
  session_id: string;
  student_id: string;
  name: string;
  pin: string;
  device_id: string | null;
  pending_device: string | null;
  joined_at: string | null;
  submitted_at: string | null;
}

export interface SessionAnswer {
  session_id: string;
  student_id: string;
  question_id: string;
  value: string;
  answered_at: string;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // brez 0/O, 1/I
export const channelName = (code: string) => `kviz-${code.toUpperCase()}`;

/** Skriti udeleženec seje: učitelj (testna oseba). Ni na seznamih, le v končnih rezultatih. */
export const TEACHER_ID = '__ucitelj__';
export const TEACHER_NAME = 'Učitelj';
export const TEACHER_PIN_KEY = 'ucni-nacrt-teacher-pin';
const isTeacherRow = (x: { student_id: string }) => x.student_id === TEACHER_ID;

export function getTeacherPin(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(TEACHER_PIN_KEY) ?? 'null');
    return typeof v === 'string' && /^\d{4}$/.test(v) ? v : null;
  } catch { return null; }
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export const isPaperSession = (s: Pick<QuizSession, 'paper'>) => !!s.paper;

/** Seja teče: odprta in (razen natisnjenih kvizov, ki tečejo do ročnega konca) z nedavno aktivnostjo. */
export const isLive = (s: Pick<QuizSession, 'status' | 'last_activity_at'> & { paper?: unknown | null }) =>
  s.status === 'open' && (!!s.paper || Date.now() - new Date(s.last_activity_at).getTime() < 3 * 60 * 60 * 1000);

// ───────────────────────── učitelj ─────────────────────────

export async function startSession(opts: {
  quiz: Quiz;
  classId: string;
  className: string;
  students: { id: string; name: string; pin: string }[];
  /** PIN učitelja; če ga ima že kateri od učencev, se učitelj ne doda */
  teacherPin?: string | null;
  mode: SessionMode;
  shuffle: boolean;
  showSolutions: boolean;
}): Promise<QuizSession> {
  const sb = getSupabaseBrowserClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await sb.from('quiz_sessions').insert({
      code: newCode(),
      quiz_id: opts.quiz.id,
      quiz_title: opts.quiz.title || 'Kviz',
      // odprta vprašanja: brez točk (SQL jih ne šteje v maksimum) in brez vzorčnega odgovora (učenci ga ne smejo videti)
      quiz: { questions: opts.quiz.questions.map(q => (q.kind === 'open' ? { id: q.id, kind: 'open', prompt: q.prompt, image: q.image, points: 0 } : q)) },
      class_id: opts.classId,
      class_name: opts.className,
      mode: opts.mode,
      shuffle: opts.shuffle,
      show_solutions: opts.showSolutions,
    }).select().single();
    if (error) {
      if (error.code === '23505') continue; // koda že v uporabi — poskusi novo
      throw new Error(error.message);
    }
    const session = data as QuizSession;
    const rows = opts.students.map(s => ({ session_id: session.id, student_id: s.id, name: s.name, pin: s.pin }));
    if (opts.teacherPin && !opts.students.some(s => s.pin === opts.teacherPin)) {
      rows.push({ session_id: session.id, student_id: TEACHER_ID, name: TEACHER_NAME, pin: opts.teacherPin });
    }
    const { error: e2 } = await sb.from('quiz_session_students').insert(rows);
    if (e2) {
      await sb.from('quiz_sessions').delete().eq('id', session.id);
      throw new Error(e2.message);
    }
    return session;
  }
  throw new Error('Kode seje ni bilo mogoče ustvariti. Poskusi znova.');
}

/**
 * Natisnjen kviz: naloge, ki jih skener ne prebere (odprte, številske, izbirne brez pravilnega odgovora), dobijo v izvedbi
 * ročno točkovano vprašanje — učitelj vpiše točke v skenerju ali v rezultatih. Starejše izvedbe jih nimajo shranjenih,
 * zato jih dopolnimo ob branju (iz postavk lista).
 */
export function withManualQuestions<T extends Pick<QuizSession, 'quiz' | 'paper'>>(s: T): T {
  const items = (s.paper as { items?: { id: string; points: number }[] } | null | undefined)?.items;
  if (!items?.length) return s;
  const have = new Set(s.quiz.questions.map(q => q.id));
  const add: Question[] = items.filter(i => !have.has(i.id) && i.points > 0).map(i => ({ id: i.id, kind: 'open', manual: true, prompt: '', points: i.points }));
  return add.length ? { ...s, quiz: { ...s.quiz, questions: [...s.quiz.questions, ...add] } } : s;
}

/** Naloge, izvzete iz točkovanja v izvedbi (sveže iz baze). */
export async function loadExcluded(sessionId: string): Promise<string[]> {
  const { data, error } = await getSupabaseBrowserClient().from('quiz_sessions').select('quiz').eq('id', sessionId).single();
  if (error) throw new Error(error.message);
  return (data as { quiz: QuizSession['quiz'] }).quiz.excluded ?? [];
}

/** Nalogo izvzame iz točkovanja (ali jo vrne) v danih izvedbah; ne spremeni odgovorov. */
export async function setQuestionExcluded(sessionIds: string[], questionId: string, excluded: boolean) {
  const sb = getSupabaseBrowserClient();
  for (const id of sessionIds) {
    const { data, error } = await sb.from('quiz_sessions').select('quiz').eq('id', id).single();
    if (error) throw new Error(error.message);
    const quiz = (data as { quiz: QuizSession['quiz'] }).quiz;
    const cur = new Set(quiz.excluded ?? []);
    if (excluded) cur.add(questionId); else cur.delete(questionId);
    const { error: e } = await sb.from('quiz_sessions').update({ quiz: { ...quiz, excluded: [...cur] } }).eq('id', id);
    if (e) throw new Error(e.message);
  }
}

export type CorrectFix = { correct: string; tolerance?: number; /** besedila pravilnih možnosti (za kopije z drugimi id-ji možnosti) */ texts?: string[] };

/** Ali je vprašanje »ista naloga«: isto vprašanje ali nastalo iz iste naloge v bazi. */
export const sameTask = (q: Question, match: { questionId: string; taskId?: string }) => q.id === match.questionId || (!!match.taskId && q.taskId === match.taskId);

/**
 * Nov pravilni odgovor za vprašanje (ali null, če ga ni mogoče prenesti): izbirno — po id-jih možnosti, sicer po besedilu
 * (kopije kviza imajo nove id-je); številsko — vrednost in odstopanje.
 */
export function applyCorrectFix(q: Question, fix: CorrectFix): Question | null {
  if (q.kind === 'numeric') return { ...q, correct: fix.correct, tolerance: fix.tolerance ?? q.tolerance };
  if (q.kind !== 'mc') return null;
  const wanted = fix.correct.split(',').filter(Boolean);
  let ids = wanted.filter(id => q.options.some(o => o.id === id));
  if (ids.length !== wanted.length && fix.texts?.length) {
    const norm = (t: string) => t.trim().toLowerCase();
    ids = fix.texts.map(t => q.options.find(o => norm(o.text) === norm(t))?.id).filter((x): x is string => !!x);
    if (ids.length !== fix.texts.length) return null;
  } else if (ids.length !== wanted.length) return null;
  if (!ids.length || (!q.multi && ids.length > 1)) return null;
  return { ...q, correct: q.multi ? [...ids].sort().join(',') : ids[0] };
}

/**
 * Popravi pravilni odgovor naloge (napaka v ključu) v vseh izvedbah, kjer je bila uporabljena (isto vprašanje ali
 * vprašanje iz iste naloge v bazi, v vseh razredih). Točke učencev se izračunajo iz shranjenih odgovorov, zato se takoj
 * posodobijo; popravi se tudi ključ natisnjenih listov (nadaljnje skeniranje). Vrne število popravljenih izvedb.
 */
export async function setQuestionCorrect(match: { questionId: string; taskId?: string }, fix: CorrectFix): Promise<number> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('quiz_sessions').select('id, quiz, paper');
  if (error) throw new Error(error.message);
  let n = 0;
  for (const row of (data ?? []) as { id: string; quiz: QuizSession['quiz']; paper: { items: { id: string; correct: string[] }[] } | null }[]) {
    const fixed = new Map<string, Question>();
    const questions = row.quiz.questions.map(q => {
      if (!sameTask(q, match)) return q;
      const nq = applyCorrectFix(q, fix);
      if (!nq || JSON.stringify(nq) === JSON.stringify(q)) return q;
      fixed.set(q.id, nq);
      return nq;
    });
    if (!fixed.size) continue;
    const paper = row.paper ? { ...row.paper, items: row.paper.items.map(it => {
      const nq = fixed.get(it.id);
      return nq?.kind === 'mc' && nq.correct ? { ...it, correct: nq.correct.split(',').filter(Boolean) } : it;
    }) } : null;
    const { error: e } = await sb.from('quiz_sessions').update({ quiz: { ...row.quiz, questions }, ...(paper ? { paper } : {}) }).eq('id', row.id);
    if (e) throw new Error(e.message);
    n++;
  }
  return n;
}

/** Ročno vpisane točke ene naloge enega učenca (null = pobriši). Učenec šteje kot oddan (sodeloval). */
export async function setManualPoints(sessionId: string, studentId: string, questionId: string, points: number | null) {
  const sb = getSupabaseBrowserClient();
  if (points === null) {
    const { error } = await sb.from('quiz_answers').delete().eq('session_id', sessionId).eq('student_id', studentId).eq('question_id', questionId);
    if (error) throw new Error(error.message);
    return;
  }
  const now = new Date().toISOString();
  const { error } = await sb.from('quiz_answers').upsert({ session_id: sessionId, student_id: studentId, question_id: questionId, value: String(points), answered_at: now },
    { onConflict: 'session_id,student_id,question_id' });
  if (error) throw new Error(error.message);
  await sb.from('quiz_session_students').update({ submitted_at: now }).eq('session_id', sessionId).eq('student_id', studentId).is('submitted_at', null);
}

export async function loadSession(id: string) {
  const sb = getSupabaseBrowserClient();
  const [s, st, a] = await Promise.all([
    sb.from('quiz_sessions').select('*').eq('id', id).single(),
    sb.from('quiz_session_students').select('*').eq('session_id', id),
    sb.from('quiz_answers').select('*').eq('session_id', id),
  ]);
  if (s.error) throw new Error(s.error.message);
  const allStudents = (st.data ?? []) as SessionStudent[];
  const allAnswers = (a.data ?? []) as SessionAnswer[];
  return {
    session: withManualQuestions(s.data as QuizSession),
    students: sortByLastName(allStudents.filter(x => !isTeacherRow(x))),
    answers: allAnswers.filter(x => !isTeacherRow(x)),
    teacher: allStudents.find(isTeacherRow) ?? null,
    teacherAnswers: allAnswers.filter(isTeacherRow),
  };
}

/**
 * Vse pretekle (in tekoče) seje danega kviza, z učenci in odgovori v enem
 * bloku — za zgodovino kviza / primerjavo med razredi. Ena seja je lahko
 * lažja (samo `sessions`), zato za rezultate uporabi `answersBySession`/`studentsBySession`.
 */
export async function loadQuizHistory(quizId: string) {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('quiz_sessions').select('*').eq('quiz_id', quizId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const sessions = ((data ?? []) as QuizSession[]).map(withManualQuestions);
  const ids = sessions.map(s => s.id);
  if (ids.length === 0) return { sessions: [] as QuizSession[], studentsBySession: new Map<string, SessionStudent[]>(), answersBySession: new Map<string, SessionAnswer[]>() };

  const [stRows, aRows] = await Promise.all([
    fetchAllBySession<SessionStudent>('quiz_session_students', ids),
    fetchAllBySession<SessionAnswer>('quiz_answers', ids),
  ]);
  const studentsBySession = new Map<string, SessionStudent[]>();
  for (const s of stRows.filter(x => !isTeacherRow(x))) studentsBySession.set(s.session_id, [...(studentsBySession.get(s.session_id) ?? []), s]);
  const answersBySession = new Map<string, SessionAnswer[]>();
  for (const a2 of aRows.filter(x => !isTeacherRow(x))) answersBySession.set(a2.session_id, [...(answersBySession.get(a2.session_id) ?? []), a2]);
  for (const [k, v] of studentsBySession) studentsBySession.set(k, sortByLastName(v));
  return { sessions, studentsBySession, answersBySession };
}

/**
 * Vse vrstice tabele za dane seje. Baza vrne največ 1000 vrstic na poizvedbo, zato beremo po straneh
 * (in seje v manjših skupinah, da URL ne postane predolg) — sicer bi se pri več sejah odgovori in učenci odrezali.
 */
async function fetchAllBySession<T>(table: 'quiz_session_students' | 'quiz_answers', ids: string[]): Promise<T[]> {
  const sb = getSupabaseBrowserClient();
  const out: T[] = [];
  const PAGE = 1000;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    for (let from = 0; ; from += PAGE) {
      let q = sb.from(table).select('*').in('session_id', chunk).order('session_id').order('student_id');
      if (table === 'quiz_answers') q = q.order('question_id'); // enolični vrstni red za strani
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

/** Ali je učenec sodeloval: povezal napravo (kviz v živo) ali oddal odgovore (natisnjen kviz, skener). */
export const participated = (s: { device_id: string | null; submitted_at: string | null }) => !!s.device_id || !!s.submitted_at;

/** Vse seje učitelja (tudi za kvize, ki so že izbrisani — posnetek vprašanj je v seji). */
export async function loadAllHistory() {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('quiz_sessions').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const sessions = ((data ?? []) as QuizSession[]).map(withManualQuestions);
  const ids = sessions.map(s => s.id);
  const studentsBySession = new Map<string, SessionStudent[]>();
  const answersBySession = new Map<string, SessionAnswer[]>();
  const [stRows, aRows] = await Promise.all([
    fetchAllBySession<SessionStudent>('quiz_session_students', ids),
    fetchAllBySession<SessionAnswer>('quiz_answers', ids),
  ]);
  for (const x of stRows.filter(x => !isTeacherRow(x))) studentsBySession.set(x.session_id, [...(studentsBySession.get(x.session_id) ?? []), x]);
  for (const x of aRows.filter(x => !isTeacherRow(x))) answersBySession.set(x.session_id, [...(answersBySession.get(x.session_id) ?? []), x]);
  for (const [k, v] of studentsBySession) studentsBySession.set(k, sortByLastName(v));
  return { sessions, studentsBySession, answersBySession };
}

/** Vse izvedbe kvizov za en razred (z učenci in odgovori) — za stolpce rezultatov na seznamu učencev. */
export async function loadClassHistory(classId: string) {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('quiz_sessions').select('*').eq('class_id', classId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const sessions = ((data ?? []) as QuizSession[]).map(withManualQuestions);
  const ids = sessions.map(s => s.id);
  const studentsBySession = new Map<string, SessionStudent[]>();
  const answersBySession = new Map<string, SessionAnswer[]>();
  if (!ids.length) return { sessions, studentsBySession, answersBySession };
  const [stRows, aRows] = await Promise.all([
    fetchAllBySession<SessionStudent>('quiz_session_students', ids),
    fetchAllBySession<SessionAnswer>('quiz_answers', ids),
  ]);
  for (const x of stRows.filter(x => !isTeacherRow(x))) studentsBySession.set(x.session_id, [...(studentsBySession.get(x.session_id) ?? []), x]);
  for (const x of aRows.filter(x => !isTeacherRow(x))) answersBySession.set(x.session_id, [...(answersBySession.get(x.session_id) ?? []), x]);
  return { sessions, studentsBySession, answersBySession };
}

/**
 * Ob brisanju kviza: izbriše njegove PRAZNE izvedbe (nihče ni sodeloval, ni odgovorov, seja ne teče) — npr. poskusne
 * tiske. Izvedbe z rezultati ostanejo (v Rezultatih ostanejo vidne tudi po izbrisu kviza). Vrne število izbrisanih sej.
 */
export async function deleteEmptySessionsOfQuiz(quizId: string): Promise<number> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('quiz_sessions').select('*').eq('quiz_id', quizId);
  if (error) throw new Error(error.message);
  const sessions = ((data ?? []) as QuizSession[]).filter(s => !isLive(s));
  if (!sessions.length) return 0;
  const ids = sessions.map(s => s.id);
  const [students, answers] = await Promise.all([
    fetchAllBySession<SessionStudent>('quiz_session_students', ids),
    fetchAllBySession<SessionAnswer>('quiz_answers', ids),
  ]);
  const withData = new Set<string>();
  for (const x of students) if (!isTeacherRow(x) && participated(x)) withData.add(x.session_id);
  for (const a of answers) if (!isTeacherRow(a)) withData.add(a.session_id);
  const empty = ids.filter(id => !withData.has(id));
  if (!empty.length) return 0;
  const { error: d } = await sb.from('quiz_sessions').delete().in('id', empty);
  if (d) throw new Error(d.message);
  return empty.length;
}

/** Podpis točkovanja kviza (točke, pravilni odgovori, toleranca, enota) — za zaznavo sprememb. */
export const scoringSignature = (questions: Question[]) => JSON.stringify(questions.map(q =>
  [q.id, q.points, q.kind === 'open' ? null : q.correct, q.kind === 'numeric' ? q.tolerance : null, q.kind === 'numeric' ? q.unit ?? null : null]));

/**
 * Točkovanje kviza prenese v vse njegove izvedbe (tekoče, natisnjene, tudi zaključene): točke, pravilni odgovor,
 * toleranca in enota istih vprašanj. Rezultati se ob naslednjem ogledu izračunajo po novem točkovanju.
 * Vrne število posodobljenih izvedb.
 */
export async function syncSessionScoring(quizId: string, questions: Question[]): Promise<number> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('quiz_sessions').select('id, quiz, paper').eq('quiz_id', quizId);
  if (error) throw new Error(error.message);
  const byId = new Map(questions.map(q => [q.id, q]));
  let n = 0;
  for (const row of (data ?? []) as { id: string; quiz: { questions: Question[] }; paper: { items: { id: string; choice: boolean; correct: string[]; points: number; options: { id: string }[] }[] } | null }[]) {
    let changed = false;
    const qs = row.quiz.questions.map(sq => {
      const q = byId.get(sq.id);
      if (q && sq.kind === 'open' && sq.manual) { // ročno točkovano: le točke
        if (q.points !== sq.points) { changed = true; return { ...sq, points: q.points }; }
        return sq;
      }
      if (q && sq.kind === 'mc' && sq.multi && q.kind === 'open') { // »več možnosti«: v kvizu odprto, v izvedbi izbirno
        if (q.points !== sq.points) { changed = true; return { ...sq, points: q.points }; }
        return sq;
      }
      if (!q || q.kind !== sq.kind) return sq;
      const next = { ...sq, points: q.points } as Question;
      if (next.kind === 'mc' && q.kind === 'mc' && q.correct && next.options.some(o => o.id === q.correct)) next.correct = q.correct;
      if (next.kind === 'numeric' && q.kind === 'numeric') { next.correct = q.correct; next.tolerance = q.tolerance; next.unit = q.unit; }
      if (JSON.stringify(next) !== JSON.stringify(sq)) changed = true;
      return next;
    });
    const paper = row.paper ? {
      ...row.paper,
      items: row.paper.items.map(it => {
        const q = byId.get(it.id);
        if (!q) return it;
        const correct = q.kind === 'mc' && q.correct && it.options.some(o => o.id === q.correct) ? [q.correct] : it.correct;
        const next = { ...it, points: q.points, correct };
        if (JSON.stringify(next) !== JSON.stringify(it)) changed = true;
        return next;
      }),
    } : null;
    if (!changed) continue;
    const { error: e } = await sb.from('quiz_sessions').update({ quiz: { ...row.quiz, questions: qs }, ...(paper ? { paper } : {}) }).eq('id', row.id);
    if (e) throw new Error(e.message);
    n++;
  }
  return n;
}

/** Pobriše rezultat enega učenca v izvedbi (odgovori + oznaka oddaje); učenec lahko list znova odda oz. ga znova skeniraš. */
export async function resetStudentResult(sessionId: string, studentId: string): Promise<void> {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('quiz_answers').delete().eq('session_id', sessionId).eq('student_id', studentId);
  if (error) throw new Error(error.message);
  const { error: e2 } = await sb.from('quiz_session_students').update({ submitted_at: null }).eq('session_id', sessionId).eq('student_id', studentId);
  if (e2) throw new Error(e2.message);
}

/** Trajno izbriše eno izvedbo (sejo) z vsemi učenci in odgovori (rezultat izgine iz Rezultatov). */
export async function deleteSession(id: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().from('quiz_sessions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Stanje izvedb po kvizih (za knjižnico): koliko izvedb ima kviz in ali je katera še odprta. */
export async function loadQuizRunStatus(): Promise<Map<string, { runs: number; open: boolean }>> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('quiz_sessions').select('quiz_id, status');
  if (error) throw new Error(error.message);
  const m = new Map<string, { runs: number; open: boolean }>();
  for (const r of (data ?? []) as { quiz_id: string | null; status: string }[]) {
    if (!r.quiz_id) continue;
    const cur = m.get(r.quiz_id) ?? { runs: 0, open: false };
    m.set(r.quiz_id, { runs: cur.runs + 1, open: cur.open || r.status === 'open' });
  }
  return m;
}

export interface ActiveSession {
  session: QuizSession;
  /** povezani učenci (natisnjen kviz: učenci z vsaj enim skeniranim listom) */
  joined: number;
  total: number;
}

/** Vse seje, ki trenutno tečejo (odprte in z nedavno aktivnostjo), najnovejše prve. */
export async function loadActiveSessions(): Promise<ActiveSession[]> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb
    .from('quiz_sessions')
    .select('*, quiz_session_students(student_id, device_id, submitted_at)')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  type Row = QuizSession & { quiz_session_students: { student_id: string; device_id: string | null; submitted_at: string | null }[] };
  return ((data ?? []) as Row[])
    .filter(isLive)
    .map(({ quiz_session_students: st, ...session }) => {
      const students = st.filter(x => !isTeacherRow(x));
      return { session, joined: students.filter(x => (session.paper ? x.submitted_at : x.device_id)).length, total: students.length };
    });
}

export interface StudentHistoryEntry {
  session: QuizSession;
  student: SessionStudent;
  answers: SessionAnswer[];
}

/**
 * Zgodovina enega učenca skozi vse kvize (znotraj enega razreda — `student_id`
 * je id iz razrednega seznama, kopiran ob vsakem zagonu seje). Vrne le seje,
 * ki so se že končale.
 */
export async function loadStudentHistory(studentId: string): Promise<StudentHistoryEntry[]> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb
    .from('quiz_session_students')
    .select('*, quiz_sessions!inner(*)')
    .eq('student_id', studentId)
    .or('status.eq.ended,paper.not.is.null', { referencedTable: 'quiz_sessions' })
    .order('created_at', { referencedTable: 'quiz_sessions', ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (SessionStudent & { quiz_sessions: QuizSession })[];
  if (rows.length === 0) return [];

  const ids = rows.map(r => r.session_id);
  const { data: allAnswers, error: aErr } = await sb.from('quiz_answers').select('*').in('session_id', ids).eq('student_id', studentId);
  if (aErr) throw new Error(aErr.message);
  const answersBySession = new Map<string, SessionAnswer[]>();
  for (const a of (allAnswers ?? []) as SessionAnswer[]) answersBySession.set(a.session_id, [...(answersBySession.get(a.session_id) ?? []), a]);

  return rows.map(r => ({ session: withManualQuestions(r.quiz_sessions), student: r, answers: answersBySession.get(r.session_id) ?? [] }));
}

export async function updateSession(id: string, patch: Partial<Pick<QuizSession, 'phase' | 'current_index' | 'status' | 'ended_at'>>) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('quiz_sessions')
    .update({ ...patch, last_activity_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function resolveDevice(sessionId: string, studentId: string, allow: boolean, pendingDevice: string) {
  const sb = getSupabaseBrowserClient();
  const patch = allow ? { device_id: pendingDevice, pending_device: null } : { pending_device: null };
  const { error } = await sb.from('quiz_session_students').update(patch)
    .eq('session_id', sessionId).eq('student_id', studentId).eq('pending_device', pendingDevice);
  if (error) throw new Error(error.message);
}

// ───────────────────────── iPad ─────────────────────────

export type JoinResult = { status: 'joined' | 'pending' | 'bad_pin' | 'locked' | 'no_session'; name?: string };

export interface PublicQuestion {
  id: string;
  kind: 'mc' | 'numeric' | 'open';
  prompt: string;
  points: number;
  hasImage: boolean;
  options?: { id: string; text: string; keepPlace?: boolean }[];
}

export interface DeviceState {
  status: 'active' | 'ended' | 'pending' | 'not_joined' | 'no_session';
  title?: string;
  name?: string;
  mode?: SessionMode;
  shuffle?: boolean;
  seed?: string;
  total?: number;
  submitted?: boolean;
  // vodi učitelj
  phase?: SessionPhase;
  index?: number;
  question?: PublicQuestion | null;
  answer?: string | null;
  // vsak sam
  questions?: PublicQuestion[];
  answers?: Record<string, string>;
  // konec / oddano
  points?: number;
  maxPoints?: number;
  review?: (PublicQuestion & { correct: string; tolerance?: number; yourAnswer: string | null; isCorrect: boolean })[] | null;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseBrowserClient().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const deviceJoin = (code: string, pin: string, device: string) =>
  rpc<JoinResult>('quiz_join', { p_code: code, p_pin: pin, p_device: device });
export const deviceState = (code: string, device: string) =>
  rpc<DeviceState>('quiz_state', { p_code: code, p_device: device });
export const deviceAnswer = (code: string, device: string, questionId: string, value: string) =>
  rpc<{ ok: boolean; reason?: string }>('quiz_answer', { p_code: code, p_device: device, p_question_id: questionId, p_value: value });
export const deviceSubmit = (code: string, device: string) =>
  rpc<{ ok: boolean }>('quiz_submit', { p_code: code, p_device: device });
export const deviceImage = (code: string, device: string, questionId: string) =>
  rpc<string | null>('quiz_image', { p_code: code, p_device: device, p_question_id: questionId });

/** Trajni id tega iPada (ni vezan na prijavo; ne sinhronizira se v oblak). */
export function getDeviceId(): string {
  const KEY = 'kviz-naprava';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id); }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Naroči se na obvestila seje. `onPing` se sproži ob vsakem sporočilu.
 * Vrne { send, close, isLive } — isLive pove, ali je kanal povezan (za prilagoditev osveževanja).
 */
export function joinChannel(code: string, onPing: (payload: { type: string }) => void) {
  return openChannel(channelName(code), onPing);
}

/** Učiteljev kanal za statistiko: skener po vsakem shranjenem listu pošlje ping, Statistika se osveži. */
export function joinStatsChannel(userId: string, onPing: (payload: { type: string }) => void) {
  return openChannel(`statistika-${userId}`, onPing);
}

function openChannel(name: string, onPing: (payload: { type: string }) => void) {
  const sb = getSupabaseBrowserClient();
  let connected = false;
  const ch = sb.channel(name, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'ping' }, (msg: { payload?: unknown }) => onPing((msg.payload ?? { type: 'ping' }) as { type: string }))
    .subscribe((status: string) => { connected = status === 'SUBSCRIBED'; });
  return {
    send: (type: string) => { void ch.send({ type: 'broadcast', event: 'ping', payload: { type } }); },
    close: () => { void sb.removeChannel(ch); },
    isLive: () => connected,
  };
}

/** Posnetek izvedbe (cele ali enega učenca) pred brisanjem — za »Razveljavi«. */
export interface SessionSnapshot {
  session: Record<string, unknown> | null;
  students: Record<string, unknown>[];
  answers: Record<string, unknown>[];
}

export async function snapshotSession(sessionId: string, studentId?: string): Promise<SessionSnapshot> {
  const sb = getSupabaseBrowserClient();
  if (studentId) {
    const [st, an] = await Promise.all([
      sb.from('quiz_session_students').select('*').eq('session_id', sessionId).eq('student_id', studentId),
      sb.from('quiz_answers').select('*').eq('session_id', sessionId).eq('student_id', studentId),
    ]);
    if (st.error) throw new Error(st.error.message);
    if (an.error) throw new Error(an.error.message);
    return { session: null, students: st.data ?? [], answers: an.data ?? [] };
  }
  const { data, error } = await sb.from('quiz_sessions').select('*').eq('id', sessionId).single();
  if (error) throw new Error(error.message);
  const [students, answers] = await Promise.all([
    fetchAllBySession<Record<string, unknown>>('quiz_session_students', [sessionId]),
    fetchAllBySession<Record<string, unknown>>('quiz_answers', [sessionId]),
  ]);
  return { session: data, students, answers };
}

/** Povrne posnetek (izvedbo, učence in odgovore). */
export async function restoreSessionSnapshot(s: SessionSnapshot): Promise<void> {
  const sb = getSupabaseBrowserClient();
  if (s.session) {
    const { error } = await sb.from('quiz_sessions').upsert(s.session);
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < s.students.length; i += 500) {
    const { error } = await sb.from('quiz_session_students').upsert(s.students.slice(i, i + 500), { onConflict: 'session_id,student_id' });
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < s.answers.length; i += 500) {
    const { error } = await sb.from('quiz_answers').upsert(s.answers.slice(i, i + 500), { onConflict: 'session_id,student_id,question_id' });
    if (error) throw new Error(error.message);
  }
}
