'use client';

import { useState, useEffect, useCallback } from 'react';

export interface Seating {
  rows: number;
  cols: number;
  /** ključi celic "r-c", ki NISO sedeži (odstranjena klop) */
  disabled: string[];
  /** razpored: ključ celice "r-c" -> id učenca */
  assign: Record<string, string>;
}

export const DEFAULT_SEATING: Seating = { rows: 4, cols: 6, disabled: [], assign: {} };

export const cellKey = (r: number, c: number) => `${r}-${c}`;

export function useSeating(classId?: string) {
  const key = classId ? `ucni-nacrt-seating-${classId}` : undefined;
  const [seating, setSeatingState] = useState<Seating>(DEFAULT_SEATING);

  useEffect(() => {
    if (!key) { setSeatingState(DEFAULT_SEATING); return; }
    try {
      const raw = localStorage.getItem(key);
      setSeatingState(raw ? { ...DEFAULT_SEATING, ...JSON.parse(raw) } : DEFAULT_SEATING);
    } catch { setSeatingState(DEFAULT_SEATING); }
  }, [key]);

  const setSeating = useCallback((next: Seating) => {
    setSeatingState(next);
    if (key) {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event('ucni-nacrt-changed'));
    }
  }, [key]);

  return { seating, setSeating };
}

/** Seznam aktivnih sedežev (celic, ki so klopi) po vrsticah. */
export function activeSeats(s: Seating): string[] {
  const dis = new Set(s.disabled);
  const out: string[] = [];
  for (let r = 0; r < s.rows; r++)
    for (let c = 0; c < s.cols; c++) {
      const k = cellKey(r, c);
      if (!dis.has(k)) out.push(k);
    }
  return out;
}

type Rng = () => number;

/** Deterministični generator (mulberry32) iz besedilnega semena — isti dan da vedno isti razpored. */
export function makeRng(seed: string): Rng {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const rowOf = (k: string) => Number(k.split('-')[0]);

/**
 * Naključno razporedi dane učence po aktivnih sedežih.
 * Učenci v `frontIds` se premešajo samo znotraj prve vrste (vrsta 0, pri tabli).
 * Če jih je več kot sedežev v prvi vrsti, ostanek pade med ostale sedeže (rezerva).
 * `rng` omogoča determinističen razpored (npr. za samodejni razpored dneva).
 */
export function shuffleInto(s: Seating, studentIds: string[], frontIds: string[] = [], rng: Rng = Math.random): Record<string, string> {
  const seats = activeSeats(s);
  const frontSet = new Set(frontIds);

  const frontSeats = shuffled(seats.filter(k => rowOf(k) === 0), rng);
  const otherSeats = shuffled(seats.filter(k => rowOf(k) !== 0), rng);

  const frontStudents = shuffled(studentIds.filter(id => frontSet.has(id)), rng);
  const restStudents = shuffled(studentIds.filter(id => !frontSet.has(id)), rng);

  const assign: Record<string, string> = {};

  // 1) prednostni učenci v sedeže prve vrste
  let fi = 0;
  for (const seat of frontSeats) {
    if (fi < frontStudents.length) assign[seat] = frontStudents[fi++];
  }

  // 2) preostali sedeži (najprej prazni v prvi vrsti, nato ostali) dobijo ostale učence
  const leftoverFrontSeats = frontSeats.filter(k => !(k in assign));
  const remainingSeats = [...leftoverFrontSeats, ...otherSeats];
  const remainingStudents = [...frontStudents.slice(fi), ...restStudents];
  remainingSeats.forEach((seat, i) => { if (i < remainingStudents.length) assign[seat] = remainingStudents[i]; });

  return assign;
}
