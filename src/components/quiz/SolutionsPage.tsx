'use client';

import { Rich } from '@/components/tasks/ui';
import { layoutSheet, hasSolutionText, type PrintItem } from '@/lib/quiz/printSheet';
import { todayLabel } from './QuizSheetParts';

/**
 * Zadnja stran natisa: rešitve za učitelja. Številke in črke so v izvirnem vrstnem redu (nemešano); pri učencih s
 * premešanim listom se lahko razlikujejo, zato je pri izbirnih vprašanjih poleg črke vedno napisano tudi besedilo odgovora.
 * Ne prikaže nič, če nobena postavka nima rešitve.
 */
export default function SolutionsPage({ items, title, halves }: { items: PrintItem[]; title: string; halves?: boolean }) {
  if (!items.some(hasSolutionText)) return null;
  const base = layoutSheet(items, null);
  const all = [...base.choice, ...base.free];
  const snippet = (p: string) => { const t = p.replace(/\s+/g, ' ').trim(); return t.length > 110 ? `${t.slice(0, 110)}…` : t; };
  return (
    <section className={`pqz-sol${halves ? ' pqz-sol-halves' : ''}`}>
      <header className="pqz-head">
        <b className="pqz-title">Rešitve · {title}</b>
        <span className="pqz-name">samo za učitelja</span>
        <span className="pqz-meta">{todayLabel()}</span>
      </header>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {all.map(c => {
          const right = c.item.choice ? c.options.filter(o => c.item.correct.includes(o.id)) : [];
          return (
            <li key={c.n} className="pqz-solitem">
              <div className="pqz-solq"><b>{c.n}.</b> {snippet(c.item.prompt)}</div>
              {right.length > 0 && <div><b>Pravilno:</b> {right.map(o => `${o.letter}) ${o.text}`).join('; ')}</div>}
              {c.item.answerText && <div><b>Odgovor:</b> {c.item.answerText}</div>}
              {c.item.solution && <div className="pqz-solbody"><Rich html={c.item.solution} /></div>}
            </li>
          );
        })}
      </ol>
      <p className="pqz-solnote">Številke in črke veljajo za izvirni vrstni red; pri učencih z mešanim listom so lahko drugačne (zato je poleg črke tudi besedilo odgovora).</p>
    </section>
  );
}
