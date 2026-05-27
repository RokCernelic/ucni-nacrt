'use client';

import { useState, useEffect, useCallback } from 'react';

export function useProgress(storageKey = 'ucni-nacrt-progress') {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { setChecked(JSON.parse(localStorage.getItem(storageKey) || '{}')); } catch { setChecked({}); }
  }, [storageKey]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.storageArea === localStorage) {
        try { setChecked(JSON.parse(e.newValue || '{}')); } catch { setChecked({}); }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);

  const toggle = useCallback((enoteId: string) => {
    setChecked(prev => {
      const next = { ...prev, [enoteId]: !prev[enoteId] };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  const reset = useCallback((predmetId: string, allIds: string[]) => {
    setChecked(prev => {
      const next = { ...prev };
      allIds.forEach(id => delete next[`${predmetId}:${id}`]);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  return { checked, toggle, reset };
}
