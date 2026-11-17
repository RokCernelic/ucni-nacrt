'use client';

import { useEffect } from 'react';
import { rememberSchool } from '@/hooks/useLastSchool';

/** Zapomni si šolo odprtega predmeta / sedežnega reda — časovnik v meniju sledi njenemu urniku. */
export default function RememberSchool({ school }: { school?: string | null }) {
  useEffect(() => { rememberSchool(school ?? undefined); }, [school]);
  return null;
}
