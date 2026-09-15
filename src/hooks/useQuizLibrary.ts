'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Quiz, QuizFolder, Question } from '@/lib/quiz/types';

/*
 * Knjižnica kvizov. Zaenkrat shranjeno kot ostali podatki aplikacije
 * (localStorage + sinhronizacija v oblak prek `ucni-nacrt-changed`).
 * Ko bodo pripravljene Supabase tabele (docs/KVIZI.md), se zamenja le ta datoteka.
 */

const QUIZZES = 'ucni-nacrt-quizzes';
const FOLDERS = 'ucni-nacrt-quiz-folders';
const SYNC = 'ucni-nacrt-quizzes-changed';

function read<T>(key: string): T[] {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
export class QuizStorageFullError extends Error {
  constructor() { super('Prostor v brskalniku je poln — odstrani ali pomanjšaj kakšno sliko.'); }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // QuotaExceededError — slike so zaenkrat shranjene skupaj s kvizi
    if (e instanceof DOMException) throw new QuizStorageFullError();
    throw e;
  }
  window.dispatchEvent(new Event(SYNC));
  window.dispatchEvent(new Event('ucni-nacrt-changed'));
}

const uid = () => crypto.randomUUID();

export function newMcQuestion(): Question {
  return { id: uid(), kind: 'mc', prompt: '', points: 1, options: [{ id: uid(), text: '' }, { id: uid(), text: '' }, { id: uid(), text: '' }, { id: uid(), text: '' }], correct: null };
}
export function newTrueFalseQuestion(): Question {
  return { id: uid(), kind: 'mc', prompt: '', points: 1, options: [{ id: uid(), text: 'Drži' }, { id: uid(), text: 'Ne drži' }], correct: null };
}
export function newNumericQuestion(): Question {
  return { id: uid(), kind: 'numeric', prompt: '', points: 1, correct: '', tolerance: 0 };
}

/** Globoka kopija vprašanja z novimi id-ji (za podvajanje). */
export function cloneQuestion(q: Question): Question {
  if (q.kind === 'numeric') return { ...q, id: uid() };
  const idMap = new Map(q.options.map(o => [o.id, uid()]));
  return { ...q, id: uid(), options: q.options.map(o => ({ ...o, id: idMap.get(o.id)! })), correct: q.correct ? idMap.get(q.correct) ?? null : null };
}

export function useQuizLibrary() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [folders, setFolders] = useState<QuizFolder[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const refresh = () => { setQuizzes(read<Quiz>(QUIZZES)); setFolders(read<QuizFolder>(FOLDERS)); setLoaded(true); };
    refresh();
    const onStorage = (e: StorageEvent) => { if (e.key === QUIZZES || e.key === FOLDERS) refresh(); };
    window.addEventListener(SYNC, refresh);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(SYNC, refresh); window.removeEventListener('storage', onStorage); };
  }, []);

  // ── mape ──
  const createFolder = useCallback((name: string, parentId: string | null) => {
    const f: QuizFolder = { id: uid(), name: name.trim() || 'Nova mapa', parentId };
    write(FOLDERS, [...read<QuizFolder>(FOLDERS), f]);
    return f.id;
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    write(FOLDERS, read<QuizFolder>(FOLDERS).map(f => f.id === id ? { ...f, name } : f));
  }, []);

  /** Izbriše mapo; njene podmape in kvize premakne v nadrejeno mapo (nič se ne izgubi). */
  const deleteFolder = useCallback((id: string) => {
    const all = read<QuizFolder>(FOLDERS);
    const target = all.find(f => f.id === id);
    if (!target) return;
    write(FOLDERS, all.filter(f => f.id !== id).map(f => f.parentId === id ? { ...f, parentId: target.parentId } : f));
    write(QUIZZES, read<Quiz>(QUIZZES).map(q => q.folderId === id ? { ...q, folderId: target.parentId } : q));
  }, []);

  const moveFolder = useCallback((id: string, parentId: string | null) => {
    const all = read<QuizFolder>(FOLDERS);
    // prepreči premik mape vase ali v svojo podmapo
    let p = parentId;
    while (p) { if (p === id) return; p = all.find(f => f.id === p)?.parentId ?? null; }
    write(FOLDERS, all.map(f => f.id === id ? { ...f, parentId } : f));
  }, []);

  // ── kvizi ──
  const createQuiz = useCallback((folderId: string | null) => {
    const now = Date.now();
    const q: Quiz = { id: uid(), title: 'Nov kviz', folderId, questions: [newMcQuestion()], createdAt: now, updatedAt: now };
    write(QUIZZES, [...read<Quiz>(QUIZZES), q]);
    return q.id;
  }, []);

  const updateQuiz = useCallback((id: string, patch: Partial<Omit<Quiz, 'id' | 'createdAt'>>) => {
    write(QUIZZES, read<Quiz>(QUIZZES).map(q => q.id === id ? { ...q, ...patch, updatedAt: Date.now() } : q));
  }, []);

  const deleteQuiz = useCallback((id: string) => {
    write(QUIZZES, read<Quiz>(QUIZZES).filter(q => q.id !== id));
  }, []);

  const duplicateQuiz = useCallback((id: string) => {
    const src = read<Quiz>(QUIZZES).find(q => q.id === id);
    if (!src) return null;
    const now = Date.now();
    const copy: Quiz = { ...src, id: uid(), title: `${src.title} (kopija)`, questions: src.questions.map(cloneQuestion), createdAt: now, updatedAt: now, lastUsedAt: undefined };
    write(QUIZZES, [...read<Quiz>(QUIZZES), copy]);
    return copy.id;
  }, []);

  return { loaded, quizzes, folders, createFolder, renameFolder, deleteFolder, moveFolder, createQuiz, updateQuiz, deleteQuiz, duplicateQuiz };
}

/** Pot mape od korena, npr. ["8. razred", "Sile"]. */
export function folderPath(folders: QuizFolder[], id: string | null): QuizFolder[] {
  const out: QuizFolder[] = [];
  let cur = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const f = folders.find(x => x.id === cur);
    if (!f) break;
    out.unshift(f);
    cur = f.parentId;
  }
  return out;
}
