'use client';

import { useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { Task } from '@/lib/tasks/types';
import { questionsLabel } from '@/lib/quiz/format';
import { Rich, TaskAnswer, btn } from './ui';

/** Gumb »Natisni izbrane«: učni list A4 z izbranimi nalogami (list se izriše le med tiskom). */
export default function PrintTasks({ tasks, title }: { tasks: Task[]; title: string }) {
  const [printing, setPrinting] = useState(false);
  const [withAnswers, setWithAnswers] = useState(false);

  const print = () => {
    const root = document.documentElement;
    const done = () => { root.classList.remove('printing-questions'); setPrinting(false); window.removeEventListener('afterprint', done); };
    flushSync(() => setPrinting(true));
    root.classList.add('printing-questions');
    window.addEventListener('afterprint', done);
    window.print();
  };

  const total = tasks.reduce((s, t) => s + (t.points || 0), 0);
  const minutes = tasks.reduce((s, t) => s + (t.minutes || 0), 0);

  return (
    <>
      <button onClick={print} disabled={!tasks.length}
        style={{ ...btn(true), padding: '5px 10px', opacity: tasks.length ? 1 : 0.45, cursor: tasks.length ? 'pointer' : 'not-allowed' }}>
        🖨 Natisni izbrane ({tasks.length})
      </button>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer' }}>
        <input type="checkbox" checked={withAnswers} onChange={e => setWithAnswers(e.target.checked)} /> z rešitvami
      </label>
      {printing && tasks.length > 0 && createPortal(
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
