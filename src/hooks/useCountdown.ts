'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSchedules, schoolKey, toMinutes } from '@/hooks/useSchedule';

export interface CountdownState {
  /** MM:SS ("" če izven urnika) */
  clock: string;
  /** npr. "do konca · 3.ura vš" oz. "" izven urnika */
  caption: string;
  /** true = trenutno med uro (odštevanje do konca) */
  inLesson: boolean;
  /** preostale sekunde; null = izven urnika */
  remaining: number | null;
  /** trenutni čas (za prikaz ure) */
  now: Date;
}

/**
 * Skupna logika odštevalnika za dano šolo (podnaslov predmeta).
 * Vrne null do prve montaže (prepreči neujemanje pri hidraciji).
 */
export function useCountdown(school?: string): CountdownState | null {
  const { getSchedule } = useSchedules();
  const schedule = getSchedule(schoolKey(school));
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return useMemo<CountdownState | null>(() => {
    if (!now) return null;
    const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    const lessons = schedule
      .map((l, i) => ({ i, name: l.name, startS: toMinutes(l.start) * 60, endS: toMinutes(l.end) * 60 }))
      .filter(l => l.startS >= 0 && l.endS > l.startS)
      .sort((a, b) => a.startS - b.startS);

    const labelOf = (l: { name?: string; i: number }) => l.name || `${l.i + 1}. ura`;

    let remaining: number | null = null;
    let caption = '';
    let inLesson = false;

    const active = lessons.find(l => nowSec >= l.startS && nowSec < l.endS);
    if (active) {
      remaining = active.endS - nowSec;
      caption = `do konca · ${labelOf(active)}`;
      inLesson = true;
    } else {
      const next = lessons.find(l => l.startS > nowSec);
      if (next) {
        remaining = next.startS - nowSec;
        caption = `do začetka · ${labelOf(next)}`;
      }
    }

    const clock = remaining === null
      ? ''
      : `${String(Math.floor(Math.max(0, remaining) / 60)).padStart(2, '0')}:${String(Math.max(0, remaining) % 60).padStart(2, '0')}`;

    return { clock, caption, inLesson, remaining, now };
  }, [now, schedule]);
}
