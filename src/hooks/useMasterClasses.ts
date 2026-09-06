'use client';

import { useState, useEffect, useCallback } from 'react';

export interface MasterClass {
  id: string;
  name: string;   // npr. "8A"
  school: string; // npr. "OŠ Cerklje ob Krki"
}

const KEY = 'ucni-nacrt-master-classes';
const SYNC = 'ucni-nacrt-master-classes-changed';
/** kurikularni podatki, ki so vezani na (predmet::razred) */
const SCOPED = ['progress', 'hours', 'enote-order', 'open-chapters', 'notes', 'listmode'];

function emit() { window.dispatchEvent(new Event(SYNC)); window.dispatchEvent(new Event('ucni-nacrt-changed')); }

/** Enkratna migracija starih razredov (po predmetih) v glavni nabor. */
function migrate(): MasterClass[] {
  let subjects: { id: string; subtitle?: string }[] = [];
  try { subjects = JSON.parse(localStorage.getItem('ucni-nacrt-subjects') || '[]'); } catch { subjects = []; }
  const master: MasterClass[] = [];
  const seen = new Set<string>();
  for (const s of subjects) {
    let classes: { id: string; name: string }[] = [];
    try { classes = JSON.parse(localStorage.getItem(`ucni-nacrt-classes-${s.id}`) || '[]'); } catch { classes = []; }
    const ids: string[] = [];
    for (const c of classes) {
      if (!seen.has(c.id)) { seen.add(c.id); master.push({ id: c.id, name: c.name, school: s.subtitle || '' }); }
      ids.push(c.id);
      // kurikularne podatke prenesi na obseg predmet::razred
      const scope = `${s.id}::${c.id}`;
      for (const k of SCOPED) {
        const v = localStorage.getItem(`ucni-nacrt-${k}-${c.id}`);
        if (v != null && localStorage.getItem(`ucni-nacrt-${k}-${scope}`) == null)
          localStorage.setItem(`ucni-nacrt-${k}-${scope}`, v);
      }
    }
    if (ids.length) {
      if (!localStorage.getItem(`ucni-nacrt-view-ucni-${s.id}`)) localStorage.setItem(`ucni-nacrt-view-ucni-${s.id}`, JSON.stringify(ids));
      if (!localStorage.getItem(`ucni-nacrt-view-sedez-${s.id}`)) localStorage.setItem(`ucni-nacrt-view-sedez-${s.id}`, JSON.stringify(ids));
    }
  }
  return master;
}

function read(): MasterClass[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p; }
    // prvič: migriraj in shrani
    const m = migrate();
    localStorage.setItem(KEY, JSON.stringify(m));
    return m;
  } catch { return []; }
}

function write(next: MasterClass[]) { localStorage.setItem(KEY, JSON.stringify(next)); emit(); }

export function useMasterClasses() {
  const [classes, setClasses] = useState<MasterClass[]>([]);

  useEffect(() => { setClasses(read()); }, []);
  useEffect(() => {
    const resync = () => setClasses(read());
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) resync(); };
    window.addEventListener(SYNC, resync);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(SYNC, resync); window.removeEventListener('storage', onStorage); };
  }, []);

  const addClass = useCallback((name: string, school: string) => {
    const id = crypto.randomUUID();
    const next = [...read(), { id, name: name.trim(), school: school.trim() }];
    setClasses(next); write(next);
    return id;
  }, []);

  const updateClass = useCallback((id: string, patch: Partial<Pick<MasterClass, 'name' | 'school'>>) => {
    const next = read().map(c => c.id === id ? { ...c, ...patch } : c);
    setClasses(next); write(next);
  }, []);

  const removeClass = useCallback((id: string) => {
    const next = read().filter(c => c.id !== id);
    setClasses(next);
    // počisti razredu vezane podatke (seznam + sedežni red)
    localStorage.removeItem(`ucni-nacrt-roster-${id}`);
    localStorage.removeItem(`ucni-nacrt-seating-${id}`);
    // odstrani iz vseh pogledov
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('ucni-nacrt-view-ucni-') || k.startsWith('ucni-nacrt-view-sedez-'))) {
        try {
          const arr = JSON.parse(localStorage.getItem(k) || '[]');
          if (Array.isArray(arr) && arr.includes(id)) localStorage.setItem(k, JSON.stringify(arr.filter((x: string) => x !== id)));
        } catch { /* ignore */ }
      }
    }
    write(next);
  }, []);

  return { classes, addClass, updateClass, removeClass };
}
