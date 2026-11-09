'use client';

import { Rich } from '@/components/tasks/ui';
import { frameGeometry, type SheetLayout, type SheetItem } from '@/lib/quiz/printSheet';

/** En list za tisk: ime (ali prazna črta), QR (po učencih) in razpored vprašanj. */
export interface Sheet { key: string; name: string | null; qr: string | null; layout: SheetLayout }

export const todayLabel = () => new Date().toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric' });

/** Glava lista: naslov, ime in priimek, razred in datum. */
export function SheetHead({ sheet: sh, title, className, placeholder, suffix }: { sheet: Sheet; title: string; className?: string; placeholder?: boolean; suffix?: string }) {
  return (
    <header className="pqz-head">
      <b className="pqz-title">{title}{suffix}</b>
      <span className="pqz-name">{sh.name ?? 'Ime in priimek: ______________________'}</span>
      <span className="pqz-meta">{placeholder && sh.name ? 'RAZRED · DATUM' : <>{sh.name ? (className ? `${className} · ` : '') : 'Razred: ______ · '}{todayLabel()}</>}</span>
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
          <span className="pqz-n" style={{ left: mm(c.x), top: mm(c.y), width: mm(6), height: mm(6.8) }}>{c.n}{c.multi ? '+' : ''}</span>
          {c.bubbles.map(b => (
            <span key={b.letter} className="pqz-bub" style={{ left: mm(b.cx - g.bub / 2), top: mm(b.cy - g.bub / 2), width: mm(g.bub), height: mm(g.bub) }}>{b.letter}</span>
          ))}
        </div>
      ))}
      {g.qr && sh.qr && <img className="pqz-qr" src={sh.qr} alt="" style={{ left: mm(g.qr.x), top: mm(g.qr.y), width: mm(g.qr.size), height: mm(g.qr.size) }} />}
    </div>
  );
}

/** Besedilo vprašanja + možnosti (ali prostor za odgovor). */
export function ItemBody({ c }: { c: SheetItem }) {
  const inline = c.item.choice && c.options.length > 0 && c.options.every(o => o.text.length <= 18) && c.options.reduce((n, o) => n + o.text.length, 0) <= 56;
  return (
    <>
      <div className="pqz-q"><b>{c.n}.</b><Rich html={c.item.html} /></div>
      {c.item.choice
        ? <div className={inline ? 'pqz-opts pqz-inline' : 'pqz-opts'}>{c.options.map(o => <div key={o.letter}><b>{o.letter})</b> {o.text}</div>)}</div>
        : <div className="pqz-free" style={{ height: `${c.item.space}mm` }} />}
    </>
  );
}
