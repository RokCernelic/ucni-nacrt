'use client';

import { useCountdown } from '@/hooks/useCountdown';
import { useLastSchool } from '@/hooks/useLastSchool';

/** Časovnik v meniju (vse strani) — za zadnjo odprto šolo; samo ura, opis je v namigu. */
export default function NavCountdown() {
  const school = useLastSchool();
  const cd = useCountdown(school ?? undefined);
  if (!cd || cd.remaining === null) return null; // brez urnika ali izven pouka
  return (
    <span title={`${cd.caption}${school ? ` · ${school}` : ''}`}
      style={{ flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--font-serif)', fontSize: '22px', fontWeight: 400, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: cd.inLesson ? '#bfe3c0' : '#ff6459' }}>
      {cd.clock}
    </span>
  );
}
