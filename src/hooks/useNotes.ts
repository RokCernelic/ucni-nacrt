'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Prosto besedilo (učna vsebina / potek ure) na podpoglavje.
 * Shranjuje se po ključu `${predmetId}:${podpoglavjeId}` v localStorage in
 * (za prijavljene) v oblak preko dogodka `ucni-nacrt-changed`.
 */
export function useNotes(storageKey = 'ucni-nacrt-notes') {
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { setNotes(JSON.parse(localStorage.getItem(storageKey) || '{}')); } catch { setNotes({}); }
  }, [storageKey]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.storageArea === localStorage) {
        try { setNotes(JSON.parse(e.newValue || '{}')); } catch { setNotes({}); }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);

  const getNote = useCallback((key: string) => notes[key] ?? '', [notes]);

  const setNote = useCallback((key: string, value: string) => {
    setNotes(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(new Event('ucni-nacrt-changed'));
      return next;
    });
  }, [storageKey]);

  return { getNote, setNote };
}
