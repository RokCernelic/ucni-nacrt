'use client';

import { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useTaskSelection } from '@/hooks/useTaskSelection';
import type { Task } from '@/lib/tasks/types';
import TaskEditor from './TaskEditor';
import { Rich, TaskBadges, TaskAnswer, btn } from './ui';

/** Seznam nalog (vsaka v svojem okvirju): kljukica za izbor, Uredi, Izbriši, + Nova naloga. */
export default function TaskList({ tasks, fixedTopic, showTopics = true, emptyText, showAdd = true, startIndex = 0, hideTopic, hideChapter }: {
  tasks: Task[];
  /** nova naloga je že povezana s tem podpoglavjem */
  fixedTopic?: string;
  showTopics?: boolean;
  emptyText?: string;
  /** gumb »+ Nova naloga« pod seznamom */
  showAdd?: boolean;
  /** zaporedna številka prve naloge − 1 (oštevilčenje čez več skupin) */
  startIndex?: number;
  /** podpoglavje, pod katerim je seznam (ne ponavljaj ga pri vsaki nalogi) */
  hideTopic?: string;
  hideChapter?: string;
}) {
  const { save, remove } = useTasks();
  const { selected, toggle } = useTaskSelection();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const del = async (t: Task) => {
    if (!confirm('Izbrišem to nalogo iz baze? Izgine povsod (učni načrt, izbor).')) return;
    try { await remove(t.id); toggle(t.id, false); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'var(--font-sans)' }}>
      {error && <p style={{ fontSize: '12px', color: '#c0392b', margin: 0 }}>{error}</p>}
      {tasks.length === 0 && !adding && emptyText && <p style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', margin: 0 }}>{emptyText}</p>}

      {tasks.map((t, i) => {
        const on = selected.has(t.id);
        return (
          <div key={t.id} style={{ border: `1px solid ${on ? 'var(--forest)' : 'var(--hairline)'}`, borderRadius: 'var(--r-md)',
            background: editingId === t.id ? 'var(--surface)' : 'var(--canvas)', padding: '10px 12px', fontSize: '13px', color: 'var(--body)', lineHeight: 1.5 }}>
            {editingId === t.id ? (
              <TaskEditor initial={t} onCancel={() => setEditingId(null)} onSave={async d => { await save({ ...d, id: t.id }); setEditingId(null); }} />
            ) : (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <input type="checkbox" checked={on} onChange={() => toggle(t.id)} title="Izberi (za tisk / kviz)" style={{ marginTop: '3px', cursor: 'pointer' }} />
                <span style={{ color: 'var(--muted)', minWidth: '18px', fontVariantNumeric: 'tabular-nums' }}>{startIndex + i + 1}.</span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <Rich html={t.body} />
                  {(t.answer_kind === 'mc' || t.answer_kind === 'tf') && t.options && (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '12px' }}>
                      {t.options.map((o, oi) => (
                        <span key={o.id} style={{ color: o.id === t.correct ? 'var(--green-ok)' : 'var(--muted)', fontWeight: o.id === t.correct ? 600 : 400 }}>
                          {'ABCDEF'[oi]}) {o.text}
                        </span>
                      ))}
                    </div>
                  )}
                  {(t.answer || t.answer_kind === 'numeric') && (
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Rešitev: <TaskAnswer task={t} /></div>
                  )}
                  <TaskBadges task={t} showTopics={showTopics} hideTopic={hideTopic} hideChapter={hideChapter} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                  <button onClick={() => { setEditingId(t.id); setAdding(false); }} style={{ ...btn(), padding: '3px 9px', fontSize: '11px' }}>✎ Uredi</button>
                  <button onClick={() => void del(t)} style={{ ...btn(), padding: '3px 9px', fontSize: '11px', color: '#c0392b', borderColor: '#e0b4ae' }}>× Izbriši</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {!showAdd ? null : adding ? (
        <div style={{ border: '1px dashed var(--forest)', borderRadius: 'var(--r-md)', padding: '12px', background: 'var(--surface)' }}>
          <TaskEditor fixedTopic={fixedTopic} onCancel={() => setAdding(false)} onSave={async d => { await save(d); setAdding(false); }} />
        </div>
      ) : (
        <button onClick={() => { setAdding(true); setEditingId(null); }} style={{ ...btn(), alignSelf: 'flex-start', borderStyle: 'dashed', padding: '7px 14px' }}>
          + Nova naloga
        </button>
      )}
    </div>
  );
}
