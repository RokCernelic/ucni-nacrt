'use client';

import { useState, useEffect, useCallback } from 'react';

export interface TopicQuestion {
  id: string;
  /** besedilo vprašanja ali naloge (očiščen HTML — prilepljeno iz Worda/spleta) */
  text: string;
  /** neobvezen odgovor / rešitev (očiščen HTML) */
  answer?: string;
  /** raven po (prenovljeni) Bloomovi taksonomiji, 1–6 */
  bloom?: BloomLevel;
  /** obkljukano za tisk */
  selected?: boolean;
}

export type BloomLevel = 1 | 2 | 3 | 4 | 5 | 6;
export const BLOOM: { level: BloomLevel; name: string; hint: string; color: string }[] = [
  { level: 1, name: 'Pomnjenje', hint: 'priklic dejstev, definicij, pojmov', color: '#7a8b99' },
  { level: 2, name: 'Razumevanje', hint: 'razložiti, opisati, primerjati s svojimi besedami', color: '#3f7cac' },
  { level: 3, name: 'Uporaba', hint: 'uporabiti znanje v novi situaciji, računske naloge', color: '#2d6a31' },
  { level: 4, name: 'Analiza', hint: 'razčleniti, poiskati vzroke, interpretirati podatke/grafe', color: '#b7791f' },
  { level: 5, name: 'Vrednotenje', hint: 'presoditi, utemeljiti, kritično oceniti', color: '#c0562b' },
  { level: 6, name: 'Ustvarjanje', hint: 'načrtovati poskus, sestaviti, predlagati rešitev', color: '#8e3b8e' },
];

const KEY = 'ucni-nacrt-topic-questions';
const SYNC = 'ucni-nacrt-topic-questions-changed';

function read(): Record<string, TopicQuestion[]> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

/**
 * Vprašanja in naloge, pripete na podpoglavje učnega načrta (ključ `${predmetId}:${podpoglavjeId}`).
 * Niso vezane na razred — isti nabor velja za vse razrede in šole z istim učnim načrtom.
 */
export function useTopicQuestions() {
  const [all, setAll] = useState<Record<string, TopicQuestion[]>>({});

  useEffect(() => {
    const load = () => setAll(read());
    load();
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) load(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SYNC, load);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(SYNC, load); };
  }, []);

  const getQuestions = useCallback((key: string) => all[key] ?? [], [all]);

  const setQuestions = useCallback((key: string, list: TopicQuestion[]) => {
    const next = { ...read() };
    if (list.length) next[key] = list; else delete next[key];
    localStorage.setItem(KEY, JSON.stringify(next));
    setAll(next);
    window.dispatchEvent(new Event(SYNC));
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  }, []);

  return { getQuestions, setQuestions };
}
