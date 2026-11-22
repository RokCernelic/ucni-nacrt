'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { SheetHead, FrameView, ItemBody, type Sheet } from './QuizSheetParts';
import { itemsFromQuiz, layoutSheet, sheetToken, clampSpace, type PrintItem } from '@/lib/quiz/printSheet';
import type { Quiz, ImgLayout } from '@/lib/quiz/types';
import type { Task } from '@/lib/tasks/types';

/** Mere strani (mm): list A4, odmik zgoraj in spodaj kot pri tisku po učencih. */
const PAGE = 297, MARGIN = 10, CONTENT = PAGE - 2 * MARGIN;
/** privzeti razmiki iz sloga lista (globals.css: .pqz-item, .pqz-c, .pqz-cols2) */
export const DEFAULT_GAP = { choice: 5.5, free: 7 };
export const DEFAULT_COL_GAP = 8;
const fmt = (mm: number) => `${String(Math.round(mm * 10) / 10).replace('.', ',')} mm`;

/**
 * Urejevalnik kviza kot natisnjen list A4 (merilo 1:1): enak razpored kot pri tisku (izbirne naloge na vrhu v dveh stolpcih,
 * nato naloge za ročni pregled), meje strani, vlečenje razmikov med nalogami in med stolpcema. Klik na nalogo jo odpre za urejanje.
 */
export default function QuizPaper({ quiz, tasksById, activeId, onOpen, onMove, onDuplicate, onDelete, onSpacing, onColGap, onImg }: {
  quiz: Quiz;
  tasksById: Map<string, Task>;
  activeId: string | null;
  onOpen: (questionId: string) => void;
  onMove: (questionId: string, dir: -1 | 1) => void;
  onDuplicate: (questionId: string) => void;
  onDelete: (questionId: string) => void;
  /** razmik pod nalogo: pri izbirnih je to razmik do naslednje, pri ostalih prostor za odgovor (mm; null = privzeto) */
  onSpacing: (questionId: string, kind: 'gap' | 'space', mm: number | null) => void;
  onColGap: (mm: number | null) => void;
  /** velikost / položaj slike v nalogi (null = privzeto) */
  onImg: (questionId: string, index: number, layout: ImgLayout | null) => void;
}) {
  const items = useMemo(() => itemsFromQuiz(quiz, tasksById), [quiz, tasksById]);
  const layout = useMemo(() => layoutSheet(items, null, { questions: false, options: false }), [items]);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(sheetToken('00000000-0000-0000-0000-000000000000', 'predogled'), { margin: 0, width: 240, errorCorrectionLevel: 'M' })
      .then(u => { if (alive) setQr(u); });
    return () => { alive = false; };
  }, []);
  const sheet: Sheet = { key: 'urejanje', name: 'IME IN PRIIMEK', qr, layout };
  const colGap = quiz.sheet?.colGap ?? DEFAULT_COL_GAP;

  // ── meje strani: naloga, ki bi segla čez rob strani, gre (kot pri tisku) na naslednjo stran ──
  const sheetRef = useRef<HTMLElement>(null);
  const [push, setPush] = useState<Record<string, number>>({});
  const [pages, setPages] = useState(1);
  const pushRef = useRef(push);
  const measure = () => {
    const el = sheetRef.current;
    if (!el) return;
    const r0 = el.getBoundingClientRect();
    const pxPerMm = r0.width / 210;
    if (!pxPerMm) return;
    const blocks = Array.from(el.querySelectorAll<HTMLElement>('[data-block]'));
    const cur = pushRef.current;
    const next: Record<string, number> = {};
    let shift = 0, bottom = MARGIN;
    for (const b of blocks) {
      const id = b.dataset.block!;
      const r = b.getBoundingClientRect();
      // naravni položaj (brez trenutnega potiska) + že izračunani potiski pred njim
      const natural = (r.top - r0.top) / pxPerMm - (cur[id] ?? 0) - sumBefore(cur, blocks, b);
      const h = r.height / pxPerMm;
      let top = natural + shift;
      const k = Math.floor(top / PAGE);
      const end = k * PAGE + MARGIN + CONTENT;
      if (top + h > end + 0.3 && h <= CONTENT && top > k * PAGE + MARGIN + 1) {
        const p = (k + 1) * PAGE + MARGIN - top;
        next[id] = Math.round(p * 10) / 10;
        shift += p; top += p;
      }
      bottom = Math.max(bottom, top + h);
    }
    const n = Math.max(1, Math.ceil((bottom + MARGIN) / PAGE));
    if (JSON.stringify(next) !== JSON.stringify(cur)) setPush(next);
    if (n !== pages) setPages(n);
  };
  // potiski, ki so trenutno v DOM-u (ta izris), nato meritev
  useLayoutEffect(() => { pushRef.current = push; measure(); });
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    el.querySelectorAll('[data-block]').forEach(b => ro.observe(b));
    const imgs = Array.from(el.querySelectorAll('img'));
    imgs.forEach(i => i.addEventListener('load', measure));
    return () => { ro.disconnect(); imgs.forEach(i => i.removeEventListener('load', measure)); };
  });

  // ── vlečenje razmikov ──
  const [drag, setDrag] = useState<{ id: string; mm: number; label: string } | null>(null);
  const startDrag = (e: React.PointerEvent, id: string, start: number, set: (mm: number) => void, label: (mm: number) => string, axis: 'y' | 'x' = 'y', factor = 1, min = 0, max = 240) => {
    e.preventDefault(); e.stopPropagation();
    const pxPerMm = (sheetRef.current?.getBoundingClientRect().width ?? 794) / 210;
    const p0 = axis === 'y' ? e.clientY : e.clientX;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const d = ((axis === 'y' ? ev.clientY : ev.clientX) - p0) / pxPerMm * factor;
      const mm = Math.max(min, Math.min(max, Math.round((start + d) * 2) / 2));
      set(mm);
      setDrag({ id, mm, label: label(mm) });
    };
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); setDrag(null); };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    setDrag({ id, mm: start, label: label(start) });
  };

  const groupOf = (g: 'choice' | 'free') => layout[g];
  const g0 = layout.choice.length > 0;
  const renderItem = (c: (typeof layout.choice)[number], g: 'choice' | 'free', i: number, list: typeof layout.choice) => {
    const it = c.item as PrintItem;
    const q = quiz.questions.find(x => x.id === it.id);
    const free = g === 'free';
    const gap = it.gapAfter ?? DEFAULT_GAP[g];
    const space = it.space;
    const isActive = activeId === it.id;
    const handleBottom = free ? `-${gap / 2}mm` : `-${gap}mm`;
    // prazen prostor do naslednje strani (višina, ne rob — robovi bi se zlili)
    const spacer = free && push[it.id] ? <li key={`${it.id}-pg`} aria-hidden style={{ height: `${push[it.id]}mm` }} /> : null;
    return [spacer,
      <li key={it.id} data-block={free ? it.id : undefined}
        className={`pqz-item${g === 'choice' ? ' pqz-c' : ''} pqz-ed-item${isActive ? ' is-active' : ''}`}
        style={{ marginBottom: `${gap}mm` }}
        onClick={() => onOpen(it.id)}>
        <ItemBody c={c} onImg={(i, L) => onImg(it.id, i, L)} />
        <span className="pqz-ed-tools" onClick={e => e.stopPropagation()}>
          <button title="Uredi nalogo" onClick={() => onOpen(it.id)}>✎</button>
          <button title="Premakni naprej" disabled={i === 0} onClick={() => onMove(it.id, -1)}>↑</button>
          <button title="Premakni nazaj" disabled={i === list.length - 1} onClick={() => onMove(it.id, 1)}>↓</button>
          <button title="Podvoji" onClick={() => onDuplicate(it.id)}>⧉</button>
          {it.imgs?.some(Boolean) && <button title="Slike nazaj na privzeto velikost in mesto" onClick={() => it.imgs!.forEach((_, i) => onImg(it.id, i, null))}>↺</button>}
          <button title="Odstrani iz kviza" className="del" onClick={() => onDelete(it.id)}>×</button>
        </span>
        {/* vodoravna ločilna črta: pri izbirnih nalogah razmik do naslednje, pri ostalih prostor za odgovor */}
        {(free ? q && q.kind !== 'mc' : true) && (
          <span className={`pqz-ed-hgap${drag?.id === it.id ? ' is-drag' : ''}`} style={{ bottom: handleBottom }}
            title={free ? 'Povleci: prostor za odgovor · dvoklik: privzeto' : 'Povleci: razmik do naslednje naloge · dvoklik: privzeto'}
            onClick={e => e.stopPropagation()}
            onDoubleClick={e => { e.stopPropagation(); onSpacing(it.id, free ? 'space' : 'gap', null); }}
            onPointerDown={e => free
              ? startDrag(e, it.id, space, mm => onSpacing(it.id, 'space', clampSpace(mm)), mm => `prostor za odgovor ${fmt(mm)}`)
              : startDrag(e, it.id, gap, mm => onSpacing(it.id, 'gap', mm), mm => `razmik ${fmt(mm)}`, 'y', 1, 0, 80)}>
            {drag?.id === it.id && <em>{drag.label}</em>}
          </span>
        )}
      </li>];
  };

  return (
    <div className="pqz-preview pqz-ed" style={{ width: 'fit-content', margin: '0 auto' }}>
      <section ref={sheetRef} className="pqz-sheet" style={{ minHeight: `${pages * PAGE}mm`, paddingBottom: 0 }}>
        {/* meje strani: siv pas = odmik spodaj in zgoraj, črtkano = rob lista */}
        {Array.from({ length: pages - 1 }, (_, k) => (
          <div key={k} className="pqz-ed-break" style={{ top: `${(k + 1) * PAGE - MARGIN}mm`, height: `${2 * MARGIN}mm` }}>
            <span>stran {k + 2}</span>
          </div>
        ))}
        <div data-block="__head">
          <SheetHead sheet={sheet} title={quiz.title} placeholder />
          <FrameView sheet={sheet} />
        </div>
        {g0 && push.__choice ? <div aria-hidden style={{ height: `${push.__choice}mm` }} /> : null}
        {(['choice', 'free'] as const).map(g => groupOf(g).length > 0 && (
          <ol key={g} data-block={g === 'choice' ? '__choice' : undefined}
            className={`pqz-list${g === 'choice' ? ' pqz-cols2' : ''}`}
            style={{ listStyle: 'none', padding: 0, position: 'relative', ...(g === 'choice' ? { columnGap: `${colGap}mm` } : {}) }}>
            {groupOf(g).map((c, i, list) => renderItem(c, g, i, list))}
            {g === 'choice' && groupOf(g).length > 1 && (
              <span className={`pqz-ed-vgap${drag?.id === '__col' ? ' is-drag' : ''}`} style={{ width: `${Math.max(colGap, 3)}mm` }}
                title="Povleci: razmik med stolpcema · dvoklik: privzeto"
                onDoubleClick={() => onColGap(null)}
                onPointerDown={e => startDrag(e, '__col', colGap, mm => onColGap(mm), mm => `med stolpcema ${fmt(mm)}`, 'x', 2, 2, 60)}>
                {drag?.id === '__col' && <em>{drag.label}</em>}
              </span>
            )}
          </ol>
        ))}
        {items.length === 0 && <p style={{ color: '#888', fontFamily: 'var(--font-sans)', fontSize: '12px' }}>Kviz še nima nalog — dodaj jih spodaj.</p>}
      </section>
    </div>
  );
}

/** vsota potiskov blokov pred `b` (v vrstnem redu na listu) */
function sumBefore(push: Record<string, number>, blocks: HTMLElement[], b: HTMLElement) {
  let s = 0;
  for (const x of blocks) { if (x === b) break; s += push[x.dataset.block!] ?? 0; }
  return s;
}
