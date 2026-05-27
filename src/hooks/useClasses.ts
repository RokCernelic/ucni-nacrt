'use client';

import { useState, useEffect, useCallback } from 'react';

const CLASSES_KEY = 'ucni-nacrt-classes';
const ACTIVE_KEY = 'ucni-nacrt-active-class';

export type SchoolClass = { id: string; name: string };

function loadClasses(): SchoolClass[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(CLASSES_KEY) || '[]'); } catch { return []; }
}

export function useClasses() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadClasses();
    setClasses(loaded);
    const saved = localStorage.getItem(ACTIVE_KEY);
    const valid = saved && loaded.find(c => c.id === saved) ? saved : null;
    const initial = valid ?? loaded[0]?.id ?? null;
    setActiveId(initial);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return;
      if (e.key === CLASSES_KEY) {
        try {
          const loaded: SchoolClass[] = JSON.parse(e.newValue || '[]');
          setClasses(loaded);
        } catch { setClasses([]); }
      }
      if (e.key === ACTIVE_KEY) {
        setActiveId(e.newValue ?? null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addClass = useCallback((name: string) => {
    const id = crypto.randomUUID();
    setClasses(prev => {
      const next = [...prev, { id, name }];
      localStorage.setItem(CLASSES_KEY, JSON.stringify(next));
      return next;
    });
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
  }, []);

  const renameClass = useCallback((id: string, name: string) => {
    setClasses(prev => {
      const next = prev.map(c => c.id === id ? { ...c, name } : c);
      localStorage.setItem(CLASSES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeClass = useCallback((id: string) => {
    let nextActive: string | null = null;
    setClasses(prev => {
      const next = prev.filter(c => c.id !== id);
      localStorage.setItem(CLASSES_KEY, JSON.stringify(next));
      ['progress', 'hours', 'enote-order'].forEach(k =>
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
  }, []);

  const selectClass = useCallback((id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
  }, []);

  const reorderClasses = useCallback((fromIndex: number, toIndex: number) => {
    setClasses(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      localStorage.setItem(CLASSES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const activeClass = classes.find(c => c.id === activeId) ?? null;

  return { classes, activeClass, activeId, addClass, renameClass, removeClass, selectClass, reorderClasses };
}
