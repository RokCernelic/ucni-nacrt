'use client';

import { useState, useEffect, useCallback } from 'react';

export function useOpenChapters(storageKey = 'ucni-nacrt-open-chapters') {
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const arr = JSON.parse(localStorage.getItem(storageKey) || '[]');
      setOpenChapters(new Set(arr));
    } catch {
      setOpenChapters(new Set());
    }
  }, [storageKey]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.storageArea === localStorage) {
        try { setOpenChapters(new Set(JSON.parse(e.newValue || '[]'))); } catch { setOpenChapters(new Set()); }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);

  const toggle = useCallback((id: string) => {
    setOpenChapters(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  }, [storageKey]);

  const expandAll = useCallback((ids: string[]) => {
    const next = new Set(ids);
    localStorage.setItem(storageKey, JSON.stringify([...next]));
    setOpenChapters(next);
  }, [storageKey]);

  const collapseAll = useCallback(() => {
    localStorage.setItem(storageKey, JSON.stringify([]));
    setOpenChapters(new Set());
  }, [storageKey]);

  return { openChapters, toggle, expandAll, collapseAll };
}
