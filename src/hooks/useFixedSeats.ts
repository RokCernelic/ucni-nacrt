'use client';

import { useState, useEffect, useCallback } from 'react';

/** Učenec je pripet na določen sedež od datuma `from` naprej (za pretekle dni ne velja). */
export interface FixedSeat {
  studentId: string;
  cell: string;   // "r-c"
  from: string;   // ISO datum, od katerega velja
}

export function useFixedSeats(classId?: string) {
  const key = classId ? `ucni-nacrt-fixedseats-${classId}` : undefined;
  const [fixed, setFixed] = useState<FixedSeat[]>([]);

  useEffect(() => {
    if (!key) { setFixed([]); return; }
    try { const raw = localStorage.getItem(key); setFixed(raw ? JSON.parse(raw) : []); }
    catch { setFixed([]); }
  }, [key]);

  const persist = useCallback((next: FixedSeat[]) => {
    setFixed(next);
    if (key) { localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event('ucni-nacrt-changed')); }
  }, [key]);

  /** Pripni učenca na sedež od danega datuma naprej (en učenec ima en pripet sedež). */
  const setFix = useCallback((studentId: string, cell: string, from: string) => {
    setFixed(prev => {
      const next = [...prev.filter(f => f.studentId !== studentId), { studentId, cell, from }];
      if (key) { localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event('ucni-nacrt-changed')); }
      return next;
    });
  }, [key]);

  const unfix = useCallback((studentId: string) => {
    setFixed(prev => {
      const next = prev.filter(f => f.studentId !== studentId);
      if (key) { localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event('ucni-nacrt-changed')); }
      return next;
    });
  }, [key]);

  return { fixed, setFix, unfix, persist };
}

/** Zemljevid celica->učenec pripetih sedežev, veljavnih na dani datum (from <= date). */
export function fixedMapForDate(fixed: FixedSeat[], date: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fixed) {
    if (f.from <= date && !(f.cell in map)) map[f.cell] = f.studentId;
  }
  return map;
}
