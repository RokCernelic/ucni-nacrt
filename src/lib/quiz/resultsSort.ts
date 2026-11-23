import { compareByLastName } from '@/lib/names';

/** Razvrščanje tabele rezultatov: stolpec in smer. Zapomni se (localStorage) in velja tudi za tisk. */
export type ResultsSort = { by: 'name' | 'points'; desc: boolean };

const KEY = 'rezultati-razvrsti';

export function readResultsSort(): ResultsSort {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'points') return { by: 'points', desc: true }; // starejši zapis
    if (v === 'name' || !v) return { by: 'name', desc: false };
    const p = JSON.parse(v) as ResultsSort;
    return { by: p.by === 'points' ? 'points' : 'name', desc: !!p.desc };
  } catch { return { by: 'name', desc: false }; }
}

export function saveResultsSort(s: ResultsSort) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Klik na stolpec: nov stolpec → privzeta smer (točke od največ, učenci A–Ž), isti stolpec → obratna smer. */
export const nextResultsSort = (cur: ResultsSort, by: ResultsSort['by']): ResultsSort =>
  cur.by === by ? { by, desc: !cur.desc } : { by, desc: by === 'points' };

export function compareResults(sort: ResultsSort, a: { name: string; points: number }, b: { name: string; points: number }): number {
  const sign = sort.desc ? -1 : 1;
  if (sort.by === 'points') return sign * (a.points - b.points) || compareByLastName(a.name, b.name);
  return sign * compareByLastName(a.name, b.name);
}
