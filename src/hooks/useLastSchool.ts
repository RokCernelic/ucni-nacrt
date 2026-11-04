'use client';

import { useSyncExternalStore } from 'react';

/** Zadnja odprta šola (za časovnik v meniju). Samo na tej napravi — ni del sinhronizacije. */
const KEY = 'un-last-school';
const EVT = 'un-last-school-changed';

export function rememberSchool(school: string | undefined | null) {
  const s = (school ?? '').trim();
  if (!s) return;
  try {
    if (localStorage.getItem(KEY) === s) return;
    localStorage.setItem(KEY, s);
    window.dispatchEvent(new Event(EVT));
  } catch { /* zasebni način */ }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener('storage', cb); };
}
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

/** null = še ni bila odprta nobena šola (ali strežniški izris). */
export function useLastSchool(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
