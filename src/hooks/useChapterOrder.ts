'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Vrstni red poglavij znotraj razreda. Ključ: `${predmetId}:${razred}`,
 * vrednost: seznam id-jev poglavij v izbranem vrstnem redu. Poglavja, ki jih
 * ni v shrambi (npr. nova), se dodajo na konec v izvornem vrstnem redu.
 */
export function useChapterOrder(storageKey = 'ucni-nacrt-chapter-order') {
  const [store, setStore] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { setStore(JSON.parse(localStorage.getItem(storageKey) || '{}')); } catch { setStore({}); }
  }, [storageKey]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.storageArea === localStorage) {
        try { setStore(JSON.parse(e.newValue || '{}')); } catch { setStore({}); }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);

  const resolveOrder = useCallback((groupKey: string, currIds: string[]): string[] => {
    const stored = store[groupKey];
    if (!stored) return currIds;
    const currSet = new Set(currIds);
    const ordered = stored.filter(id => currSet.has(id));
    const seen = new Set(ordered);
    for (const id of currIds) if (!seen.has(id)) ordered.push(id);
    return ordered;
  }, [store]);

  const reorderChapters = useCallback((groupKey: string, from: number, to: number, currIds: string[]) => {
    setStore(prev => {
      const base = prev[groupKey] ?? currIds;
      // uskladi z dejanskimi id-ji (odstrani manjkajoče, dodaj nove na konec)
      const currSet = new Set(currIds);
      const cur = base.filter(id => currSet.has(id));
      const seen = new Set(cur);
      for (const id of currIds) if (!seen.has(id)) cur.push(id);

      const adj = to > from ? to - 1 : to;
      if (from === adj) return prev;
      const [moved] = cur.splice(from, 1);
      cur.splice(adj, 0, moved);
      const s = { ...prev, [groupKey]: cur };
      localStorage.setItem(storageKey, JSON.stringify(s));
      window.dispatchEvent(new Event('ucni-nacrt-changed'));
      return s;
    });
  }, [storageKey]);

  return { resolveOrder, reorderChapters };
}
