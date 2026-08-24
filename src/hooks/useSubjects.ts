'use client';

import { useState, useEffect, useCallback } from 'react';

export interface UserSubject {
  /** enolični id instance predmeta (seed: 'fizika'/'tehnika', sicer uuid) */
  id: string;
  /** id učnega načrta iz registra (npr. 'fizika') */
  curriculum: string;
  /** uredljivi podnaslov, npr. ime šole */
  subtitle: string;
}

const KEY = 'ucni-nacrt-subjects';

/** Privzeta predmeta – id-ja se ujemata s starimi ključi razredov (migracija). */
export const DEFAULT_SUBJECTS: UserSubject[] = [
  { id: 'fizika', curriculum: 'fizika', subtitle: '' },
  { id: 'tehnika', curriculum: 'tehnika', subtitle: '' },
];

const SYNC_EVENT = 'ucni-nacrt-subjects-changed';

function readSubjects(): UserSubject[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

/** zapiši in obvesti vse instance hooka (isti zavihek) + oblak */
function save(next: UserSubject[], cleanupIds: string[] = []) {
  localStorage.setItem(KEY, JSON.stringify(next));
  for (const id of cleanupIds) {
    localStorage.removeItem(`ucni-nacrt-classes-${id}`);
    localStorage.removeItem(`ucni-nacrt-active-class-${id}`);
  }
  window.dispatchEvent(new Event(SYNC_EVENT));
  window.dispatchEvent(new Event('ucni-nacrt-changed'));
}

export function useSubjects() {
  const [subjects, setSubjects] = useState<UserSubject[]>(DEFAULT_SUBJECTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = readSubjects();
    if (stored) setSubjects(stored);
    setLoaded(true);
  }, []);

  useEffect(() => {
    const resync = () => { const s = readSubjects(); if (s) setSubjects(s); };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.storageArea === localStorage) resync();
    };
    window.addEventListener('storage', onStorage);          // drugi zavihki / oblak
    window.addEventListener(SYNC_EVENT, resync);            // isti zavihek
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SYNC_EVENT, resync);
    };
  }, []);

  const addSubject = useCallback((curriculum: string): string => {
    const id = crypto.randomUUID();
    const next = [...(readSubjects() ?? DEFAULT_SUBJECTS), { id, curriculum, subtitle: '' }];
    setSubjects(next);
    save(next);
    return id;
  }, []);

  const updateSubtitle = useCallback((id: string, subtitle: string) => {
    const next = (readSubjects() ?? DEFAULT_SUBJECTS).map(s => s.id === id ? { ...s, subtitle } : s);
    setSubjects(next);
    save(next);
  }, []);

  const removeSubject = useCallback((id: string) => {
    const next = (readSubjects() ?? DEFAULT_SUBJECTS).filter(s => s.id !== id);
    setSubjects(next);
    save(next, [id]);
  }, []);

  return { subjects, loaded, addSubject, updateSubtitle, removeSubject };
}
