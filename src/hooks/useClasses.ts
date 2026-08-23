'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

export type SchoolClass = { id: string; name: string };

function loadClasses(key: string): SchoolClass[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}

/**
 * Razredi so ločeni po predmetih (vsak predmet ima svoj nabor razredov).
 * predmetId določa ločen prostor v localStorage.
 */
export function useClasses(predmetId: string) {
  const CLASSES_KEY = useMemo(() => `ucni-nacrt-classes-${predmetId}`, [predmetId]);
  const ACTIVE_KEY = useMemo(() => `ucni-nacrt-active-class-${predmetId}`, [predmetId]);

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    // Enkratna migracija: prenesi stare (skupne) razrede fizike v ločen prostor.
    if (predmetId === 'fizika' && !localStorage.getItem(CLASSES_KEY)) {
      const legacy = localStorage.getItem('ucni-nacrt-classes');
      if (legacy) {
        localStorage.setItem(CLASSES_KEY, legacy);
        const legacyActive = localStorage.getItem('ucni-nacrt-active-class');
        if (legacyActive) localStorage.setItem(ACTIVE_KEY, legacyActive);
      }
    }
    const loaded = loadClasses(CLASSES_KEY);
    setClasses(loaded);
    const saved = localStorage.getItem(ACTIVE_KEY);
    const valid = saved && loaded.find(c => c.id === saved) ? saved : null;
    setActiveId(valid ?? loaded[0]?.id ?? null);
  }, [CLASSES_KEY, ACTIVE_KEY, predmetId]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return;
      if (e.key === CLASSES_KEY) {
        try { setClasses(JSON.parse(e.newValue || '[]')); } catch { setClasses([]); }
      }
      if (e.key === ACTIVE_KEY) {
        setActiveId(e.newValue ?? null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [CLASSES_KEY, ACTIVE_KEY]);

  const addClass = useCallback((name: string) => {
    const id = crypto.randomUUID();
    setClasses(prev => {
      const next = [...prev, { id, name }];
      localStorage.setItem(CLASSES_KEY, JSON.stringify(next));
      return next;
    });
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
  }, [CLASSES_KEY, ACTIVE_KEY]);

  const renameClass = useCallback((id: string, name: string) => {
    setClasses(prev => {
      const next = prev.map(c => c.id === id ? { ...c, name } : c);
      localStorage.setItem(CLASSES_KEY, JSON.stringify(next));
      return next;
    });
  }, [CLASSES_KEY]);

  const removeClass = useCallback((id: string) => {
    let nextActive: string | null = null;
    setClasses(prev => {
      const next = prev.filter(c => c.id !== id);
      localStorage.setItem(CLASSES_KEY, JSON.stringify(next));
      ['progress', 'hours', 'enote-order', 'open-chapters'].forEach(k =>
        localStorage.removeItem(`ucni-nacrt-${k}-${id}`)
      );
      nextActive = next[0]?.id ?? null;
      return next;
    });
    setActiveId(prev => {
      if (prev !== id) return prev;
      if (nextActive) localStorage.setItem(ACTIVE_KEY, nextActive);
      else localStorage.removeItem(ACTIVE_KEY);
      return nextActive;
    });
  }, [CLASSES_KEY, ACTIVE_KEY]);

  const selectClass = useCallback((id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
  }, [ACTIVE_KEY]);

  const reorderClasses = useCallback((fromIndex: number, toIndex: number) => {
    setClasses(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      localStorage.setItem(CLASSES_KEY, JSON.stringify(next));
      return next;
    });
  }, [CLASSES_KEY]);

  const activeClass = classes.find(c => c.id === activeId) ?? null;

  return { classes, activeClass, activeId, addClass, renameClass, removeClass, selectClass, reorderClasses };
}
