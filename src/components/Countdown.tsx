'use client';

import { useState, useEffect } from 'react';
import { useSchedule, toMinutes } from '@/hooks/useSchedule';

export default function Countdown() {
  const { schedule } = useSchedule();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null; // prepreči neujemanje pri hidraciji

  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  const lessons = schedule
    .map((l, i) => ({ i, startS: toMinutes(l.start) * 60, endS: toMinutes(l.end) * 60 }))
    .filter(l => l.startS >= 0 && l.endS > l.startS)
    .sort((a, b) => a.startS - b.startS);

  let minutes: number | null = null;
  let caption = '';
  let accent = false; // true = med uro (odštevanje do konca)

  const active = lessons.find(l => nowSec >= l.startS && nowSec < l.endS);
  if (active) {
    minutes = Math.max(1, Math.ceil((active.endS - nowSec) / 60));
    caption = `do konca ${active.i + 1}. ure`;
    accent = true;
  } else {
    const next = lessons.find(l => l.startS > nowSec);
    if (next) {
      minutes = Math.max(1, Math.ceil((next.startS - nowSec) / 60));
      caption = `do začetka ${next.i + 1}. ure`;
    }
  }

  return (
    <div style={{ textAlign: 'right', flexShrink: 0, alignSelf: 'flex-start' }}>
      {minutes !== null ? (
        <>
          <div style={{
            fontFamily: 'var(--font-serif)', fontSize: 'clamp(30px,4.5vw,52px)',
            fontWeight: 300, lineHeight: 1, whiteSpace: 'nowrap',
            color: accent ? '#bfe3c0' : '#fff',
          }}>
            {minutes}
            <span style={{ fontSize: '0.34em', fontFamily: 'var(--font-sans)', fontWeight: 500, marginLeft: '6px', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.04em' }}>
              min
            </span>
          </div>
          <div style={{
            fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.5)', marginTop: '7px', whiteSpace: 'nowrap',
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
