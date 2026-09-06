'use client';

import { useState, useCallback } from 'react';

/**
 * Način "Strnjen seznam" (list mode), zapomnjen na razred (classId).
 * Shrani se v localStorage in sinhronizira na profil, tako da se ob vrnitvi
 * ali preklopu razreda pogled odpre v enakem stanju kot prej.
 */
export function useListMode(classId?: string): [boolean, (v: boolean) => void] {
  const key = classId ? `ucni-nacrt-listmode-${classId}` : 'ucni-nacrt-listmode';

  const [listMode, setListModeState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  });

  const setListMode = useCallback((v: boolean) => {
    setListModeState(v);
    try {
      localStorage.setItem(key, v ? '1' : '0');
      window.dispatchEvent(new Event('ucni-nacrt-changed'));
    } catch { /* ignore */ }
  }, [key]);

  return [listMode, setListMode];
}
