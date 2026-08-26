'use client';

import { useState, useEffect, useCallback } from 'react';

export interface Lesson {
  /** ime ure, npr. "3.ura vš", "K1" */
  name?: string;
  /** začetek v obliki "HH:MM" (24h) */
  start: string;
  /** konec v obliki "HH:MM" (24h) */
  end: string;
  /** ali se ura všteva v odštevalnik (privzeto true); npr. kosilo se ne šteje */
  count?: boolean;
}

/** Privzeti urnik šolskih ur. Ure z count:false (npr. kosilo) se ne štejejo. */
export const DEFAULT_SCHEDULE: Lesson[] = [
  { name: '1.ura',    start: '07:30', end: '08:15' },
  { name: '2.ura',    start: '08:20', end: '09:05' },
  { name: '3.ura vš', start: '09:10', end: '09:55' },
  { name: '3.ura',    start: '09:25', end: '10:10', count: false },
  { name: '4.ura',    start: '10:15', end: '11:00' },
  { name: '5.ura',    start: '11:05', end: '11:50' },
  { name: 'K1',       start: '11:55', end: '12:15', count: false },
  { name: '6.ura vš', start: '11:55', end: '12:40' },
  { name: '6.ura',    start: '12:15', end: '13:00' },
  { name: 'K3',       start: '12:40', end: '13:00', count: false },
  { name: '7.ura',    start: '13:05', end: '13:50' },
  { name: '8.ura',    start: '13:55', end: '14:40' },
];

const STORAGE_KEY = 'ucni-nacrt-schedule';

export function useSchedule() {
  const [schedule, setScheduleState] = useState<Lesson[]>(DEFAULT_SCHEDULE);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setScheduleState(parsed);
      }
    } catch { /* obdrži privzeto */ }
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.storageArea === localStorage) {
        try {
          const parsed = JSON.parse(e.newValue || '[]');
          if (Array.isArray(parsed)) setScheduleState(parsed.length ? parsed : DEFAULT_SCHEDULE);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setSchedule = useCallback((next: Lesson[]) => {
    setScheduleState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  }, []);

  return { schedule, setSchedule };
}

/** Pretvori "HH:MM" v minute od polnoči; -1 če neveljavno. */
export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return -1;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 23 || min > 59) return -1;
  return h * 60 + min;
}
