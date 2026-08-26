'use client';

import { useState, useEffect } from 'react';
import { useSchedule, toMinutes } from '@/hooks/useSchedule';

export default function Countdown() {
  const { schedule } = useSchedule();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null; // prepreči neujemanje pri hidraciji

  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  const lessons = schedule
    .map((l, i) => ({ i, name: l.name, count: l.count !== false, startS: toMinutes(l.start) * 60, endS: toMinutes(l.end) * 60 }))
    .filter(l => l.count && l.startS >= 0 && l.endS > l.startS)
    .sort((a, b) => a.startS - b.startS);

  const labelOf = (l: { name?: string; i: number }) => l.name || `${l.i + 1}. ura`;

  let remaining: number | null = null; // preostale sekunde
  let caption = '';
  let accent = false; // true = med uro (odštevanje do konca)

  const active = lessons.find(l => nowSec >= l.startS && nowSec < l.endS);
  if (active) {
    remaining = active.endS - nowSec;
    caption = `do konca · ${labelOf(active)}`;
    accent = true;
  } else {
    const next = lessons.find(l => l.startS > nowSec);
    if (next) {
      remaining = next.startS - nowSec;
      caption = `do začetka · ${labelOf(next)}`;
    }
  }

  const clock = remaining !== null
    ? `${String(Math.floor(Math.max(0, remaining) / 60)).padStart(2, '0')}:${String(Math.max(0, remaining) % 60).padStart(2, '0')}`
    : '';

  return (
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      {remaining !== null ? (
        <>
          <div style={{
            fontFamily: 'var(--font-serif)', fontSize: 'clamp(44px,6.5vw,76px)',
            fontWeight: 300, lineHeight: 1, whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            color: accent ? '#bfe3c0' : '#fff',
          }}>
            {clock}
          </div>
          <div style={{
            fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.5)', marginTop: '9px', whiteSpace: 'nowrap',
          }}>
            {caption}
          </div>
        </>
      ) : (
        <div style={{
          fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.4)', marginTop: '8px', whiteSpace: 'nowrap',
        }}>
          Izven urnika
        </div>
      )}
    </div>
  );
}
