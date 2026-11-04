'use client';

import { useCountdown } from '@/hooks/useCountdown';
import { useLastSchool } from '@/hooks/useLastSchool';

/** Majhen časovnik v meniju — za zadnjo odprto šolo (na straneh brez velikega odštevalnika). */
export default function NavCountdown() {
  const school = useLastSchool();
  const cd = useCountdown(school ?? undefined);
  if (!cd) return null; // brez zapomnjene šole → privzeti urnik
  return (
    <div title={school ? `Urnik: ${school}` : undefined}
      style={{ display: 'flex', alignItems: 'baseline', gap: '8px', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
      {cd.remaining !== null ? (
        <>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: '22px', fontWeight: 400, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: cd.inLesson ? '#bfe3c0' : '#ff6459' }}>{cd.clock}</span>
          <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
            {cd.caption}{school ? ` · ${school}` : ''}
          </span>
        </>
      ) : (
        <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
          Izven urnika{school ? ` · ${school}` : ''}
        </span>
      )}
    </div>
  );
}
