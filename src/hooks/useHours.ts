'use client';

import { useState, useEffect, useCallback } from 'react';

export function useHours(storageKey = 'ucni-nacrt-hours') {
  const [hours, setHours] = useState<Record<string, number>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { setHours(JSON.parse(localStorage.getItem(storageKey) || '{}')); } catch { setHours({}); }
  }, [storageKey]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.storageArea === localStorage) {
        try { setHours(JSON.parse(e.newValue || '{}')); } catch { setHours({}); }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);

  const getHours = useCallback((key: string, fallback = 1) => hours[key] ?? fallback, [hours]);

  const change = useCallback((key: string, delta: number, gradeKeys: string[], gradeTarget: number, defaults: Record<string, number> = {}) => {
    setHours(prev => {
      const current = prev[key] ?? defaults[key] ?? 1;
      const next = current + delta;
      if (next < 0) return prev;
      const gradeSum = gradeKeys.reduce((s, k) => s + (prev[k] ?? defaults[k] ?? 1), 0);
      const remaining = gradeTarget - gradeSum;
      if (delta > 0 && remaining <= 0) return prev;
      const updated = { ...prev, [key]: next };
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return updated;
    });
  }, [storageKey]);

  return { getHours, change };
}
