'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Question, Quiz } from './types';

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
  quiz: { questions: Question[] };
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

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export const isLive = (s: Pick<QuizSession, 'status' | 'last_activity_at'>) =>
  s.status === 'open' && Date.now() - new Date(s.last_activity_at).getTime() < 3 * 60 * 60 * 1000;

// ───────────────────────── učitelj ─────────────────────────

export async function startSession(opts: {
  quiz: Quiz;
  classId: string;
  className: string;
  students: { id: string; name: string; pin: string }[];
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
      quiz: { questions: opts.quiz.questions },
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
    const { error: e2 } = await sb.from('quiz_session_students').insert(
      opts.students.map(s => ({ session_id: session.id, student_id: s.id, name: s.name, pin: s.pin })),
    );
    if (e2) {
      await sb.from('quiz_sessions').delete().eq('id', session.id);
      throw new Error(e2.message);
    }
    return session;
  }
  throw new Error('Kode seje ni bilo mogoče ustvariti. Poskusi znova.');
}

export async function loadSession(id: string) {
  const sb = getSupabaseBrowserClient();
  const [s, st, a] = await Promise.all([
    sb.from('quiz_sessions').select('*').eq('id', id).single(),
    sb.from('quiz_session_students').select('*').eq('session_id', id).order('name'),
    sb.from('quiz_answers').select('*').eq('session_id', id),
  ]);
  if (s.error) throw new Error(s.error.message);
  return {
    session: s.data as QuizSession,
    students: (st.data ?? []) as SessionStudent[],
    answers: (a.data ?? []) as SessionAnswer[],
  };
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
  kind: 'mc' | 'numeric';
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
  const sb = getSupabaseBrowserClient();
  let connected = false;
  const ch = sb.channel(channelName(code), { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'ping' }, (msg: { payload?: unknown }) => onPing((msg.payload ?? { type: 'ping' }) as { type: string }))
    .subscribe((status: string) => { connected = status === 'SUBSCRIBED'; });
  return {
    send: (type: string) => { void ch.send({ type: 'broadcast', event: 'ping', payload: { type } }); },
    close: () => { void sb.removeChannel(ch); },
    isLive: () => connected,
  };
}
