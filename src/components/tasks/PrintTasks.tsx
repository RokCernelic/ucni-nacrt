'use client';

import { useMemo, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { Task } from '@/lib/tasks/types';
import { orderTasks, groupTasks } from '@/lib/tasks/order';
import { metaLine, correctText, sheetInfo, OPTION_LETTERS } from '@/lib/tasks/latex';
import { exportTasksTex } from '@/lib/tasks/exportTex';
import { sanitizeRichHtml } from '@/lib/richText';
import { btn } from './ui';

const FONTS = ['400 11pt "CMU Serif"', 'italic 400 11pt "CMU Serif"', '700 11pt "CMU Serif"', 'italic 700 11pt "CMU Serif"'];

/** Očiščen HTML naloge; podnaloge (a) b) …) in opombe dobijo razred za LaTeX zamik. */
function sheetHtml(html: string): string {
  return sanitizeRichHtml(html).html
    .replace(/<p><b>([a-zčšž])\)<\/b>/g, '<p class="lx-sub"><b>$1)</b>')
    .replace(/(<\/p>)<p><i>/g, '$1<p class="lx-note"><i>');
}

function Rich({ html }: { html: string }) {
  return <div className="rich-content" dangerouslySetInnerHTML={{ __html: sheetHtml(html) }} />;
}

/**
 * »Natisni izbrane« (list A4 v videzu LaTeX: Computer Modern, 11 pt, poglavja in podpoglavja kot v zbirki)
 * in »⬇ .tex« (izvoz v obliki zbirke nalog za xelatex; s slikami kot .zip).
 */
export default function PrintTasks({ tasks, title }: { tasks: Task[]; title: string }) {
  const [printing, setPrinting] = useState(false);
  const [withAnswers, setWithAnswers] = useState(false);
  const [withMeta, setWithMeta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const groups = useMemo(() => groupTasks(orderTasks(tasks)), [tasks]);
  const info = useMemo(() => sheetInfo(groups), [groups]);

  const print = async () => {
    setNote(null);
    // pisava mora biti naložena, preden se odpre okno za tiskanje (list se izriše šele zdaj)
    try { await Promise.all(FONTS.map(f => document.fonts.load(f, 'čšžČŠŽ'))); } catch { /* tisk gre tudi z nadomestno pisavo */ }
    const root = document.documentElement;
    const done = () => { root.classList.remove('printing-questions'); setPrinting(false); window.removeEventListener('afterprint', done); };
    flushSync(() => setPrinting(true));
    root.classList.add('printing-questions');
    window.addEventListener('afterprint', done);
    window.print();
  };

  const exportTex = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await exportTasksTex(tasks, { title, withMeta: true, withSolutions: withAnswers });
      setNote({
        ok: r.missing === 0,
        text: r.zipped
          ? `Preneseno: ${r.count} nalog + ${r.images - r.missing} slik (.zip)${r.missing ? ` — ${r.missing} slik ni bilo mogoče prenesti` : ''}.`
          : `Preneseno: ${r.count} nalog (.tex).`,
      });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  };

  const small: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer' };
  let n = 0;

  return (
    <>
      <button onClick={() => void print()} disabled={!tasks.length}
        title="List A4 v videzu LaTeX (Computer Modern); v oknu za tisk izberi »Shrani kot PDF«"
        style={{ ...btn(true), padding: '5px 10px', opacity: tasks.length ? 1 : 0.45, cursor: tasks.length ? 'pointer' : 'not-allowed' }}>
        🖨 Natisni izbrane ({tasks.length})
      </button>
      <button onClick={() => void exportTex()} disabled={!tasks.length || busy}
        title="Prenesi izbrane naloge kot LaTeX (.tex; s slikami .zip) v obliki zbirke nalog — prevedeš z xelatexom"
        style={{ ...btn(), padding: '5px 10px', opacity: tasks.length && !busy ? 1 : 0.45, cursor: tasks.length && !busy ? 'pointer' : 'not-allowed' }}>
        {busy ? 'Pripravljam …' : '⬇ .tex'}
      </button>
      <label style={small}><input type="checkbox" checked={withAnswers} onChange={e => setWithAnswers(e.target.checked)} /> z rešitvami</label>
      <label style={small} title="Pod vsako nalogo siva vrstica: podpoglavje · Bloom · vrsta · težavnost (le tisk; pri .tex jo preklopiš pri prevajanju)">
        <input type="checkbox" checked={withMeta} onChange={e => setWithMeta(e.target.checked)} /> z oznakami
      </label>
      {note && <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: note.ok ? 'var(--green-ok)' : '#b7791f' }}>{note.text}</span>}

      {printing && tasks.length > 0 && createPortal(
        <div className="print-questions lx" lang="sl" aria-hidden>
          <header className="lx-titleblock">
            <div className="lx-title">{title}</div>
            {info.subtitle && <div className="lx-author">{info.subtitle}</div>}
          </header>
          {!withAnswers && (
            <div className="lx-name">
              <span>Ime in priimek: ____________________________</span>
              <span>Datum: ______________</span>
            </div>
          )}
          {groups.map(g => (
            <section key={g.chapterKey || 'none'}>
              <h2 className="lx-section">{g.chapterTitle}{info.context(g) && ` (${info.context(g)})`}</h2>
              {g.topics.map(sub => (
                <div key={sub.key || 'chapter'}>
                  {sub.title && <h3 className="lx-subsection">{sub.title}</h3>}
                  {sub.tasks.map(t => {
                    n++;
                    const meta = withMeta ? metaLine(t) : '';
                    const ct = correctText(t);
                    return (
                      <div className="lx-task" key={t.id}>
                        <span className="lx-num">{n}.</span>
                        <Rich html={t.body} />
                        {(t.answer_kind === 'mc' || t.answer_kind === 'tf') && t.options && (
                          <p className="lx-options">{t.options.map((o, i) => `${OPTION_LETTERS[i]}) ${o.text}`).join(', ')}</p>
                        )}
                        {meta && <div className="lx-meta">{meta}</div>}
                        {withAnswers ? (
                          (ct || t.answer || t.solution) && (
                            <p className="lx-answer"><b>Rešitev:</b> {ct}{ct && (t.answer || t.solution) ? ' · ' : ''}
                              {t.answer && <Rich html={t.answer} />}{t.answer && t.solution ? ' · ' : ''}{t.solution && <Rich html={t.solution} />}
                            </p>
                          )
                        ) : (t.answer_kind === 'short' || t.answer_kind === 'open' || t.answer_kind === 'numeric') && <div className="lx-space" />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
