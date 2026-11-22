'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { frameGeometry, layoutSheet, type PrintItem, type SheetItem, type SheetLayout } from '@/lib/quiz/printSheet';
import { SheetHead, FrameView, ItemBody, type Sheet } from './QuizSheetParts';

/*
 * »Dva testa na en list A4«: list je po sredini razdeljen s črtkano črto. Zgoraj je test enega učenca, spodaj drugega;
 * na hrbtni strani (dvostransko tiskanje) sta zgoraj nadaljevanje prvega, spodaj nadaljevanje drugega.
 *
 * Naloge, ki jih preveri skener (ABCD, drži / ne drži, več možnosti), so v dveh stolpcih; ostale (račun, zapis odgovora)
 * imajo celo širino, ker za reševanje potrebujejo prostor. Sprednja polovica: glava, okvir z odgovori, nato naloge;
 * hrbtna polovica: nadaljevanje.
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
const FULL_W = 178;                     // mm: cela širina (naloge brez krogcev)

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

/** Višini polovic testa: [sprednja, hrbtna]. Sprednja je nižja zaradi glave in okvira z odgovori. */
function capsFor(layoutForFrame: SheetLayout, m: Measured, withQr: boolean): number[] {
  const frameH = layoutForFrame.choice.length > 0 || withQr ? frameGeometry(layoutForFrame, withQr).h + 4 : 0;
  return [INNER - m.head - frameH, INNER];
}

/** Ena polovica testa: izbirne naloge v dveh stolpcih (levo, desno), pod njimi ostale čez celo širino. */
export interface HalfPart<T> { left: T[]; right: T[]; free: T[] }

/** Razdelitev zaporedja v dva stolpca (levi nato desni) z najnižjo višino; ob enakem je levi daljši. */
function balance<T>(seg: T[], h: (x: T) => number): { split: number; height: number } {
  const total = seg.reduce((t, x) => t + h(x), 0);
  let best = { split: seg.length, height: total }, left = 0;
  for (let k = 0; k <= seg.length; k++) {
    if (k > 0) left += h(seg[k - 1]);
    const height = Math.max(left, total - left);
    if (height < best.height - 1e-6 || (Math.abs(height - best.height) < 1e-6 && left >= total - left)) best = { split: k, height };
  }
  return best;
}

/**
 * Zaporedno polnjenje polovic (vrstni red ostane): izbirne naloge v dveh stolpcih — na prvo polovico kolikor jih gre,
 * ostale na naslednjo —, nato ostale naloge čez celo širino pod njimi. Vrne polovice ali null, če se kaj ne prilega.
 */
function packHalves<T>(order: T[], isChoice: (x: T) => boolean, h: (x: T) => number, caps: number[]): HalfPart<T>[] | null {
  const choice = order.filter(isChoice), free = order.filter(x => !isChoice(x));
  const parts: HalfPart<T>[] = caps.map(() => ({ left: [], right: [], free: [] }));
  const used = caps.map(() => 0);
  let p = 0, i = 0;
  while (i < choice.length) {
    if (p >= caps.length) return null;
    let fit: { k: number; split: number; height: number } | null = null;
    for (let k = choice.length; k > i; k--) {
      const r = balance(choice.slice(i, k), h);
      if (r.height <= caps[p] + 1e-6) { fit = { k, ...r }; break; }
    }
    if (!fit) { p++; continue; }
    const seg = choice.slice(i, fit.k);
    parts[p].left = seg.slice(0, fit.split); parts[p].right = seg.slice(fit.split);
    used[p] = fit.height; i = fit.k;
    if (i < choice.length) p++;
  }
  for (const x of free) {
    while (p < caps.length && used[p] + h(x) > caps[p] + 1e-6) p++;
    if (p >= caps.length) return null;
    parts[p].free.push(x); used[p] += h(x);
  }
  return parts;
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
    return packHalves(seq, i => i.choice, h, caps) ? seq.map(i => i.id) : null;
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
    // hitra spodnja meja: izbirne v dveh stolpcih vsaj polovico svoje višine, ostale vso
    if (list.reduce((s, c) => s + hOf(c) / (c.item.choice ? 2 : 1), 0) > caps.reduce((a, b) => a + b, 0) + 1e-6) return false;
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
        <div data-i={c.item.id} key={c.item.id} style={{ display: 'flow-root', width: `${c.item.choice ? COL_W : FULL_W}mm` }}>
          <div className="pqz-hitem" style={hGap(c.item)}><ItemBody c={c} /></div>
        </div>
      ))}
    </div>,
    document.body,
  ) : null;
  return { plan, node };
}

// ───────────────────────── izris ─────────────────────────

/** urejanje na zaslonu: klik na nalogo jo odpre (`activeId` je poudarjena) */
export interface HalvesEdit {
  onOpen: (questionId: string) => void; activeId: string | null;
  /** vlečenje razmika: `gap` = razmik pod nalogo (dva testa na list), `space` = prostor za odgovor; null = privzeto */
  onSpacing?: (questionId: string, kind: 'gap' | 'space', mm: number | null) => void;
  onImg?: (questionId: string, index: number, layout: import('@/lib/quiz/types').ImgLayout | null) => void;
}

/** privzeti razmik pod nalogo pri dveh testih na list (globals.css: .pqz-hitem) */
const HALF_GAP = 3.5;
const hGap = (item: { gapHalf?: number }): React.CSSProperties | undefined => (item.gapHalf != null ? { marginBottom: `${item.gapHalf}mm` } : undefined);
const fmtMm = (mm: number) => `${String(Math.round(mm * 10) / 10).replace('.', ',')} mm`;

/** Vlečenje ročice (navpično) v milimetrih; merilo iz širine strani (210 mm). */
function dragMm(e: React.PointerEvent, start: number, set: (mm: number) => void, show: (label: string | null) => void, label: (mm: number) => string, min: number, max: number) {
  e.preventDefault(); e.stopPropagation();
  const page = (e.currentTarget as HTMLElement).closest('.pqz-page') as HTMLElement | null;
  const pxPerMm = (page?.getBoundingClientRect().width ?? 794) / 210;
  const y0 = e.clientY;
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    const mm = Math.max(min, Math.min(max, Math.round((start + (ev.clientY - y0) / pxPerMm) * 2) / 2));
    set(mm); show(label(mm));
  };
  const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); show(null); };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
  show(label(start));
}

/** Ločilna črta pod nalogo (dva testa na list): pri izbirnih razmik, pri ostalih prostor za odgovor. */
function HalfGapHandle({ c, edit }: { c: SheetItem; edit: HalvesEdit }) {
  const [label, setLabel] = useState<string | null>(null);
  if (!edit.onSpacing) return null;
  const free = !c.item.choice;
  const gap = c.item.gapHalf ?? HALF_GAP;
  return (
    <span className={`pqz-ed-hgap${label ? ' is-drag' : ''}`} style={{ bottom: free ? `-${gap / 2}mm` : `-${gap}mm` }}
      title={free ? 'Povleci: prostor za odgovor · dvoklik: privzeto' : 'Povleci: razmik do naslednje naloge · dvoklik: privzeto'}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => { e.stopPropagation(); edit.onSpacing!(c.item.id, free ? 'space' : 'gap', null); }}
      onPointerDown={e => free
        ? dragMm(e, c.item.space, mm => edit.onSpacing!(c.item.id, 'space', mm), setLabel, mm => `prostor za odgovor ${fmtMm(mm)}`, 0, 120)
        : dragMm(e, gap, mm => edit.onSpacing!(c.item.id, 'gap', mm), setLabel, mm => `razmik ${fmtMm(mm)}`, 0, 40)}>
      {label && <em>{label}</em>}
    </span>
  );
}

function HalfView({ sheet, part, plan, title, className, placeholder, edit }: {
  sheet: Sheet; part: 1 | 2; plan: HalvesPlan; title: string; className?: string; placeholder?: boolean; edit?: HalvesEdit;
}) {
  // številke so po vrsti v bralnem redu: levi stolpec navzdol, nato desni, nato naloge čez celo širino, nato hrbtna stran
  const seq = [...sheet.layout.choice, ...sheet.layout.free];
  const parts = packHalves(seq, c => c.item.choice, c => plan.m.heights[c.item.id] ?? 0, capsFor(sheet.layout, plan.m, !!sheet.qr))
    ?? [{ left: sheet.layout.choice, right: [], free: sheet.layout.free }, { left: [], right: [], free: [] }];
  const { left, right, free } = parts[part - 1];
  const items = (list: SheetItem[]) => (
    <>
      {list.map(c => edit ? (
        <div className={`pqz-hitem pqz-ed-item${edit.activeId === c.item.id ? ' is-active' : ''}`} key={c.n} style={hGap(c.item)} onClick={() => edit.onOpen(c.item.id)} title="Klikni za urejanje naloge">
          <ItemBody c={c} onImg={edit.onImg ? (i, L) => edit.onImg!(c.item.id, i, L) : undefined} />
          <HalfGapHandle c={c} edit={edit} />
        </div>
      ) : <div className="pqz-hitem" key={c.n} style={hGap(c.item)}><ItemBody c={c} /></div>)}
    </>
  );
  return (
    <>
      {part === 1 && (
        <>
          <SheetHead sheet={sheet} title={title} className={className} placeholder={placeholder} />
          <FrameView sheet={sheet} />
        </>
      )}
      {(left.length > 0 || right.length > 0) && <div className="pqz-hcols"><div className="pqz-hcol">{items(left)}</div><div className="pqz-hcol">{items(right)}</div></div>}
      {free.length > 0 && <div className="pqz-hfree">{items(free)}</div>}
    </>
  );
}

/**
 * Strani za tisk: po dva lista (učenca) na list A4; sprednja in hrbtna stran vsakega para.
 * `duplicate`: en sam enak list (brez imen) se natisne zgoraj in spodaj.
 */
export function HalvesPages({ sheets, plan, title, className, placeholder, duplicate, edit }: {
  sheets: Sheet[]; plan: HalvesPlan; title: string; className?: string; placeholder?: boolean; duplicate?: boolean; edit?: HalvesEdit;
}) {
  const pairs: [Sheet, Sheet | undefined][] = [];
  if (duplicate && sheets[0]) pairs.push([sheets[0], sheets[0]]);
  else for (let i = 0; i < sheets.length; i += 2) pairs.push([sheets[i], sheets[i + 1]]);
  return (
    <>
      {pairs.flatMap(([a, b], pi) => ([1, 2] as const).map(part => (
        <div className="pqz-page" key={`${pi}-${part}`}>
          <div className="pqz-half"><HalfView sheet={a} part={part} plan={plan} title={title} className={className} placeholder={placeholder} edit={edit} /></div>
          <div className="pqz-half">{b && <HalfView sheet={b} part={part} plan={plan} title={title} className={className} placeholder={placeholder} edit={edit} />}</div>
        </div>
      )))}
    </>
  );
}
