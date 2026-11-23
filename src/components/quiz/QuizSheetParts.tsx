'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { Rich } from '@/components/tasks/ui';
import type { ImgLayout } from '@/lib/quiz/types';
import { frameGeometry, FRAME, type SheetLayout, type SheetItem } from '@/lib/quiz/printSheet';

/** En list za tisk: ime (ali prazna črta), QR (po učencih) in razpored vprašanj. */
export interface Sheet { key: string; name: string | null; qr: string | null; layout: SheetLayout }

export const todayLabel = () => new Date().toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric' });

/** Glava lista: razred, naslov, datum, ime in priimek ter (z QR kodo) napis nad kodo. */
export function SheetHead({ sheet: sh, title, className, placeholder, suffix }: { sheet: Sheet; title: string; className?: string; placeholder?: boolean; suffix?: string }) {
  return (
    <header className="pqz-head">
      {(() => {
        const cls = placeholder && sh.name ? 'RAZRED' : sh.name ? className : 'Razred: ______';
        return cls ? <span className="pqz-class">{cls}</span> : null;
      })()}
      <b className="pqz-title">{title}{suffix}</b>
      <span className="pqz-meta">{placeholder && sh.name ? 'DATUM' : todayLabel()}</span>
      <span className="pqz-name">{sh.name ?? 'Ime in priimek: ______________________'}</span>
      {/* nad QR kodo (desno v okvirju): puščica kaže na sredino kode */}
      {sh.qr && <span className="pqz-scanhint" style={{ paddingRight: `${FRAME.padX + FRAME.qr / 2 - 1.6}mm` }}>Poskeniraj kodo za rezultate <b>↓</b></span>}
    </header>
  );
}

/** Okvir z odgovori (krogci A–F, črni kvadratki, QR) — skener ga najde po kvadratkih. */
export function FrameView({ sheet: sh }: { sheet: Sheet }) {
  if (!(sh.layout.choice.length > 0 || sh.qr)) return null;
  const g = frameGeometry(sh.layout, !!sh.qr);
  const mm = (v: number) => `${v}mm`;
  return (
    <div className="pqz-grid" style={{ width: mm(g.w), height: mm(g.h) }}>
      {g.marks.map(([x, y], i) => <i key={i} className="pqz-mark" style={{ left: mm(x - 2), top: mm(y - 2) }} />)}
      {g.cells.map(c => (
        <div key={c.n}>
          <span className="pqz-n" style={{ left: mm(c.x), top: mm(c.y), width: mm(FRAME.numW), height: mm(FRAME.rowH) }}>{c.n}{c.multi ? '+' : ''}</span>
          {c.bubbles.map(b => (
            <span key={b.letter} className="pqz-bub" style={{ left: mm(b.cx - g.bub / 2), top: mm(b.cy - g.bub / 2), width: mm(g.bub), height: mm(g.bub) }}>{b.letter}</span>
          ))}
        </div>
      ))}
      {g.qr && sh.qr && <img className="pqz-qr" src={sh.qr} alt="" loading="eager" decoding="sync" style={{ left: mm(g.qr.x), top: mm(g.qr.y), width: mm(g.qr.size), height: mm(g.qr.size) }} />}
    </div>
  );
}

/** Slike v besedilu naloge: velikost in položaj iz nastavitev (mm) — na zaslonu in pri tisku. */
function applyImgLayout(box: HTMLElement, imgs?: (ImgLayout | null)[]) {
  box.querySelectorAll<HTMLImageElement>('.rich-content img').forEach((img, i) => {
    const L = imgs?.[i];
    img.style.width = L ? `${L.w}mm` : '';
    img.style.height = L ? 'auto' : '';
    img.style.maxWidth = L ? 'none' : '';
    img.style.maxHeight = L ? 'none' : '';
    img.style.display = L ? 'block' : '';
    img.style.marginLeft = L ? `${L.x}mm` : '';
    img.style.marginTop = L ? `${L.y}mm` : '';
  });
}

/**
 * Urejanje slik na listu (urejevalnik kviza): sliko primeš in premakneš; ob spodnjem levem / desnem vogalu jo
 * povečaš ali pomanjšaš (razmerje ostane). Dvoklik = povečava za ogled (ImageZoom).
 */
function useImgEditing(box: React.RefObject<HTMLDivElement | null>, imgs: (ImgLayout | null)[] | undefined, onImg?: (index: number, layout: ImgLayout | null) => void) {
  const imgsRef = useRef(imgs);
  useEffect(() => { imgsRef.current = imgs; });
  useEffect(() => {
    const el = box.current;
    if (!el || !onImg) return;
    const EDGE = 14; // px od vogala za spreminjanje velikosti
    const modeAt = (img: HTMLImageElement, e: PointerEvent | MouseEvent): 'move' | 'left' | 'right' => {
      const r = img.getBoundingClientRect();
      if (e.clientY > r.bottom - EDGE) { if (e.clientX < r.left + EDGE) return 'left'; if (e.clientX > r.right - EDGE) return 'right'; }
      return 'move';
    };
    const onMove = (e: MouseEvent) => {
      const img = e.target instanceof HTMLImageElement && el.contains(e.target) ? e.target : null;
      if (!img) return;
      const m = modeAt(img, e);
      img.style.cursor = m === 'left' ? 'nesw-resize' : m === 'right' ? 'nwse-resize' : 'move';
    };
    const onDown = (e: PointerEvent) => {
      const img = e.target instanceof HTMLImageElement && el.contains(e.target) ? e.target : null;
      if (!img || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const list = Array.from(el.querySelectorAll<HTMLImageElement>('.rich-content img'));
      const index = list.indexOf(img);
      const page = el.closest('.pqz-sheet, .pqz-page, .pqz-half') as HTMLElement | null;
      const pxPerMm = (page?.getBoundingClientRect().width ?? 794) / 210; // vse strani in polovice so široke 210 mm
      const ir = img.getBoundingClientRect();
      const rich = img.closest('.rich-content') as HTMLElement;
      const rr = rich.getBoundingClientRect();
      const qr = el.getBoundingClientRect();
      const cur = imgsRef.current?.[index] ?? null;
      const start: ImgLayout = cur ?? { w: ir.width / pxPerMm, x: (ir.left - rr.left) / pxPerMm, y: 0 };
      // meje: od levega roba naloge do desnega roba naloge
      const minX = -(rr.left - qr.left) / pxPerMm;
      const maxRight = (qr.right - rr.left) / pxPerMm;
      const mode = modeAt(img, e);
      const x0 = e.clientX, y0 = e.clientY;
      let moved = false;
      const round = (v: number) => Math.round(v * 2) / 2;
      const move = (ev: PointerEvent) => {
        const dx = (ev.clientX - x0) / pxPerMm, dy = (ev.clientY - y0) / pxPerMm;
        if (!moved && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 3) return;
        moved = true;
        let L: ImgLayout;
        if (mode === 'move') L = { w: start.w, x: Math.max(minX, Math.min(maxRight - start.w, start.x + dx)), y: Math.max(-5, start.y + dy) };
        else if (mode === 'right') L = { ...start, w: Math.max(10, Math.min(maxRight - start.x, start.w + dx)) };
        else { const nx = Math.max(minX, Math.min(start.x + start.w - 10, start.x + dx)); L = { ...start, x: nx, w: start.w + (start.x - nx) }; }
        onImg(index, { w: round(L.w), x: round(L.x), y: round(L.y) });
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    // klik na sliko ne odpre urejevalnika naloge (sliko urejaš neposredno na listu)
    const onClick = (e: MouseEvent) => { if (e.target instanceof HTMLImageElement && el.contains(e.target)) e.stopPropagation(); };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('click', onClick);
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('pointerdown', onDown); el.removeEventListener('click', onClick); };
  }, [box, onImg]);
}

/** Besedilo vprašanja + možnosti (ali prostor za odgovor). `onImg`: urejanje slik na listu. */
export function ItemBody({ c, onImg }: { c: SheetItem; onImg?: (index: number, layout: ImgLayout | null) => void }) {
  const inline = c.item.choice && c.options.length > 0 && c.options.every(o => o.text.length <= 18) && c.options.reduce((n, o) => n + o.text.length, 0) <= 56;
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (box.current) applyImgLayout(box.current, c.item.imgs); });
  useImgEditing(box, c.item.imgs, onImg);
  return (
    <>
      <div className={`pqz-q${onImg ? ' pqz-img-ed' : ''}`} ref={box}>
        {/* pri nalogah, ki jih učitelj popravi ročno: levo prazno polje za dosežene točke, desno vse točke naloge */}
        {!c.item.choice && !c.item.hidePoints && <span className="pqz-pts" title="Dosežene / vse točke"><i /><i>{String(c.item.points).replace('.', ',')}</i></span>}
        <b>{c.n}.</b><Rich html={c.item.html} />
      </div>
      {c.item.choice
        ? <div className={inline ? 'pqz-opts pqz-inline' : 'pqz-opts'}>{c.options.map(o => <div key={o.letter}><b>{o.letter})</b> {o.text}</div>)}</div>
        : <div className="pqz-free" style={{ height: `${c.item.space}mm` }} />}
    </>
  );
}
