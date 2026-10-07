'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { Task } from '@/lib/tasks/types';
import { questionsLabel } from '@/lib/quiz/format';
import { exportTasksTex } from '@/lib/tasks/exportTex';
import { OPTION_LETTERS } from '@/lib/tasks/latex';
import { Rich, TaskAnswer, btn } from './ui';

/**
 * Notranja površina ene polovice (pokončni A4 razrezan po vodoravni sredini = trak 210 × 148,5 mm), v mm:
 * 20 mm zunanji rob, ob ločnici 9 mm (skupaj okoli 4 vrstice razmika med polovicama) → višina 148,5 − 20 − 9.
 */
const HALF = { w: 170, h: 119.5 } as const;

/** Strnjen seznam nalog (brez glave, brez razmikov) — ena polovica lista. */
function CompactList({ tasks }: { tasks: Task[] }) {
  return (
    <>
      {tasks.map((t, i) => (
        <div className="cp-item" key={t.id}>
          <span className="cp-num">{i + 1}.</span>
          <Rich html={t.body} />
          {(t.answer_kind === 'mc' || t.answer_kind === 'tf') && t.options && (
            <p className="cp-options">{t.options.map((o, k) => `${OPTION_LETTERS[k]}) ${o.text}`).join(', ')}</p>
          )}
        </div>
      ))}
    </>
  );
}

/**
 * »Natisni izbrane«: učni list A4 z izbranimi nalogami (list se izriše le med tiskom),
 * »strnjeno«: izbor 2× na A4 za razrez in lepljenje v zvezek, in
 * »⬇ .tex«: izvoz izbranih nalog v obliki zbirke nalog za xelatex (s slikami kot .zip).
 */
export default function PrintTasks({ tasks, title }: { tasks: Task[]; title: string }) {
  const [printing, setPrinting] = useState(false);
  const [withAnswers, setWithAnswers] = useState(false);
  const [compact, setCompact] = useState(false);
  /** zasedenost ene polovice: 1 = polna */
  const [fit, setFit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);

  const measuring = compact && tasks.length > 0;

  // Izmeri, ali izbor gre na eno polovico (tudi ko se slike naložijo).
  useEffect(() => {
    if (!measuring) return;
    const m = measureRef.current, p = probeRef.current;
    if (!m || !p) return;
    const compute = () => { const h = p.getBoundingClientRect().height; if (h > 0) setFit(m.scrollHeight / h); };
    const ro = new ResizeObserver(compute);
    ro.observe(m); ro.observe(p);
    return () => ro.disconnect();
  }, [measuring, tasks]);

  const overflow = measuring && fit !== null && fit > 1.001;

  const print = () => {
    if (overflow) return;
    const root = document.documentElement;
    // strnjen tisk: pokončni A4 brez robov (polovici s 2 cm roba sta del postavitve); velja le med tiskom
    let pageStyle: HTMLStyleElement | null = null;
    if (compact) {
      pageStyle = document.createElement('style');
      pageStyle.textContent = '@page { size: A4 portrait; margin: 0; }';
      document.head.appendChild(pageStyle);
    }
    const done = () => { root.classList.remove('printing-questions'); setPrinting(false); pageStyle?.remove(); window.removeEventListener('afterprint', done); };
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

  const total = tasks.reduce((s, t) => s + (t.points || 0), 0);
  const minutes = tasks.reduce((s, t) => s + (t.minutes || 0), 0);
  const small: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer' };
  const printDisabled = !tasks.length || overflow;

  return (
    <>
      <button onClick={print} disabled={printDisabled}
        title={overflow ? 'Izbrane naloge ne gredo na pol A4 — izberi manj nalog' : compact ? 'Natisne izbor 2× na en A4; list razrežeš po vodoravni sredini' : undefined}
        style={{ ...btn(true), padding: '5px 10px', opacity: printDisabled ? 0.45 : 1, cursor: printDisabled ? 'not-allowed' : 'pointer' }}>
        🖨 {compact ? 'Natisni 2× na A4' : 'Natisni izbrane'} ({tasks.length})
      </button>
      <button onClick={() => void exportTex()} disabled={!tasks.length || busy}
        title="Prenesi izbrane naloge kot LaTeX (.tex; s slikami .zip) v obliki zbirke nalog — prevedeš z xelatexom"
        style={{ ...btn(), padding: '5px 10px', opacity: tasks.length && !busy ? 1 : 0.45, cursor: tasks.length && !busy ? 'pointer' : 'not-allowed' }}>
        {busy ? 'Pripravljam …' : '⬇ .tex'}
      </button>
      <label style={{ ...small, opacity: compact ? 0.45 : 1 }}>
        <input type="checkbox" checked={withAnswers && !compact} disabled={compact} onChange={e => setWithAnswers(e.target.checked)} /> z rešitvami
      </label>
      <label style={small} title="Brez glave in razmikov; ves izbor se natisne 2× na A4 (robovi 2 cm), da list razrežeš na pol in učenci prilepijo v zvezek">
        <input type="checkbox" checked={compact} onChange={e => { setCompact(e.target.checked); setFit(null); }} /> strnjeno (2× na A4)
      </label>
      {measuring && fit !== null && (
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: overflow ? '#c0392b' : 'var(--green-ok)' }}>
          {overflow
            ? `⚠ Ne gre na pol A4 (presega za ${Math.round((fit - 1) * 100)} %) — izberi manj nalog`
            : `Zasedeno ${Math.round(fit * 100)} % polovice lista`}
        </span>
      )}
      {note && <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: note.ok ? 'var(--green-ok)' : '#b7791f' }}>{note.text}</span>}

      {/* nevidno merilo: ista postavitev kot ena polovica, širina in višina notranje površine */}
      {measuring && (
        <div aria-hidden style={{ position: 'fixed', left: '-10000px', top: 0, width: `${HALF.w}mm`, visibility: 'hidden', pointerEvents: 'none' }}>
          <div ref={probeRef} style={{ height: `${HALF.h}mm`, width: 0 }} />
          <div ref={measureRef} className="cp-half" style={{ padding: 0, overflow: 'visible', display: 'flow-root' }}><CompactList tasks={tasks} /></div>
        </div>
      )}

      {printing && tasks.length > 0 && compact && createPortal(
        <div className="print-questions cp" aria-hidden>
          <div className="cp-half"><CompactList tasks={tasks} /></div>
          <div className="cp-half"><CompactList tasks={tasks} /></div>
        </div>,
        document.body,
      )}

      {printing && tasks.length > 0 && !compact && createPortal(
        <div className="print-questions" aria-hidden>
          <div className="pq-head">
            <div className="pq-title">{title}</div>
            <div className="pq-meta">
              Ime in priimek: ______________________________ &nbsp; Datum: ____________ &nbsp; {questionsLabel(tasks.length)}
              {total > 0 && ` · ${String(total).replace('.', ',')} točk`}{minutes > 0 && ` · ${minutes} min`}
            </div>
          </div>
          <ol className="pq-list">
            {tasks.map(t => (
              <li key={t.id} className="pq-item">
                <Rich html={t.body} />
                {(t.answer_kind === 'mc' || t.answer_kind === 'tf') && t.options && (
                  <ol className="pq-options">{t.options.map(o => <li key={o.id}>{o.text}</li>)}</ol>
                )}
                {withAnswers ? (
                  <div className="pq-answer">
                    <b>Rešitev:</b> <TaskAnswer task={t} />
                    {t.solution && <Rich html={t.solution} className="pq-solution" />}
                  </div>
                ) : (t.answer_kind === 'short' || t.answer_kind === 'open' || t.answer_kind === 'numeric') && <div className="pq-space" />}
              </li>
            ))}
          </ol>
        </div>,
        document.body,
      )}
    </>
  );
}
