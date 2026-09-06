'use client';

import { useState, useEffect, useCallback } from 'react';

const KEY = 'ucni-nacrt-seating-selected';
const EV = 'ucni-nacrt-selclass-changed';

/**
 * Izbrana učilnica (razred) za sedežni red — deljena med navigacijo in stranjo.
 * Lokalna izbira (ni sinhronizirana v oblak), le za usklajenost v istem zavihku.
 */
export function useSelectedClass(): [string, (id: string) => void] {
  const [sel, setSel] = useState('');

  useEffect(() => {
    const read = () => { try { setSel(localStorage.getItem(KEY) || ''); } catch { setSel(''); } };
    read();
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) read(); };
    window.addEventListener(EV, read);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(EV, read); window.removeEventListener('storage', onStorage); };
  }, []);

  const setSelected = useCallback((id: string) => {
    setSel(id);
    try { localStorage.setItem(KEY, id); window.dispatchEvent(new Event(EV)); } catch { /* ignore */ }
  }, []);

  return [sel, setSelected];
}
