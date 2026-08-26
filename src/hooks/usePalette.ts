'use client';

import { useState, useEffect, useCallback } from 'react';
import { PALETTE_TYPES, PALETTE_COLORS } from './useEnotaOrder';

export interface PaletteChip {
  id: string;
  label: string;
  color: string;
}

const KEY = 'ucni-nacrt-palette';
const SYNC_EVENT = 'ucni-nacrt-palette-changed';

/** Privzeti nabor (obstoječi gumbi); id = oznaka za stabilnost. */
export const DEFAULT_PALETTE: PaletteChip[] = PALETTE_TYPES.map(t => ({ id: t, label: t, color: PALETTE_COLORS[t] }));

/** Barve za nove (lastne) gumbe – izbrane po vrsti. */
const COLOR_POOL = ['#c0392b', '#2980b9', '#8e44ad', '#e67e22', '#16a085', '#d6336c', '#8d6e63', '#4a5568'];

function readPalette(): PaletteChip[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

function save(next: PaletteChip[]) {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(SYNC_EVENT));
  window.dispatchEvent(new Event('ucni-nacrt-changed'));
}

export function usePalette() {
  const [chips, setChips] = useState<PaletteChip[]>(DEFAULT_PALETTE);

  useEffect(() => {
    const stored = readPalette();
    if (stored) setChips(stored);
  }, []);

  useEffect(() => {
    const resync = () => { const s = readPalette(); setChips(s ?? DEFAULT_PALETTE); };
    const onStorage = (e: StorageEvent) => { if (e.key === KEY && e.storageArea === localStorage) resync(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SYNC_EVENT, resync);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(SYNC_EVENT, resync); };
  }, []);

  const addChip = useCallback((label: string) => {
    const cur = readPalette() ?? DEFAULT_PALETTE;
    const color = COLOR_POOL[cur.length % COLOR_POOL.length];
    const next = [...cur, { id: crypto.randomUUID(), label, color }];
    setChips(next); save(next);
  }, []);

  const renameChip = useCallback((id: string, label: string) => {
    const next = (readPalette() ?? DEFAULT_PALETTE).map(c => c.id === id ? { ...c, label } : c);
    setChips(next); save(next);
  }, []);

  const removeChip = useCallback((id: string) => {
    const next = (readPalette() ?? DEFAULT_PALETTE).filter(c => c.id !== id);
    setChips(next); save(next);
  }, []);

  return { chips, addChip, renameChip, removeChip };
}
