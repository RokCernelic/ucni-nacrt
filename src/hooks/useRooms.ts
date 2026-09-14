'use client';

import { useState, useEffect, useCallback } from 'react';

/** Tloris učilnice: velikost mreže in izključene celice (kjer ni klopi). Deljeno globalno po učilnici. */
export interface RoomPlan {
  rows: number;
  cols: number;
  disabled: string[]; // ključi celic "r-c", kjer NI sedeža
}

export const DEFAULT_ROOM_PLAN: RoomPlan = { rows: 4, cols: 6, disabled: [] };

const KEY = 'ucni-nacrt-rooms';
const SYNC = 'ucni-nacrt-rooms-changed';

function read(): Record<string, RoomPlan> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function useRooms() {
  const [plans, setPlans] = useState<Record<string, RoomPlan>>({});

  useEffect(() => { setPlans(read()); }, []);
  useEffect(() => {
    const refresh = () => setPlans(read());
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) refresh(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SYNC, refresh);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(SYNC, refresh); };
  }, []);

  const setPlan = useCallback((room: string, plan: RoomPlan) => {
    setPlans(prev => {
      const next = { ...prev, [room]: plan };
      localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(SYNC));
      window.dispatchEvent(new Event('ucni-nacrt-changed'));
      return next;
    });
  }, []);

  const removePlan = useCallback((room: string) => {
    setPlans(prev => {
      const next = { ...prev }; delete next[room];
      localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(SYNC));
      window.dispatchEvent(new Event('ucni-nacrt-changed'));
      return next;
    });
  }, []);

  const getPlan = useCallback((room?: string): RoomPlan | null => (room && plans[room]) ? plans[room] : null, [plans]);

  return { plans, getPlan, setPlan, removePlan };
}
