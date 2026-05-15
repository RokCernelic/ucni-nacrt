'use client';

import { useState, useEffect, useCallback } from 'react';

const KEY = 'ucni-nacrt-cilji';

export const PALETTE_TYPES = ['Pisno ocenjevanje', 'Preverjanje', 'Ustno ocenjevanje', 'Utrjevanje'] as const;
export type PaletteType = typeof PALETTE_TYPES[number];

export const PALETTE_COLORS: Record<string, string> = {
  'Pisno ocenjevanje': '#c0392b',
  'Preverjanje':       '#2980b9',
  'Ustno ocenjevanje': '#8e44ad',
  'Utrjevanje':        '#e67e22',
};

// Stored as compact references
type StoredItem =
  | { k: 'c'; id: string }
  | { k: 'x'; id: string; text: string; checked: boolean };

type Store = Record<string, StoredItem[]>;

export type ResolvedItem =
  | { kind: 'curriculum'; id: string; tip: 'O' | 'I'; text: string }
  | { kind: 'custom'; id: string; text: string; checked: boolean; color: string };

function load(): Store {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function save(s: Store) { localStorage.setItem(KEY, JSON.stringify(s)); }

export function useCiljiState() {
  const [store, setStore] = useState<Store>({});
  useEffect(() => { setStore(load()); }, []);

  const resolve = useCallback((enotaKey: string, curriculumCilji: { id: string; tip: 'O' | 'I'; text: string }[]): ResolvedItem[] => {
    const currMap = new Map(curriculumCilji.map(c => [c.id, c]));
    const stored = store[enotaKey] ?? curriculumCilji.map(c => ({ k: 'c' as const, id: c.id }));
    return stored.flatMap((item): ResolvedItem[] => {
      if (item.k === 'c') {
        const c = currMap.get(item.id);
        return c ? [{ kind: 'curriculum', id: item.id, tip: c.tip, text: c.text }] : [];
      }
      return [{ kind: 'custom', id: item.id, text: item.text, checked: item.checked, color: PALETTE_COLORS[item.text] ?? '#666' }];
    });
  }, [store]);

  const addItem = useCallback((enotaKey: string, text: string, atIndex: number, currIds: string[]) => {
    setStore(prev => {
      const cur = prev[enotaKey] ?? currIds.map(id => ({ k: 'c' as const, id }));
      const item: StoredItem = { k: 'x', id: crypto.randomUUID(), text, checked: false };
      const next = [...cur.slice(0, atIndex), item, ...cur.slice(atIndex)];
      const s = { ...prev, [enotaKey]: next };
      save(s);
      return s;
    });
  }, []);

  const reorder = useCallback((enotaKey: string, from: number, to: number, currIds: string[]) => {
    setStore(prev => {
      const cur = [...(prev[enotaKey] ?? currIds.map(id => ({ k: 'c' as const, id })))];
      const adj = to > from ? to - 1 : to;
      if (from === adj) return prev;
      const [moved] = cur.splice(from, 1);
      cur.splice(adj, 0, moved);
      const s = { ...prev, [enotaKey]: cur };
      save(s);
      return s;
    });
  }, []);

  const toggleCustom = useCallback((enotaKey: string, id: string) => {
    setStore(prev => {
      const cur = prev[enotaKey];
      if (!cur) return prev;
      const s = { ...prev, [enotaKey]: cur.map(i => i.k === 'x' && i.id === id ? { ...i, checked: !i.checked } : i) };
      save(s);
      return s;
    });
  }, []);

  const countCustom = useCallback((enotaKeys: string[]) =>
    enotaKeys.reduce((n, k) => n + (store[k]?.filter(i => i.k === 'x').length ?? 0), 0),
  [store]);

  const countCheckedCustom = useCallback((enotaKeys: string[]) =>
    enotaKeys.reduce((n, k) => n + (store[k]?.filter(i => i.k === 'x' && i.checked).length ?? 0), 0),
  [store]);

  return { resolve, addItem, reorder, toggleCustom, countCustom, countCheckedCustom };
}
