'use client';

import { useState, useEffect, useCallback } from 'react';

export const PALETTE_TYPES = ['Pisno ocenjevanje', 'Preverjanje', 'Ustno ocenjevanje', 'Utrjevanje'] as const;
export type PaletteType = typeof PALETTE_TYPES[number];

export const PALETTE_COLORS: Record<string, string> = {
  'Pisno ocenjevanje': '#c0392b',
  'Preverjanje':       '#2980b9',
  'Ustno ocenjevanje': '#8e44ad',
  'Utrjevanje':        '#e67e22',
};

type StoredItem =
  | { k: 'c'; id: string }
  | { k: 'x'; id: string; type: string; checked: boolean; color?: string };

type Store = Record<string, StoredItem[]>;

export type ResolvedEnotaItem =
  | { kind: 'curriculum'; id: string }
  | { kind: 'custom'; id: string; type: string; checked: boolean; color: string };

export function useEnotaOrder(storageKey = 'ucni-nacrt-enote-order') {
  const [store, setStore] = useState<Store>({});

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

  const resolve = useCallback((poglavjeKey: string, currIds: string[]): ResolvedEnotaItem[] => {
    const currSet = new Set(currIds);
    const stored = store[poglavjeKey] ?? currIds.map(id => ({ k: 'c' as const, id }));
    return stored.flatMap((item): ResolvedEnotaItem[] => {
      if (item.k === 'c') {
        return currSet.has(item.id) ? [{ kind: 'curriculum', id: item.id }] : [];
      }
      return [{ kind: 'custom', id: item.id, type: item.type, checked: item.checked, color: item.color ?? PALETTE_COLORS[item.type] ?? '#666' }];
    });
  }, [store]);

  const addEnota = useCallback((poglavjeKey: string, type: string, color: string, atIndex: number, currIds: string[]) => {
    setStore(prev => {
      const cur = prev[poglavjeKey] ?? currIds.map(id => ({ k: 'c' as const, id }));
      const item: StoredItem = { k: 'x', id: crypto.randomUUID(), type, checked: false, color };
      const next = [...cur.slice(0, atIndex), item, ...cur.slice(atIndex)];
      const s = { ...prev, [poglavjeKey]: next };
      localStorage.setItem(storageKey, JSON.stringify(s));
      return s;
    });
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  }, [storageKey]);

  const reorder = useCallback((poglavjeKey: string, from: number, to: number, currIds: string[]) => {
    setStore(prev => {
      const cur = [...(prev[poglavjeKey] ?? currIds.map(id => ({ k: 'c' as const, id })))];
      const adj = to > from ? to - 1 : to;
      if (from === adj) return prev;
      const [moved] = cur.splice(from, 1);
      cur.splice(adj, 0, moved);
      const s = { ...prev, [poglavjeKey]: cur };
      localStorage.setItem(storageKey, JSON.stringify(s));
      return s;
    });
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  }, [storageKey]);

  const renameCustom = useCallback((poglavjeKey: string, id: string, label: string) => {
    setStore(prev => {
      const cur = prev[poglavjeKey];
      if (!cur) return prev;
      const s = { ...prev, [poglavjeKey]: cur.map(i => i.k === 'x' && i.id === id ? { ...i, type: label } : i) };
      localStorage.setItem(storageKey, JSON.stringify(s));
      return s;
    });
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  }, [storageKey]);

  const toggleCustom = useCallback((poglavjeKey: string, id: string) => {
    setStore(prev => {
      const cur = prev[poglavjeKey];
      if (!cur) return prev;
      const s = { ...prev, [poglavjeKey]: cur.map(i => i.k === 'x' && i.id === id ? { ...i, checked: !i.checked } : i) };
      localStorage.setItem(storageKey, JSON.stringify(s));
      return s;
    });
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  }, [storageKey]);

  const removeEnota = useCallback((poglavjeKey: string, id: string) => {
    setStore(prev => {
      const cur = prev[poglavjeKey];
      if (!cur) return prev;
      const s = { ...prev, [poglavjeKey]: cur.filter(i => i.id !== id) };
      localStorage.setItem(storageKey, JSON.stringify(s));
      return s;
    });
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  }, [storageKey]);

  const countCustom = useCallback((poglavjeKeys: string[]) =>
    poglavjeKeys.reduce((n, k) => n + (store[k]?.filter(i => i.k === 'x').length ?? 0), 0),
  [store]);

  const countCheckedCustom = useCallback((poglavjeKeys: string[]) =>
    poglavjeKeys.reduce((n, k) => n + (store[k]?.filter(i => i.k === 'x' && i.checked).length ?? 0), 0),
  [store]);

  return { resolve, addEnota, reorder, removeEnota, toggleCustom, renameCustom, countCustom, countCheckedCustom };
}
