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
const colOf = (k: string) => Number(k.split('-')[1]);
const seatOf = (a: Record<string, string>, id: string) => Object.keys(a).find(k => a[k] === id);

export interface ShuffleOpts {
  /** id-ji fantov (za pravilo »sedi ob fantu«) */
  boyIds?: string[];
  /** id-ji učencev, ki morajo imeti soseda fanta */
  pairIds?: string[];
  /** pripeti sedeži: ključ celice "r-c" -> id učenca (učenec vedno sedi točno tu) */
  fixed?: Record<string, string>;
}

/**
 * Naključno razporedi dane učence po aktivnih sedežih z "gravitacijo":
 * sedeži se polnijo po vrstah od prve (vrsta 0, pri tabli) naprej, tako da
 * prosta mesta ostanejo vedno samo v zadnjih vrstah.
 * Učenci v `frontIds` sedijo v prvi vrsti, a naključno premešani znotraj nje
 * (nimajo fiksnega mesta). `pairIds` dobijo za soseda fanta.
 * `rng` omogoča determinističen razpored (npr. za samodejni razpored dneva).
 */
export function shuffleInto(s: Seating, studentIds: string[], frontIds: string[] = [], rng: Rng = Math.random, opts: ShuffleOpts = {}): Record<string, string> {
  const allSeats = activeSeats(s); // urejeni po vrsticah: vrsta 0 (pri tabli) najprej
  const activeSet = new Set(allSeats);
  const studentSet = new Set(studentIds);
  const frontSet = new Set(frontIds);

  // Veljavni pripeti sedeži (aktiven sedež + obstoječ učenec; en učenec = en sedež).
  const fixedMap: Record<string, string> = {};
  const fixedStudents = new Set<string>();
  for (const [cell, id] of Object.entries(opts.fixed ?? {})) {
    if (!activeSet.has(cell) || !studentSet.has(id) || fixedStudents.has(id) || (cell in fixedMap)) continue;
    fixedMap[cell] = id; fixedStudents.add(id);
  }
  const fixedCells = new Set(Object.keys(fixedMap));
  const seats = allSeats.filter(k => !fixedCells.has(k)); // proste za razporeditev ostalih

  const pool = studentIds.filter(id => !fixedStudents.has(id));
  const frontStudents = shuffled(pool.filter(id => frontSet.has(id)), rng);
  const restStudents = shuffled(pool.filter(id => !frontSet.has(id)), rng);
  // pripeti v prvo vrsto pridejo prvi → zasedejo prvo vrsto, nato ostali polnijo naprej
  const ordered = [...frontStudents, ...restStudents];

  const assign: Record<string, string> = { ...fixedMap };
  seats.forEach((seat, i) => { if (i < ordered.length) assign[seat] = ordered[i]; });

  // Premešaj učence znotraj prve vrste (brez pripetih), da pripeti-v-prvo-vrsto nimajo vedno istega stolpca.
  const row0 = seats.filter(k => rowOf(k) === 0 && (k in assign));
  const row0ids = shuffled(row0.map(k => assign[k]), rng);
  row0.forEach((k, i) => { assign[k] = row0ids[i]; });

  // Pravilo »sedi ob fantu« (npr. Tai): zagotovi vsaj enega soseda fanta (ne premika pripetih).
  const boySet = new Set(opts.boyIds ?? []);
  for (const pid of opts.pairIds ?? []) ensureBoyNeighbor(assign, s, pid, boySet, frontSet, rng, fixedCells);

  return assign;
}

/** Poskrbi, da ima `pairId` vsaj enega vodoravnega soseda iz `boySet` (best-effort, brez rušenja gravitacije/prve vrste/pripetih). */
function ensureBoyNeighbor(assign: Record<string, string>, s: Seating, pairId: string, boySet: Set<string>, frontSet: Set<string>, rng: Rng, locked: Set<string> = new Set()): void {
  const pk = seatOf(assign, pairId);
  if (!pk || locked.has(pk)) return; // pripetega ne premikamo
  const r = rowOf(pk), c = colOf(pk);
  const active = new Set(activeSeats(s));
  const isBoy = (id: string) => boySet.has(id);
  const neighbors = [`${r}-${c - 1}`, `${r}-${c + 1}`].filter(k => active.has(k));
  if (neighbors.some(k => assign[k] && isBoy(assign[k]))) return; // že zadovoljeno

  // soseda, ki ga smemo zamenjati (zaseden, ni fant, ni pripet)
  const nonBoyNeighbors = neighbors.filter(k => assign[k] && !isBoy(assign[k]) && !locked.has(k));

  // 1) zamenjava v isti vrsti (ne premakne nikogar med vrstami → nič se ne poruši)
  for (const gk of nonBoyNeighbors) {
    const rowBoyKeys = shuffled(Object.keys(assign).filter(k => rowOf(k) === r && isBoy(assign[k]) && assign[k] !== pairId && k !== gk && !locked.has(k)), rng);
    if (rowBoyKeys.length) { const bk = rowBoyKeys[0]; const g = assign[gk]; assign[gk] = assign[bk]; assign[bk] = g; return; }
  }
  // 2) zamenjava med vrstami (ohrani pripete v prvi vrsti)
  for (const gk of nonBoyNeighbors) {
    const gId = assign[gk], gFront = frontSet.has(gId), gkRow = rowOf(gk);
    for (const bk of shuffled(Object.keys(assign).filter(k => isBoy(assign[k]) && assign[k] !== pairId && k !== gk && !locked.has(k)), rng)) {
      const bId = assign[bk], bFront = frontSet.has(bId), bkRow = rowOf(bk);
      if (bFront && gkRow !== 0) continue;
      if (gFront && bkRow !== 0) continue;
      assign[gk] = bId; assign[bk] = gId; return;
    }
  }
  // 3) če so sosedje prazni/pripeti: premakni pairId k obstoječemu fantu (zamenjaj z njegovim sosedom)
  const pairFront = frontSet.has(pairId);
  for (const bk of shuffled(Object.keys(assign).filter(k => isBoy(assign[k]) && assign[k] !== pairId), rng)) {
    const br = rowOf(bk), bc = colOf(bk);
    for (const sk of [`${br}-${bc - 1}`, `${br}-${bc + 1}`].filter(k => active.has(k) && k !== pk && !locked.has(k))) {
      const occ = assign[sk];
      if (!occ) continue; // le zamenjava zasedenih (ohrani gravitacijo)
      if (pairFront && br !== 0) continue;
      if (frontSet.has(occ) && r !== 0) continue;
      assign[sk] = pairId; assign[pk] = occ; return;
    }
  }
}
