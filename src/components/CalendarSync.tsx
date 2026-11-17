'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { applyCalendarEverywhere } from '@/lib/calendarPlacement';

/**
 * Po prijavi (ko se podatki naložijo tudi iz oblaka) vstavi uradni šolski koledar (počitnice, praznike, oznake)
 * v vse učne načrte vseh razredov, ki ga še nimajo. Ponovi se ob vrnitvi na zavihek (npr. nov razred).
 */
export default function CalendarSync() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const run = () => { try { applyCalendarEverywhere(); } catch (e) { console.error('Koledar ni bil vstavljen', e); } };
    const t = setTimeout(run, 4000);
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [user]);
  return null;
}
