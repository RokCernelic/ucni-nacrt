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
 * Številčenje gre VEDNO po vrsti v bralnem redu (levi stolpec navzdol, nato desni, nato hrbtna stran), da učenec brez
 * zmede sledi vpisovanju v krogce; kdo je katera naloga, pa je shranjeno (vrstni red po učencih), zato točkovanje,
 * skener in statistika vedo, katera naloga je katera. Z mešanjem vprašanj ima vsak učenec drugačen vrstni red nalog;
 * algoritem poišče vrstni red, pri katerem se zaporedno polnjenje stolpcev izide. Če vsa vprašanja ne gredo, najprej
 * preveri, katera je najbolje odrezati (največ ohranjenih točk; ob enakem raje kasnejša), isti izbor velja za vse.
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

/** Zaporedno polnjenje (vrstni red ostane): levi stolpec do vrha, nato naslednji … Vrne stolpce ali null, če se kaj ne prilega. */
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
 * Poišče vrstni red vprašanj (izbirna najprej, nato prosta), pri katerem se zaporedno polnjenje štirih stolpcev izide.
 * Z `seed` najprej poskusi naključne vrstne rede (vsak učenec drugačen); nato vedno še determinističnega (izvirni,
 * padajoče, naraščajoče, naključni s fiksnim semenom) — če se izide izbor v načrtu, se izide tudi pri vsakem učencu.
 * Vrne id-je po številkah ali null.
 */
export function findOrder(items: PrintItem[], m: Measured, withQr: boolean, seed: string | null, tries = 300): string[] | null {
  const choice = items.filter(i => i.choice), free = items.filter(i => !i.choice);
  const caps = capsFor(layoutSheet(items, null), m, withQr);
  const h = (i: PrintItem) => m.heights[i.id] ?? 0;
  const attempt = (c: PrintItem[], f: PrintItem[]): string[] | null => {
    const seq = [...c, ...f];
    return nextFit(seq, h, caps) ? seq.map(i => i.id) : null;
  };
  if (seed) {
    const rng = mulberry(seed);
    for (let t = 0; t < tries; t++) { const r = attempt(shuffled(choice, rng), shuffled(free, rng)); if (r) return r; }
  }
  const by = (dir: 1 | -1) => (a: PrintItem[]) => [...a].sort((x, y) => dir * (h(y) - h(x)) || (x.id < y.id ? -1 : 1));
  const desc = by(1), asc = by(-1);
  const det = attempt(choice, free) ?? attempt(desc(choice), desc(free)) ?? attempt(asc(choice), asc(free));
  if (det) return det;
  const rng = mulberry('nacrt');
  for (let t = 0; t < 120; t++) { const r = attempt(shuffled(choice, rng), shuffled(free, rng)); if (r) return r; }
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
    const kept = list.map(c => c.item as PrintItem);
    const caps = capsFor(layoutSheet(kept, null), m, withQr);
    if (list.reduce((s, c) => s + hOf(c), 0) > caps.reduce((a, b) => a + b, 0) + 1e-6) return false;
    return !!findOrder(kept, m, withQr, null);
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

function HalfView({ sheet, part, plan, title, className, placeholder }: {
  sheet: Sheet; part: 1 | 2; plan: HalvesPlan; title: string; className?: string; placeholder?: boolean;
}) {
  // številke so po vrsti v bralnem redu: levi stolpec navzdol, nato desni, nato hrbtna stran
  const seq = [...sheet.layout.choice, ...sheet.layout.free];
  const cols = nextFit(seq, c => plan.m.heights[c.item.id] ?? 0, capsFor(sheet.layout, plan.m, !!sheet.qr)) ?? [seq, [], [], []];
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
 * `duplicate`: en sam enak list (brez imen) se natisne zgoraj in spodaj.
 */
export function HalvesPages({ sheets, plan, title, className, placeholder, duplicate }: {
  sheets: Sheet[]; plan: HalvesPlan; title: string; className?: string; placeholder?: boolean; duplicate?: boolean;
}) {
  const pairs: [Sheet, Sheet | undefined][] = [];
  if (duplicate && sheets[0]) pairs.push([sheets[0], sheets[0]]);
  else for (let i = 0; i < sheets.length; i += 2) pairs.push([sheets[i], sheets[i + 1]]);
  return (
    <>
      {pairs.flatMap(([a, b], pi) => ([1, 2] as const).map(part => (
        <div className="pqz-page" key={`${pi}-${part}`}>
          <div className="pqz-half"><HalfView sheet={a} part={part} plan={plan} title={title} className={className} placeholder={placeholder} /></div>
          <div className="pqz-half">{b && <HalfView sheet={b} part={part} plan={plan} title={title} className={className} placeholder={placeholder} />}</div>
        </div>
      )))}
    </>
  );
}
