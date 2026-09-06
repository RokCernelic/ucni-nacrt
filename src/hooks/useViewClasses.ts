'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

export type ViewKind = 'ucni' | 'sedez';

/**
 * Izbor razredov (glavnih) v danem pogledu (Učni načrt / Sedežni red) za predmet.
 * Hrani le id-je; brisanje iz pogleda ne izbriše razreda (to je v nastavitvah).
 */
export function useViewClasses(view: ViewKind, subjectId: string) {
  const KEY = useMemo(() => `ucni-nacrt-view-${view}-${subjectId}`, [view, subjectId]);
  const ACTIVE = useMemo(() => `ucni-nacrt-view-${view}-active-${subjectId}`, [view, subjectId]);

  const [ids, setIds] = useState<string[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);

  const load = useCallback(() => {
    try { setIds(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { setIds([]); }
    try { setActiveIdState(localStorage.getItem(ACTIVE) || null); } catch { setActiveIdState(null); }
  }, [KEY, ACTIVE]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === ACTIVE) load(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('ucni-nacrt-master-classes-changed', load);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('ucni-nacrt-master-classes-changed', load); };
  }, [KEY, ACTIVE, load]);

  const persist = useCallback((next: string[]) => {
    setIds(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  }, [KEY]);

  const setActive = useCallback((id: string) => {
    setActiveIdState(id);
    localStorage.setItem(ACTIVE, id);
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  }, [ACTIVE]);

  const addToView = useCallback((id: string) => {
    const cur = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } })();
    if (cur.includes(id)) { setActive(id); return; }
    const next = [...cur, id];
    persist(next);
    setActive(id);
  }, [KEY, persist, setActive]);

  const removeFromView = useCallback((id: string) => {
    const cur = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } })();
    const next = cur.filter((x: string) => x !== id);
    persist(next);
    if (activeId === id) {
      const na = next[0] ?? null;
      if (na) setActive(na); else { localStorage.removeItem(ACTIVE); setActiveIdState(null); }
    }
  }, [KEY, ACTIVE, persist, setActive, activeId]);

  const reorder = useCallback((from: number, to: number) => {
    const cur = [...ids];
    if (from < 0 || to < 0 || from >= cur.length || to >= cur.length || from === to) return;
    const [m] = cur.splice(from, 1); cur.splice(to, 0, m);
    persist(cur);
  }, [ids, persist]);

  return { ids, activeId, setActive, addToView, removeFromView, reorder };
}
