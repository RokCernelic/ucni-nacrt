'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { frameGeometry, layoutSheet, type PrintItem, type SheetItem, type SheetLayout } from '@/lib/quiz/printSheet';
import { SheetHead, FrameView, ItemBody, type Sheet } from './QuizSheetParts';

/*
 * »Dva testa na en list A4«: list je po sredini razdeljen s črtkano črto. Zgoraj je test enega učenca, spodaj drugega;
 * na hrbtni strani (dvostransko tiskanje) sta zgoraj nadaljevanje prvega, spodaj nadaljevanje drugega.
 * Vsak test je torej dolg največ dve polovici (prednja + hrbtna). Vprašanja, ki se ne prilegajo, se odrežejo —
 * učitelj zmanjša število nalog, dokler se ne izide. Vsa vprašanja so za vse enako razvrščena (mešajo se le odgovori),
 * zato je razdelitev na polovici za vse učence enaka in se izmeri enkrat.
 */

const HALF_H = 148.5;                 // mm: polovica A4
const PAD_T = 8, PAD_B = 7, SAFETY = 2; // mm: odmik v polovici + rezerva
const INNER = HALF_H - PAD_T - PAD_B - SAFETY;
const PX_MM = 25.4 / 96;

/** Vrstica: dve izbirni vprašanji drugo ob drugem ali eno prosto vprašanje čez celo širino. */
export interface Row { kind: 'choice' | 'free'; items: SheetItem[] }

export function rowsOf(layout: SheetLayout): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < layout.choice.length; i += 2) rows.push({ kind: 'choice', items: layout.choice.slice(i, i + 2) });
  for (const c of layout.free) rows.push({ kind: 'free', items: [c] });
  return rows;
}

function RowView({ row }: { row: Row }) {
  return (
    <div className={`pqz-hrow${row.kind === 'free' ? ' pqz-hfree' : ''}`}>
      {row.items.map(c => <div className="pqz-hitem" key={c.n}><ItemBody c={c} /></div>)}
    </div>
  );
}

export interface HalvesPlan {
  /** koliko od vseh vprašanj se prilega (enak izbor za vse učence) */
  kept: number; total: number;
  keptIds: Set<string>;
  /** zaporedne številke (v obrazcu, v izvirnem vrstnem redu) vprašanj, ki se ne prilegajo */
  dropped: number[];
  /** meritve, iz katerih se za vsak list posebej izračuna razdelitev na polovici */
  m: Measured;
}

interface Measured { head: number; heights: Record<string, number> }

const rowH = (r: Row, m: Measured) => Math.max(...r.items.map(c => m.heights[c.item.id] ?? 0)) + (r.kind === 'choice' ? 3.5 : 4.5);

/** Koliko vrstic gre na prvo in drugo polovico za dani list (ok = prilegajo se vse). Okvir z odgovori je manjši, ko je izbirnih vprašanj manj. */
export function splitRows(layout: SheetLayout, m: Measured, withQr: boolean): { r1: number; r2: number; ok: boolean } {
  const rows = rowsOf(layout);
  const c = layout.choice.length;
  const frameH = c > 0 || withQr ? frameGeometry(layout, withQr).h + 4 : 0;
  const cap1 = INNER - m.head - frameH;
  const cap2 = INNER; // hrbtna stran je brez glave
  let r1 = 0, r2 = 0, used = 0, half = 1, ok = true;
  for (const r of rows) {
    const h = rowH(r, m);
    if (half === 1 && used + h > cap1) { half = 2; used = 0; }
    if (half === 2 && used + h > cap2) { ok = false; break; }
    used += h;
    if (half === 1) r1++; else r2++;
  }
  return { r1, r2, ok };
}

/**
 * Izbere, katera vprašanja ostanejo: isti izbor za VSE učence (da so testi enako težki). Izbor je predpona vprašanj
 * v izvirnem vrstnem redu (izbirna, nato prosta); zadnja se odrežejo, dokler se test vsakega od `seeds`
 * (premešanih listov) ne prilega v dve polovici. `seeds`: seme mešanja za vsak list (null = izvirni vrstni red).
 */
export function planFor(items: PrintItem[], m: Measured, withQr: boolean, seeds: (string | null)[], opts: { questions: boolean; options: boolean }): HalvesPlan {
  const base = layoutSheet(items, null);
  const seq = [...base.choice, ...base.free];
  let k = seq.length;
  for (; k > 0; k--) {
    const ids = new Set(seq.slice(0, k).map(c => c.item.id));
    const kept = items.filter(i => ids.has(i.id));
    if (seeds.every(seed => splitRows(layoutSheet(kept, seed, opts), m, withQr).ok)) break;
  }
  const keptIds = new Set(seq.slice(0, k).map(c => c.item.id));
  return { kept: k, total: seq.length, keptIds, dropped: seq.filter(c => !keptIds.has(c.item.id)).map(c => c.n), m };
}

/**
 * Izmeri višine glave in posameznih vprašanj (v skritem izrisu z enakimi slogi kot pri tisku).
 * `node` je skriti merilni izris (prikaži ga nekje v komponenti); `plan` (za predogled, na vzorcu 40 premešanj) je null,
 * dokler meritev ni pripravljena; `compute` izračuna izbor za dane učence (natančno ob tisku).
 */
export function useHalvesPlan(items: PrintItem[], enabled: boolean, withQr: boolean, title: string, opts: { questions: boolean; options: boolean }) {
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
      const next: Measured = { head, heights };
      setM(prev => {
        if (prev && Math.abs(prev.head - head) < 0.05) {
          const ks = Object.keys(heights);
          if (ks.length === Object.keys(prev.heights).length && ks.every(k => Math.abs((prev.heights[k] ?? -1) - heights[k]) < 0.05)) return prev;
        }
        return next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled, seq]);

  const shuffling = opts.questions || opts.options;
  const previewSeeds = useMemo(() => (shuffling ? Array.from({ length: 40 }, (_, i) => `predogled${i}`) : [null]), [shuffling]);
  const plan = useMemo(() => (enabled && m ? planFor(items, m, withQr, previewSeeds, opts) : null), [enabled, m, items, withQr, previewSeeds, opts.questions, opts.options]); // eslint-disable-line react-hooks/exhaustive-deps
  const compute = (seeds: (string | null)[]) => (m ? planFor(items, m, withQr, seeds, opts) : null);

  const sample: Sheet = { key: 'm', name: 'IME IN PRIIMEK', qr: null, layout: base };
  const node = enabled && typeof document !== 'undefined' ? createPortal(
    <div ref={ref} className="pqz-preview pqz-hbox pqz-hmeasure" aria-hidden>
      <div data-h style={{ display: 'flow-root' }}><SheetHead sheet={sample} title={title} placeholder /></div>
      {seq.map(c => (
        <div data-i={c.item.id} key={c.item.id} style={{ display: 'flow-root', width: c.item.choice ? '85mm' : '178mm' }}>
          <div className="pqz-hitem"><ItemBody c={c} /></div>
        </div>
      ))}
    </div>,
    document.body,
  ) : null;
  return { plan, compute, node };
}

function HalfView({ sheet, part, plan, title, className, placeholder }: {
  sheet: Sheet; part: 1 | 2; plan: HalvesPlan; title: string; className?: string; placeholder?: boolean;
}) {
  const rows = rowsOf(sheet.layout);
  const { r1, r2 } = splitRows(sheet.layout, plan.m, !!sheet.qr);
  const shown = part === 1 ? rows.slice(0, r1) : rows.slice(r1, r1 + r2);
  return (
    <>
      {part === 1 && (
        <>
          <SheetHead sheet={sheet} title={title} className={className} placeholder={placeholder} />
          <FrameView sheet={sheet} />
        </>
      )}
      {shown.map((r, i) => <RowView key={i} row={r} />)}
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
