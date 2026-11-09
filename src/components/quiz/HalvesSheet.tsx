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
  /** število vrstic na prvi in drugi polovici */
  r1: number; r2: number;
  /** koliko od vseh vprašanj se prilega */
  kept: number; total: number;
  keptIds: Set<string>;
  /** zaporedne številke (v obrazcu) vprašanj, ki se ne prilegajo */
  dropped: number[];
}

interface Measured { head: number; rows: number[] }

/** Razdeli vrstice na dve polovici; kar ne gre, odreže. Okvir z odgovori je manjši, ko je izbirnih vprašanj manj. */
export function planHalves(base: SheetLayout, m: Measured, withQr: boolean): HalvesPlan {
  const rows = rowsOf(base);
  const frameH = (c: number) => (c > 0 || withQr ? frameGeometry({ choice: base.choice.slice(0, c), free: [] } as SheetLayout, withQr).h + 4 : 0);
  const place = (frameC: number) => {
    const cap1 = INNER - m.head - frameH(frameC);
    const cap2 = INNER; // hrbtna stran je brez glave
    let r1 = 0, r2 = 0, used = 0, half = 1, stop = false;
    for (let i = 0; i < rows.length && !stop; i++) {
      const h = m.rows[i] ?? 0;
      if (half === 1 && used + h > cap1) { half = 2; used = 0; }
      if (half === 2 && used + h > cap2) { stop = true; break; }
      used += h;
      if (half === 1) r1++; else r2++;
    }
    const placed = rows.slice(0, r1 + r2);
    return { r1, r2, keptChoice: placed.filter(r => r.kind === 'choice').reduce((n, r) => n + r.items.length, 0), kept: placed.reduce((n, r) => n + r.items.length, 0) };
  };
  let best = place(base.choice.length);
  for (let i = 0; i < 4; i++) {
    const next = place(best.keptChoice);
    if (next.keptChoice <= best.keptChoice && next.kept >= best.kept && (next.kept > best.kept || next.r1 !== best.r1)) best = next; else break;
  }
  const seq = [...base.choice, ...base.free];
  const keptItems = rows.slice(0, best.r1 + best.r2).flatMap(r => r.items);
  const keptIds = new Set(keptItems.map(c => c.item.id));
  return { r1: best.r1, r2: best.r2, kept: best.kept, total: seq.length, keptIds, dropped: seq.filter(c => !keptIds.has(c.item.id)).map(c => c.n) };
}

/**
 * Izmeri višine glave in vrstic (v skritem izrisu z enakimi slogi kot pri tisku) in iz njih izračuna razdelitev.
 * `node` je skriti merilni izris (prikaži ga nekje v komponenti); `plan` je null, dokler meritev ni pripravljena.
 */
export function useHalvesPlan(items: PrintItem[], enabled: boolean, withQr: boolean, title: string) {
  const base = useMemo(() => layoutSheet(items, null), [items]);
  const rows = useMemo(() => rowsOf(base), [base]);
  const ref = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Measured | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const head = (el.querySelector('[data-h]') as HTMLElement | null)?.getBoundingClientRect().height ?? 0;
      const hs = Array.from(el.querySelectorAll('[data-r]')).map(n => (n as HTMLElement).getBoundingClientRect().height * PX_MM);
      const next = { head: head * PX_MM, rows: hs };
      setM(prev => (prev && Math.abs(prev.head - next.head) < 0.05 && prev.rows.length === hs.length && prev.rows.every((v, i) => Math.abs(v - hs[i]) < 0.05) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled, rows]);

  const plan = useMemo(() => (enabled && m ? planHalves(base, m, withQr) : null), [enabled, m, base, withQr]);
  const sample: Sheet = { key: 'm', name: 'IME IN PRIIMEK', qr: null, layout: base };
  const node = enabled && typeof document !== 'undefined' ? createPortal(
    <div ref={ref} className="pqz-preview pqz-hbox pqz-hmeasure" aria-hidden>
      <div data-h style={{ display: 'flow-root' }}><SheetHead sheet={sample} title={title} placeholder /></div>
      {rows.map((r, i) => <div data-r key={i} style={{ display: 'flow-root' }}><RowView row={r} /></div>)}
    </div>,
    document.body,
  ) : null;
  return { plan, node };
}

function HalfView({ sheet, part, plan, title, className, placeholder }: {
  sheet: Sheet; part: 1 | 2; plan: HalvesPlan; title: string; className?: string; placeholder?: boolean;
}) {
  const rows = rowsOf(sheet.layout);
  const shown = part === 1 ? rows.slice(0, plan.r1) : rows.slice(plan.r1, plan.r1 + plan.r2);
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
