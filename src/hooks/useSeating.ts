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

// ───────────────────────── pravičnost skozi čas (manj pogosto isti sedež / isti sosed) ─────────────────────────

export interface SeatHistory {
  /** id učenca -> ključ celice -> kolikokrat je do zdaj sedel na tem sedežu */
  seatUsage: Record<string, Record<string, number>>;
  /** id učenca -> id soseda -> kolikokrat sta bila doslej vodoravna soseda */
  neighborUsage: Record<string, Record<string, number>>;
}

export const emptyHistory = (): SeatHistory => ({ seatUsage: {}, neighborUsage: {} });

function bump(map: Record<string, Record<string, number>>, a: string, b: string) {
  if (!map[a]) map[a] = {};
  map[a][b] = (map[a][b] ?? 0) + 1;
}

/** Vpiše en dejanski razpored v zgodovino (mutira `history` — za zaporedno gradnjo skozi dneve). */
export function bumpHistory(history: SeatHistory, assign: Record<string, string>): void {
  for (const [cell, studentId] of Object.entries(assign)) bump(history.seatUsage, studentId, cell);
  for (const cell of Object.keys(assign)) {
    const rightKey = `${rowOf(cell)}-${colOf(cell) + 1}`;
    if (assign[rightKey]) {
      bump(history.neighborUsage, assign[cell], assign[rightKey]);
      bump(history.neighborUsage, assign[rightKey], assign[cell]);
    }
  }
}

/**
 * Uteženo razporedi `students` na `seats` (brez ponavljanja): sedeži, na katerih je
 * učenec doslej sedel redkeje, imajo večjo verjetnost. Brez zgodovine je enakovredno
 * navadnemu naključnemu razporedu.
 */
function weightedAssignSeats(students: string[], seats: string[], seatUsage: Record<string, Record<string, number>> | undefined, rng: Rng): Record<string, string> {
  const assign: Record<string, string> = {};
  const remaining = [...seats];
  for (const student of shuffled(students, rng)) {
    if (remaining.length === 0) break;
    const weights = remaining.map(seat => 1 / (1 + (seatUsage?.[student]?.[seat] ?? 0)) ** 3);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    let idx = remaining.length - 1;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 1e-9) { idx = i; break; } }
    assign[remaining.splice(idx, 1)[0]] = student;
  }
  return assign;
}

export interface ShuffleOpts {
  /** id-ji fantov (za pravilo »sedi ob fantu«) */
  boyIds?: string[];
  /** id-ji učencev, ki morajo imeti soseda fanta */
  pairIds?: string[];
  /** pripeti sedeži: ključ celice "r-c" -> id učenca (učenec vedno sedi točno tu) */
  fixed?: Record<string, string>;
  /** dosedanja zasedenost sedežev/sosedov — za pravičnejšo (manj ponavljajočo se) razporeditev */
  history?: SeatHistory;
}

/**
 * Naključno razporedi dane učence po aktivnih sedežih z "gravitacijo":
 * sedeži se polnijo po vrstah od prve (vrsta 0, pri tabli) naprej, tako da
 * prosta mesta ostanejo vedno samo v zadnjih vrstah.
 * Učenci v `frontIds` sedijo v prvi vrsti, a naključno premešani znotraj nje
 * (nimajo fiksnega mesta). `pairIds` dobijo za soseda fanta.
 * Če je podana `opts.history`, se razporeditev (sedež in sosedje) nagiba proti
 * manj pogosto uporabljenim kombinacijam za posameznega učenca (best-effort).
 * `rng` omogoča determinističen razpored (npr. za samodejni razpored dneva).
 */
export function shuffleInto(s: Seating, studentIds: string[], frontIds: string[] = [], rng: Rng = Math.random, opts: ShuffleOpts = {}): Record<string, string> {
  const allSeats = activeSeats(s); // urejeni po vrsticah: vrsta 0 (pri tabli) najprej
  const activeSet = new Set(allSeats);
  const studentSet = new Set(studentIds);
  const frontSet = new Set(frontIds);
  const seatUsage = opts.history?.seatUsage;

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
  const frontStudents = pool.filter(id => frontSet.has(id));
  const restStudents = pool.filter(id => !frontSet.has(id));
  // pripeti v prvo vrsto pridejo prvi → zasedejo prve sedeže (gravitacija), nato ostali polnijo naprej
  const frontTargetSeats = seats.slice(0, frontStudents.length);
  const restTargetSeats = seats.slice(frontStudents.length, frontStudents.length + restStudents.length);

  const assign: Record<string, string> = {
    ...fixedMap,
    ...weightedAssignSeats(frontStudents, frontTargetSeats, seatUsage, rng),
    ...weightedAssignSeats(restStudents, restTargetSeats, seatUsage, rng),
  };

  // Znotraj prve vrste (vsi njeni zasedeni sedeži, ne le pripeti-v-prvo-vrsto — gravitacija lahko vanjo
  // spusti tudi druge) še enkrat pravično premešaj stolpce, da isti učenec nima vedno istega mesta.
  const row0 = seats.filter(k => rowOf(k) === 0 && (k in assign));
  const row0Reassigned = weightedAssignSeats(row0.map(k => assign[k]), row0, seatUsage, rng);
  Object.assign(assign, row0Reassigned);

  // Pravilo »sedi ob fantu« (npr. Tai): zagotovi vsaj enega soseda fanta (trdo pravilo, ne premika pripetih).
  const boySet = new Set(opts.boyIds ?? []);
  const pairIds = opts.pairIds ?? [];
  for (const pid of pairIds) ensureBoyNeighbor(assign, s, pid, boySet, frontSet, rng, fixedCells);

  // Pravičnost pri sosedih: poskusi zmanjšati pogosto ponavljajoče se pare (best-effort, ne krši zgornjih pravil).
  if (opts.history) reduceRepeatNeighbors(assign, s, opts.history, frontSet, boySet, new Set(pairIds), fixedCells, rng);

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

/** Ali ima `pairId` (po trenutnem `assign`) vsaj enega vodoravnega soseda iz `boySet`? (velja tudi, če ni razporejen.) */
function hasBoyNeighbor(assign: Record<string, string>, active: Set<string>, pairId: string, boySet: Set<string>): boolean {
  const pk = seatOf(assign, pairId);
  if (!pk) return true;
  const r = rowOf(pk), c = colOf(pk);
  const neighbors = [`${r}-${c - 1}`, `${r}-${c + 1}`].filter(k => active.has(k));
  return neighbors.some(k => assign[k] && boySet.has(assign[k]));
}

/**
 * Best-effort naključno iskanje (omejeno število poskusov): zamenjaj dva (nepripeta) sedeža,
 * če to zmanjša skupno "težo" pogosto ponavljajočih se sosedskih parov — brez kršenja prve
 * vrste ali pravila »sedi ob fantu« za `pairSet`. Ne poruši gravitacije (menjava dveh zasedenih
 * sedežev ne spremeni, kateri sedeži so zasedeni).
 */
function reduceRepeatNeighbors(
  assign: Record<string, string>, s: Seating, history: SeatHistory,
  frontSet: Set<string>, boySet: Set<string>, pairSet: Set<string>, locked: Set<string>, rng: Rng, iterations = 80,
): void {
  const active = new Set(activeSeats(s));
  const neighborCount = (a: string, b: string) => history.neighborUsage[a]?.[b] ?? 0;

  const badnessAt = (cell: string): number => {
    const rightKey = `${rowOf(cell)}-${colOf(cell) + 1}`;
    const leftKey = `${rowOf(cell)}-${colOf(cell) - 1}`;
    const id = assign[cell];
    if (!id) return 0;
    let sum = 0;
    if (assign[rightKey]) sum += neighborCount(id, assign[rightKey]) ** 2;
    if (assign[leftKey]) sum += neighborCount(id, assign[leftKey]) ** 2;
    return sum;
  };

  const movable = Object.keys(assign).filter(k => !locked.has(k));
  if (movable.length < 2) return;

  for (let it = 0; it < iterations; it++) {
    const k1 = movable[Math.floor(rng() * movable.length)];
    const k2 = movable[Math.floor(rng() * movable.length)];
    if (k1 === k2) continue;
    const s1 = assign[k1], s2 = assign[k2];
    if (!s1 || !s2) continue;
    const r1front = frontSet.has(s1), r2front = frontSet.has(s2);
    const row1 = rowOf(k1), row2 = rowOf(k2);
    if (r1front && row2 !== 0) continue; // prva vrsta se ne sme kršiti z menjavo
    if (r2front && row1 !== 0) continue;

    const before = badnessAt(k1) + badnessAt(k2);
    assign[k1] = s2; assign[k2] = s1;
    const after = badnessAt(k1) + badnessAt(k2);

    // Preveri VSE učence s pravilom »ob fantu«, ki bi jih ta zamenjava lahko prizadela — ne le s1/s2
    // samih, temveč tudi koga tretjega, ki sedi tik ob k1/k2 (menjava mu je pravkar zamenjala soseda).
    const affectedPairIds = pairSet.size
      ? [...pairSet].filter(pid => {
          const pk = seatOf(assign, pid);
          if (!pk) return false;
          return pk === k1 || pk === k2 || rowOf(pk) === rowOf(k1) && Math.abs(colOf(pk) - colOf(k1)) <= 1
            || rowOf(pk) === rowOf(k2) && Math.abs(colOf(pk) - colOf(k2)) <= 1;
        })
      : [];
    const breaksBoyRule = affectedPairIds.some(pid => !hasBoyNeighbor(assign, active, pid, boySet));

    if (breaksBoyRule || after >= before) { assign[k1] = s1; assign[k2] = s2; } // razveljavi
  }
}

/** En dan iz urnika za namene gradnje zgodovine: tloris in fiksni sedeži, veljavni na ta dan. */
export interface HistoryDay {
  date: string;
  layout: Seating;
  fixed: Record<string, string>;
}

/**
 * Zgradi statistiko zasedenosti sedežev/sosedov iz preteklih dni (v kronološkem vrstnem redu).
 * Za dneve z ročnim prepisom (`overrides[date]`) uporabi tega kot resnico; za samodejne dneve
 * izračuna razpored z isto pravično metodo, na podlagi zgodovine, nakopičene do TEGA dne —
 * s čimer je izračun dosleden in ponovljiv (enak seed kot pri prikazu tistega dne).
 */
export function buildSeatHistory(
  days: HistoryDay[],
  overrides: Record<string, Record<string, string>>,
  studentIds: string[],
  frontIds: string[],
  boyIds: string[],
  pairIds: string[],
  seedFor: (date: string) => Rng,
): SeatHistory {
  const history = emptyHistory();
  for (const day of days) {
    const assign = overrides[day.date]
      ?? shuffleInto(day.layout, studentIds, frontIds, seedFor(day.date), { boyIds, pairIds, fixed: day.fixed, history });
    bumpHistory(history, assign);
  }
  return history;
}
