'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSubjects } from '@/hooks/useSubjects';
import { getCurriculum } from '@/data/registry';
import type { SchoolClass } from '@/hooks/useClasses';

export interface ClassEntry {
  classId: string;
  className: string;      // npr. "9A"
  subjectId: string;      // id instance predmeta
  subjectName: string;    // npr. "Fizika"
  subtitle: string;       // šola, npr. "OŠ Cerklje ob Krki"
  /** berljiva oznaka za prikaz */
  label: string;
}

/** Zbere vse razrede iz vseh predmetov (instanc). */
export function useAllClasses(): ClassEntry[] {
  const { subjects } = useSubjects();
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key && e.key.startsWith('ucni-nacrt-classes-')) refresh(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('ucni-nacrt-changed', refresh);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('ucni-nacrt-changed', refresh); };
  }, [refresh]);

  const entries: ClassEntry[] = [];
  for (const s of subjects) {
    const entry = getCurriculum(s.curriculum);
    const subjectName = entry?.predmet.naslov ?? s.curriculum;
    let classes: SchoolClass[] = [];
    try { classes = JSON.parse(localStorage.getItem(`ucni-nacrt-classes-${s.id}`) || '[]'); } catch { classes = []; }
    for (const c of classes) {
      const parts = [c.name, subjectName, s.subtitle].filter(Boolean);
      entries.push({
        classId: c.id,
        className: c.name,
        subjectId: s.id,
        subjectName,
        subtitle: s.subtitle,
        label: parts.join(' · '),
      });
    }
  }
  // tick je le sprožilec ponovnega izračuna
  void tick;
  return entries;
}
