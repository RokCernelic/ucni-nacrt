'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { frameGeometry, layoutSheet, type PrintItem, type SheetItem, type SheetLayout } from '@/lib/quiz/printSheet';
import { SheetHead, FrameView, ItemBody, type Sheet } from './QuizSheetParts';

/*
 * »Dva testa na en list A4«: list je po sredini razdeljen s črtkano črto. Zgoraj je test enega učenca, spodaj drugega;
 * na hrbtni strani (dvostransko tiskanje) sta zgoraj nadaljevanje prvega, spodaj nadaljevanje drugega.
 *
 * Vsak test ima štiri stolpce: sprednja stran levo in desno (pod glavo in okvirjem z odgovori), hrbtna stran levo in desno.
 * Vrstni red vprašanj po stolpcih in vrsticah ni pomemben, zato se vprašanja razporedijo tako, da je prostor čim bolje
 * izkoriščen (pakiranje po višini). Če vsa ne gredo, algoritem najprej preveri, katera vprašanja je najbolje odrezati
 * (največ ohranjenih točk; ob enakem raje odreže kasnejša), in isti izbor velja za vse učence.
 */

const HALF_H = 148.5;                   // mm: polovica A4
const PAD_T = 8, PAD_B = 7, SAFETY = 2; // mm: odmik v polovici + rezerva
const INNER = HALF_H - PAD_T - PAD_B - SAFETY;
const PX_MM = 25.4 / 96;
const COL_W = 85;                       // mm: širina enega stolpca ((178 − 8) / 2)

export interface Measured { head: number; /** višina vsakega vprašanja v stolpcu (z razmikom pod njim), mm */ heights: Record<string, number> }

export interface HalvesPlan {
  /** koliko od vseh vprašanj se prilega (enak izbor za vse učence) */
  kept: number; total: number;
  keptIds: Set<string>;
  /** vprašanja, ki se ne prilegajo */
  droppedItems: PrintItem[];
  m: Measured;
}

// ───────────────────────── pakiranje ─────────────────────────

function mulberry(seed: string): () => number {
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
function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Višine stolpcev: [sprednja levo, sprednja desno, hrbtna levo, hrbtna desna]. Sprednja sta nižja zaradi glave in okvira z odgovori. */
function capsFor(layoutForFrame: SheetLayout, m: Measured, withQr: boolean): number[] {
  const frameH = layoutForFrame.choice.length > 0 || withQr ? frameGeometry(layoutForFrame, withQr).h + 4 : 0;
  const c1 = INNER - m.head - frameH;
  return [c1, c1, INNER, INNER];
}

/** First-fit po danem vrstnem redu; vrne stolpce ali null, če se kaj ne prilega. */
function firstFit<T>(order: T[], h: (x: T) => number, caps: number[]): T[][] | null {
  const cols: T[][] = caps.map(() => []);
  const used = caps.map(() => 0);
  for (const x of order) {
    const hx = h(x);
    const k = caps.findIndex((cap, i) => used[i] + hx <= cap + 1e-6);
    if (k < 0) return null;
    cols[k].push(x); used[k] += hx;
  }
  return cols;
}
/** Zaporedno polnjenje (vrstni red ostane): levi stolpec do vrha, nato naslednji … */
function nextFit<T>(order: T[], h: (x: T) => number, caps: number[]): T[][] | null {
  const cols: T[][] = caps.map(() => []);
  let k = 0, used = 0;
  for (const x of order) {
    const hx = h(x);
    while (k < caps.length && used + hx > caps[k] + 1e-6) { k++; used = 0; }
    if (k >= caps.length) return null;
    cols[k].push(x); used += hx;
  }
  return cols;
}

/**
 * Razporeditev v štiri stolpce, ki NE ZAVISI od vrstnega reda vhoda (kanonični vrstni red: višina padajoče, nato ključ):
 * padajoče po višini, nato naključno (deterministično). Tako je prileganje enako za vse premešane liste istega izbora.
 */
function packCanonical<T>(items: T[], h: (x: T) => number, key: (x: T) => string, caps: number[], tries = 60): T[][] | null {
  const canon = [...items].sort((a, b) => h(b) - h(a) || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const ffd = firstFit(canon, h, caps);
  if (ffd) return ffd;
  const rng = mulberry('pakiranje');
  for (let t = 0; t < tries; t++) {
    const r = firstFit(shuffled(canon, rng), h, caps);
    if (r) return r;
  }
  return null;
}

// ───────────────────────── izbor vprašanj ─────────────────────────

/**
 * Določi, katera vprašanja ostanejo (isti izbor za vse učence). Če gredo vsa, ostanejo vsa; sicer preveri kombinacije
 * odrezanih vprašanj (od najmanj odrezanih) in izbere tisto z največ ohranjenimi točkami; ob enakem odreže kasnejša.
 */
export function planFor(items: PrintItem[], m: Measured, withQr: boolean): HalvesPlan {
  const base = layoutSheet(items, null);
  const seq = [...base.choice, ...base.free];             // izvirni vrstni red (izbirna, nato prosta)
  const n = seq.length;
  const hOf = (c: SheetItem) => m.heights[c.item.id] ?? 0;

  const feasible = (keep: boolean[]): boolean => {
    const list = seq.filter((_, i) => keep[i]);
    const frameLayout = { choice: list.filter(c => c.item.choice), free: [] } as unknown as SheetLayout;
    const caps = capsFor(frameLayout, m, withQr);
    if (list.reduce((s, c) => s + hOf(c), 0) > caps.reduce((a, b) => a + b, 0) + 1e-6) return false;
    return !!packCanonical(list, hOf, c => c.item.id, caps, 25);
  };

  let keep: boolean[] = Array(n).fill(true);
  if (!feasible(keep)) {
    let best: boolean[] | null = null;
    for (let d = 1; d <= n && !best; d++) {
      // vse kombinacije d odrezanih vprašanj (omejeno število; sicer glej rezervo spodaj)
      const idx = Array.from({ length: d }, (_, i) => i);
      let count = 0, bestScore: [number, number] | null = null;
      for (;;) {
        if (++count > 25000) break;
        const k = Array(n).fill(true) as boolean[];
        idx.forEach(i => { k[i] = false; });
        if (feasible(k)) {
          const pts = seq.reduce((s, c, i) => s + (k[i] ? c.item.points : 0), 0);
          const late = idx.reduce((s, i) => s + i, 0);      // višje = odrezana kasnejša
          if (!bestScore || pts > bestScore[0] || (pts === bestScore[0] && late > bestScore[1])) { bestScore = [pts, late]; best = k; }
        }
        let p = d - 1;
        while (p >= 0 && idx[p] === n - d + p) p--;
        if (p < 0) break;
        idx[p]++;
        for (let q = p + 1; q < d; q++) idx[q] = idx[q - 1] + 1;
      }
    }
    if (!best) {
      // rezerva: odreži od konca, dokler se ne prilega
      best = Array(n).fill(true);
      for (let i = n - 1; i >= 0 && !feasible(best); i--) best[i] = false;
    }
    keep = best;
  }
  const keptIds = new Set(seq.filter((_, i) => keep[i]).map(c => c.item.id));
  return { kept: keptIds.size, total: n, keptIds, droppedItems: items.filter(i => !keptIds.has(i.id)), m };
}

/**
 * Razporedi vprašanja lista v štiri stolpce. Brez mešanja vrstni red ostane zaporeden (levo navzdol, nato desno …);
 * z mešanjem (`scrambleSeed`) ima vsak učenec drugačno razporeditev. Znotraj stolpca so vprašanja po številki.
 */
export function placeItems(layout: SheetLayout, m: Measured, withQr: boolean, scrambleSeed: string | null): SheetItem[][] {
  const seq = [...layout.choice, ...layout.free];
  const h = (c: SheetItem) => m.heights[c.item.id] ?? 0;
  const caps = capsFor(layout, m, withQr);
  let cols: SheetItem[][] | null = null;
  if (scrambleSeed) {
    const rng = mulberry(scrambleSeed);
    for (let t = 0; t < 40 && !cols; t++) cols = firstFit(shuffled(seq, rng), h, caps);
  }
  if (!scrambleSeed) cols = nextFit(seq, h, caps);   // brez mešanja: vrstni red ostane zaporeden, če gre
  cols ??= packCanonical(seq, h, c => c.item.id, caps);
  cols ??= [seq, [], [], []]; // ne bi se smelo zgoditi (izbor je preverjen)
  return cols.map(c => [...c].sort((a, b) => a.n - b.n));
}

// ───────────────────────── merjenje ─────────────────────────

/**
 * Izmeri višine glave in posameznih vprašanj (v skritem izrisu z enakimi slogi kot pri tisku) in iz njih izračuna izbor.
 * `node` je skriti merilni izris (prikaži ga nekje v komponenti); `plan` je null, dokler meritev ni pripravljena.
 */
export function useHalvesPlan(items: PrintItem[], enabled: boolean, withQr: boolean, title: string) {
  const base = useMemo(() => layoutSheet(items, null), [items]);
  const seq = useMemo(() => [...base.choice, ...base.free], [base]);
  const ref = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Measured | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const head = ((el.querySelector('[data-h]') as HTMLElement | null)?.getBoundingClientRect().height ?? 0) * PX_MM;
      const heights: Record<string, number> = {};
      el.querySelectorAll('[data-i]').forEach(n => { heights[(n as HTMLElement).dataset.i!] = (n as HTMLElement).getBoundingClientRect().height * PX_MM; });
      setM(prev => {
        if (prev && Math.abs(prev.head - head) < 0.05) {
          const ks = Object.keys(heights);
          if (ks.length === Object.keys(prev.heights).length && ks.every(k => Math.abs((prev.heights[k] ?? -1) - heights[k]) < 0.05)) return prev;
        }
        return { head, heights };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled, seq]);

  const plan = useMemo(() => (enabled && m ? planFor(items, m, withQr) : null), [enabled, m, items, withQr]);
  const sample: Sheet = { key: 'm', name: 'IME IN PRIIMEK', qr: null, layout: base };
  const node = enabled && typeof document !== 'undefined' ? createPortal(
    <div ref={ref} className="pqz-preview pqz-hbox pqz-hmeasure" aria-hidden>
      <div data-h style={{ display: 'flow-root' }}><SheetHead sheet={sample} title={title} placeholder /></div>
      {seq.map(c => (
        <div data-i={c.item.id} key={c.item.id} style={{ display: 'flow-root', width: `${COL_W}mm` }}>
          <div className="pqz-hitem"><ItemBody c={c} /></div>
        </div>
      ))}
    </div>,
    document.body,
  ) : null;
  return { plan, node };
}

// ───────────────────────── izris ─────────────────────────

function HalfView({ sheet, part, plan, title, className, placeholder, scramble }: {
  sheet: Sheet; part: 1 | 2; plan: HalvesPlan; title: string; className?: string; placeholder?: boolean; scramble?: boolean;
}) {
  const cols = placeItems(sheet.layout, plan.m, !!sheet.qr, scramble ? `${sheet.key}|razpored` : null);
  const [left, right] = part === 1 ? [cols[0], cols[1]] : [cols[2], cols[3]];
  const col = (items: SheetItem[]) => <div className="pqz-hcol">{items.map(c => <div className="pqz-hitem" key={c.n}><ItemBody c={c} /></div>)}</div>;
  return (
    <>
      {part === 1 && (
        <>
          <SheetHead sheet={sheet} title={title} className={className} placeholder={placeholder} />
          <FrameView sheet={sheet} />
        </>
      )}
      <div className="pqz-hcols">{col(left)}{col(right)}</div>
    </>
  );
}

/**
 * Strani za tisk: po dva lista (učenca) na list A4; sprednja in hrbtna stran vsakega para.
 * `duplicate`: en sam enak list (brez imen) se natisne zgoraj in spodaj. `scramble`: vsak učenec ima drugačno razporeditev.
 */
export function HalvesPages({ sheets, plan, title, className, placeholder, duplicate, scramble }: {
  sheets: Sheet[]; plan: HalvesPlan; title: string; className?: string; placeholder?: boolean; duplicate?: boolean; scramble?: boolean;
}) {
  const pairs: [Sheet, Sheet | undefined][] = [];
  if (duplicate && sheets[0]) pairs.push([sheets[0], sheets[0]]);
  else for (let i = 0; i < sheets.length; i += 2) pairs.push([sheets[i], sheets[i + 1]]);
  return (
    <>
      {pairs.flatMap(([a, b], pi) => ([1, 2] as const).map(part => (
        <div className="pqz-page" key={`${pi}-${part}`}>
          <div className="pqz-half"><HalfView sheet={a} part={part} plan={plan} title={title} className={className} placeholder={placeholder} scramble={scramble} /></div>
          <div className="pqz-half">{b && <HalfView sheet={b} part={part} plan={plan} title={title} className={className} placeholder={placeholder} scramble={scramble} />}</div>
        </div>
      )))}
    </>
  );
}
