'use client';

import { useSyncExternalStore, useCallback } from 'react';

/** Obkljukane naloge (za tisk / dodajanje v kviz) — skupne bazi nalog in učnemu načrtu. */
const KEY = 'ucni-nacrt-task-selection';
const EVT = 'ucni-nacrt-task-selection-changed';
let cache: { raw: string | null; set: Set<string> } = { raw: null, set: new Set() };
const EMPTY = new Set<string>();

function snapshot(): Set<string> {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (raw !== cache.raw) {
    let ids: string[] = [];
    try { ids = JSON.parse(raw ?? '[]'); } catch { ids = []; }
    cache = { raw, set: new Set(Array.isArray(ids) ? ids : []) };
  }
  return cache.set;
}
function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVT, cb);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener('storage', onStorage); };
}
function write(next: Set<string>) {
  localStorage.setItem(KEY, JSON.stringify([...next]));
  window.dispatchEvent(new Event(EVT));
  window.dispatchEvent(new Event('ucni-nacrt-changed'));
}

export function useTaskSelection() {
  const selected = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const toggle = useCallback((id: string, on?: boolean) => {
    const next = new Set(snapshot());
    if (on ?? !next.has(id)) next.add(id); else next.delete(id);
    write(next);
  }, []);
  const setMany = useCallback((ids: string[], on: boolean) => {
    const next = new Set(snapshot());
    ids.forEach(id => (on ? next.add(id) : next.delete(id)));
    write(next);
  }, []);
  return { selected, toggle, setMany };
}
