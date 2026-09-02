'use client';

import { useCountdown } from '@/hooks/useCountdown';

export default function Countdown({ school }: { school?: string }) {
  const cd = useCountdown(school);
  if (!cd) return null; // prepreči neujemanje pri hidraciji

  return (
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      {cd.remaining !== null ? (
        <>
          <div style={{
            fontFamily: 'var(--font-serif)', fontSize: 'clamp(44px,6.5vw,76px)',
            fontWeight: 300, lineHeight: 1, whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            color: cd.inLesson ? '#bfe3c0' : '#fff',
          }}>
            {cd.clock}
          </div>
          <div style={{
            fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.5)', marginTop: '9px', whiteSpace: 'nowrap',
          }}>
            {cd.caption}
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
