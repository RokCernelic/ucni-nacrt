'use client';

import { useState, useEffect, useCallback } from 'react';

export interface Lesson {
  /** ime ure, npr. "3.ura vš" */
  name?: string;
  /** začetek v obliki "HH:MM" (24h) */
  start: string;
  /** konec v obliki "HH:MM" (24h) */
  end: string;
}

/** Privzeti urnik šolskih ur; vsaka navedena ura se všteva v odštevalnik. */
export const DEFAULT_SCHEDULE: Lesson[] = [
  { name: '1.ura',    start: '07:30', end: '08:15' },
  { name: '2.ura',    start: '08:20', end: '09:05' },
  { name: '3.ura vš', start: '09:10', end: '09:55' },
  { name: '4.ura',    start: '10:15', end: '11:00' },
  { name: '5.ura',    start: '11:05', end: '11:50' },
  { name: '6.ura vš', start: '11:55', end: '12:40' },
  { name: '6.ura',    start: '12:15', end: '13:00' },
  { name: '7.ura',    start: '13:05', end: '13:50' },
  { name: '8.ura',    start: '13:55', end: '14:40' },
];

/** Prednastavljeni urniki za znane šole (uporabijo se, dokler jih učitelj ne uredi). */
export const SCHOOL_PRESETS: Record<string, Lesson[]> = {
  'OŠ Brežice': [
    { name: '1. ura',              start: '07:30', end: '08:15' },
    { name: '1/1. ura DK',         start: '08:00', end: '08:45' },
    { name: '2. ura',              start: '08:20', end: '09:05' },
    { name: '2/2. ura DK',         start: '09:05', end: '09:50' },
    { name: '3. ura',              start: '09:25', end: '10:10' },
    { name: '3/3. ura DK',         start: '09:55', end: '10:40' },
    { name: '4. ura',              start: '10:15', end: '11:00' },
    { name: '4/4. ura DK',         start: '10:45', end: '11:30' },
    { name: '5. ura',              start: '11:05', end: '11:50' },
    { name: '5/5. ura DK',         start: '11:35', end: '12:20' },
    { name: '6. ura RS RAP 1. ura', start: '11:55', end: '12:40' },
    { name: '6. ura PS',           start: '12:15', end: '13:00' },
    { name: 'RAP DK 1. ura',       start: '12:20', end: '13:05' },
    { name: 'RAP 2. ura',          start: '12:45', end: '13:30' },
    { name: 'RAP DK 2. ura',       start: '13:05', end: '13:50' },
    { name: '7. ura',              start: '13:05', end: '13:50' },
  ],
};

const KEY = 'ucni-nacrt-schedules';
const OLD_KEY = 'ucni-nacrt-schedule';
const SYNC_EVENT = 'ucni-nacrt-schedules-changed';

/** Urniki po šoli (ključ = podnaslov predmeta; "" = privzeto/brez šole). */
export type Schedules = Record<string, Lesson[]>;

/** Ključ šole iz podnaslova (obrezan; prazno = privzeto). */
export function schoolKey(subtitle?: string): string {
  return (subtitle ?? '').trim();
}

function readSchedules(): Schedules {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const p = JSON.parse(raw); if (p && typeof p === 'object' && !Array.isArray(p)) return p as Schedules; }
    // migracija starega enotnega urnika → privzeti ("")
    const old = localStorage.getItem(OLD_KEY);
    if (old) { const p = JSON.parse(old); if (Array.isArray(p)) return { '': p }; }
  } catch { /* ignore */ }
  return {};
}

function saveSchedules(next: Schedules) {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(SYNC_EVENT));
  window.dispatchEvent(new Event('ucni-nacrt-changed'));
}

export function useSchedules() {
  const [schedules, setSchedules] = useState<Schedules>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSchedules(readSchedules());
  }, []);

  useEffect(() => {
    const resync = () => setSchedules(readSchedules());
    const onStorage = (e: StorageEvent) => { if ((e.key === KEY || e.key === OLD_KEY) && e.storageArea === localStorage) resync(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SYNC_EVENT, resync);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(SYNC_EVENT, resync); };
  }, []);

  /** Urnik za dano šolo; če ni svojega, uporabi prednastavljenega oz. tovarniškega. */
  const getSchedule = useCallback((school: string): Lesson[] => {
    return schedules[school] ?? SCHOOL_PRESETS[school] ?? DEFAULT_SCHEDULE;
  }, [schedules]);

  const setSchedule = useCallback((school: string, next: Lesson[]) => {
    const cur = readSchedules();
    const merged = { ...cur, [school]: next };
    setSchedules(merged);
    saveSchedules(merged);
  }, []);

  return { schedules, getSchedule, setSchedule };
}

/** Pretvori "HH:MM" v minute od polnoči; -1 če neveljavno. */
export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return -1;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 23 || min > 59) return -1;
  return h * 60 + min;
}
