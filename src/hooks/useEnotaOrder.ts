'use client';

import { useState, useEffect, useCallback } from 'react';
import { relayoutDated, customHours } from '@/lib/calendarPlacement';

export const PALETTE_TYPES = ['Pisno ocenjevanje', 'Preverjanje', 'Ustno ocenjevanje', 'Utrjevanje'] as const;
export type PaletteType = typeof PALETTE_TYPES[number];

export const PALETTE_COLORS: Record<string, string> = {
  'Pisno ocenjevanje': '#c0392b',
  'Preverjanje':       '#2980b9',
  'Ustno ocenjevanje': '#8e44ad',
  'Utrjevanje':        '#e67e22',
};

export type StoredItem =
  | { k: 'c'; id: string }
  | { k: 'x'; id: string; type: string; checked: boolean; color?: string; hours?: number; pause?: boolean; from?: string; to?: string; info?: boolean };

/**
 * Čas brez pouka (počitnice, praznik, dan dejavnosti): ure, ki odpadejo — ne štejejo v nabor ur učnega načrta,
 * nimajo vsebine, vprašanj ne ciljev; časovni trak jih upošteva kot pretečen čas.
 */
export const PAUSE_TYPES = [
  { label: 'Počitnice', hours: 2 },
  { label: 'Praznik', hours: 1 },
  { label: 'Dan dejavnosti', hours: 1 },
] as const;
export const PAUSE_COLOR = '#b7791f';

type Store = Record<string, StoredItem[]>;

export type ResolvedEnotaItem =
  | { kind: 'curriculum'; id: string }
  | { kind: 'custom'; id: string; type: string; checked: boolean; color: string; hours: number; pause?: boolean; from?: string; to?: string; info?: boolean };

/**
 * Sestavi poln, usklajen seznam enot za poglavje: shranjeni vrstni red
 * (brez podpoglavij, ki jih ni več), nato nova podpoglavja iz učnega načrta na konec.
 * Tako se prikazani seznam in urejanje (dodajanje/premikanje) vedno ujemata po indeksih.
 */
export function materialize(stored: StoredItem[] | undefined, currIds: string[]): StoredItem[] {
  const currSet = new Set(currIds);
  const base = stored ?? currIds.map(id => ({ k: 'c' as const, id }));
  const seen = new Set<string>();
  const out: StoredItem[] = [];
  for (const it of base) {
    if (it.k === 'c') { if (!currSet.has(it.id) || seen.has(it.id)) continue; seen.add(it.id); out.push(it); }
    else out.push(it);
  }
  for (const id of currIds) if (!seen.has(id)) out.push({ k: 'c', id });
  return out;
}

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
    return materialize(store[poglavjeKey], currIds).map((item): ResolvedEnotaItem =>
      item.k === 'c'
        ? { kind: 'curriculum', id: item.id }
        : item.pause
          ? { kind: 'custom', id: item.id, type: item.type, checked: false, color: item.color ?? PAUSE_COLOR, hours: item.info ? 0 : item.hours ?? 1, pause: true, ...(item.from ? { from: item.from } : {}), ...(item.to ? { to: item.to } : {}), ...(item.info ? { info: true } : {}) }
          : { kind: 'custom', id: item.id, type: item.type, checked: item.checked, color: item.color ?? PALETTE_COLORS[item.type] ?? '#666', hours: item.hours ?? 1 });
  }, [store]);

  const addEnota = useCallback((poglavjeKey: string, type: string, color: string, atIndex: number, currIds: string[], hours: number = 1, pause?: boolean | { from: string; to: string; info?: boolean }) => {
    setStore(prev => {
      const cur = materialize(prev[poglavjeKey], currIds);
      const item: StoredItem = pause
        ? { k: 'x', id: crypto.randomUUID(), type, checked: false, color, hours, pause: true, ...(typeof pause === 'object' ? pause : {}) }
        : { k: 'x', id: crypto.randomUUID(), type, checked: false, color, hours };
      const next = [...cur.slice(0, atIndex), item, ...cur.slice(atIndex)];
      const s = { ...prev, [poglavjeKey]: next };
      localStorage.setItem(storageKey, JSON.stringify(s));
      return s;
    });
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  }, [storageKey]);

  /** Premakne lastno enoto v drugo poglavje (ohrani isti id, zato ji sledijo zapiski in vprašanja). */
  const moveEnota = useCallback((fromKey: string, toKey: string, id: string, atIndex: number, toCurrIds: string[]) => {
    setStore(prev => {
      const src = prev[fromKey];
      const item = src?.find(i => i.k === 'x' && i.id === id);
      if (!src || !item || fromKey === toKey) return prev;
      const dst = materialize(prev[toKey], toCurrIds);
      const s = { ...prev, [fromKey]: src.filter(i => i.id !== id), [toKey]: [...dst.slice(0, atIndex), item, ...dst.slice(atIndex)] };
      localStorage.setItem(storageKey, JSON.stringify(s));
      return s;
    });
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  }, [storageKey]);

  const reorder = useCallback((poglavjeKey: string, from: number, to: number, currIds: string[]) => {
    setStore(prev => {
      const cur = materialize(prev[poglavjeKey], currIds);
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

  const setCustomHours = useCallback((poglavjeKey: string, id: string, hours: number) => {
    if (hours < 0) return;
    setStore(prev => {
      const cur = prev[poglavjeKey];
      if (!cur) return prev;
      const s = { ...prev, [poglavjeKey]: cur.map(i => i.k === 'x' && i.id === id ? { ...i, hours } : i) };
      localStorage.setItem(storageKey, JSON.stringify(s));
      return s;
    });
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  }, [storageKey]);

  /** Datumi počitnic (YYYY-MM-DD); z njimi časovni trak poravna to mesto s koledarjem. Po želji nastavi tudi ure. */
  const setCustomDates = useCallback((poglavjeKey: string, id: string, from: string | null, to: string | null, hours?: number) => {
    setStore(prev => {
      const cur = prev[poglavjeKey];
      if (!cur) return prev;
      const s = { ...prev, [poglavjeKey]: cur.map(i => {
        if (i.k !== 'x' || i.id !== id) return i;
        const { from: _f, to: _t, ...rest } = i; void _f; void _t;
        return { ...rest, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(hours != null ? { hours } : {}) };
      }) };
      localStorage.setItem(storageKey, JSON.stringify(s));
      return s;
    });
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  }, [storageKey]);

  /**
   * Razvrsti vse elemente z datumom (počitnice, prazniki, dnevi dejavnosti, oznake) v danih poglavjih (en razred,
   * v vrstnem redu poglavij) po datumu: vsak gre na mesto, do katerega razred po urah pride do dneva pred datumom
   * (`targetOf`), in vedno za prejšnjim po datumu. `patch` najprej nastavi datume (in ure) enemu elementu.
   */
  const placeDated = useCallback((
    chapters: { key: string; currIds: string[] }[],
    curriculumHours: (key: string, id: string) => number,
    targetOf: (from: string) => number,
    patch?: { key: string; id: string; from: string | null; to: string | null; hours?: number },
  ) => {
    setStore(prev => {
      const lists = chapters.map(c => materialize(prev[c.key], c.currIds));
      if (patch) {
        const ci = chapters.findIndex(c => c.key === patch.key);
        if (ci >= 0) lists[ci] = lists[ci].map(i => {
          if (i.k !== 'x' || i.id !== patch.id) return i;
          const { from: _f, to: _t, ...rest } = i; void _f; void _t;
          return { ...rest, ...(patch.from ? { from: patch.from } : {}), ...(patch.to ? { to: patch.to } : {}), ...(patch.hours != null ? { hours: patch.hours } : {}) };
        });
      }
      if (!patch && !lists.some(l => l.some(i => i.k === 'x' && i.pause && i.from))) return prev;
      const rest = relayoutDated(lists, (ci, i) => (i.k === 'c' ? curriculumHours(chapters[ci].key, i.id) : customHours(i)), targetOf);
      const s = { ...prev };
      chapters.forEach((c, ci) => { s[c.key] = rest[ci]; });
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

  // Vsota ur vseh lastnih (»x«) vnosov v danih poglavjih — vsak lahko predstavlja poljubno število ur, ne le 1.
  // počitnice / prazniki nimajo ur
  const isCustom = (i: StoredItem): i is Extract<StoredItem, { k: 'x' }> => i.k === 'x' && !i.pause;

  const countCustom = useCallback((poglavjeKeys: string[]) =>
    poglavjeKeys.reduce((n, k) => n + (store[k]?.filter(isCustom).reduce((s, i) => s + (i.hours ?? 1), 0) ?? 0), 0),
  [store]);

  const countCheckedCustom = useCallback((poglavjeKeys: string[]) =>
    poglavjeKeys.reduce((n, k) => n + (store[k]?.filter(isCustom).filter(i => i.checked).reduce((s, i) => s + (i.hours ?? 1), 0) ?? 0), 0),
  [store]);

  return { resolve, addEnota, moveEnota, reorder, removeEnota, toggleCustom, renameCustom, setCustomHours, setCustomDates, placeDated, countCustom, countCheckedCustom };
}
