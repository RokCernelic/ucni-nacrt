'use client';

import { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useTaskSelection } from '@/hooks/useTaskSelection';
import { isChoice, correctIds, LETTERS, type Task } from '@/lib/tasks/types';
import { nestUnderParents, isNested } from '@/lib/tasks/order';
import { offerUndo } from '@/lib/undoStore';
import TaskEditor from './TaskEditor';
import GeneratePanel from './GeneratePanel';
import SideDrawer from '@/components/SideDrawer';
import { Rich, TaskBadges, TaskAnswer, btn } from './ui';

/** Seznam nalog (vsaka v svojem okvirju): kljukica za izbor, Uredi, Izbriši, + Nova naloga. */
export default function TaskList({ tasks, fixedTopic, showTopics = true, emptyText, showAdd = true, startIndex = 0, hideTopic, hideChapter, extraAction, leading, flat, showDate }: {
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
  /** dodatni gumb poleg »+ Nova naloga« */
  extraAction?: React.ReactNode;
  /** elementi pred »+ Nova naloga« v isti vrstici (npr. število nalog, izbor, uvoz) */
  leading?: React.ReactNode;
  /** brez gnezdenja generiranih nalog pod izvirne (npr. razvrščeno po datumu) */
  flat?: boolean;
  /** pri vsaki nalogi pokaži datum dodajanja */
  showDate?: boolean;
}) {
  const { save, remove, restore } = useTasks();
  const { selected, toggle } = useTaskSelection();
  const [editingId, setEditingIdRaw] = useState<string | null>(null);
  /** urejevalnik je v stranskem oknu z desne; ob zaprtju vsebina ostane do konca animacije */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSeq, setDrawerSeq] = useState(0);
  const setEditingId = (id: string | null) => { if (id) { setEditingIdRaw(id); setDrawerOpen(true); setDrawerSeq(n => n + 1); } else setDrawerOpen(false); };
  // nova naloga se ureja v istem stranskem oknu (id '__new')
  const adding = drawerOpen && editingId === '__new';
  const setAdding = (on: boolean) => setEditingId(on ? '__new' : null);
  const [error, setError] = useState<string | null>(null);
  /** med generiranjem so gumbi ✨ Generiraj onemogočeni */
  const [genBusy, setGenBusy] = useState(false);
  const openGen = (t: Task) => setEditingId(`gen:${t.id}`);

  const del = async (t: Task) => {
    if (!confirm('Izbrišem to nalogo iz baze? Izgine povsod (učni načrt, izbor). ')) return;
    const wasSelected = selected.has(t.id);
    try {
      const snap = await remove(t.id);
      toggle(t.id, false);
      offerUndo('Naloga izbrisana', async () => { await restore(snap); if (wasSelected) toggle(t.id, true); });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'var(--font-sans)' }}>
      {error && <p style={{ fontSize: '12px', color: '#c0392b', margin: 0 }}>{error}</p>}
      {tasks.length === 0 && !adding && emptyText && <p style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', margin: 0 }}>{emptyText}</p>}

      {(() => {
        const list = flat ? tasks : nestUnderParents(tasks);
        const ids = new Set(list.map(t => t.id));
        let num = startIndex;
        return list.map(t => {
        const nested = !flat && isNested(t, ids);
        if (!nested) num++;
        const on = selected.has(t.id);
        return (
          <div key={t.id} style={{ border: `1px solid ${on ? 'var(--forest)' : 'var(--hairline)'}`, borderRadius: 'var(--r-md)',
            background: drawerOpen && (editingId === t.id || editingId === `gen:${t.id}`) ? '#f3f8fe' : 'var(--canvas)', padding: '10px 12px', ...(drawerOpen && (editingId === t.id || editingId === `gen:${t.id}`) ? { borderColor: '#6f9bd1', boxShadow: '0 0 0 1px #6f9bd1' } : {}), fontSize: '13px', color: 'var(--body)', lineHeight: 1.5,
            ...(nested ? { marginLeft: '28px', borderLeft: '4px solid var(--forest)' } : {}) }}>
            {(

              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <input type="checkbox" checked={on} onChange={() => toggle(t.id)} title="Izberi (za tisk / kviz)" style={{ marginTop: '3px', cursor: 'pointer' }} />
                <span style={{ color: 'var(--muted)', minWidth: '18px', fontVariantNumeric: 'tabular-nums' }}>{nested ? '↳' : `${num}.`}</span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <Rich html={t.body} />
                  {isChoice(t.answer_kind) && t.options && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {t.options.map((o, oi) => {
                        const right = correctIds(t).includes(o.id);
                        return (
                          <div key={o.id} style={{ color: right ? 'var(--green-ok)' : undefined, fontWeight: right ? 600 : 400 }}>
                            <b style={{ fontWeight: 700 }}>{LETTERS[oi]})</b> {o.text}{right && ' ✓'}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {((t.answer && !isChoice(t.answer_kind)) || t.answer_kind === 'numeric' || (isChoice(t.answer_kind) && t.answer)) && (
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Rešitev: <TaskAnswer task={t} noChoice /></div>
                  )}
                  <TaskBadges task={t} showTopics={showTopics} hideTopic={hideTopic} hideChapter={hideChapter} />
                  {showDate && (
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      dodano {new Date(t.created_at).toLocaleString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {t.updated_at && t.updated_at.slice(0, 16) !== t.created_at.slice(0, 16) && ` · spremenjeno ${new Date(t.updated_at).toLocaleString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                  <button onClick={() => setEditingId(t.id)} style={{ ...btn(), padding: '3px 9px', fontSize: '11px' }}>✎ Uredi</button>
                  <button onClick={() => openGen(t)} disabled={genBusy}
                    title="Z umetno inteligenco (Claude) ustvari novo nalogo iz te: podobno, težjo, lažjo, drugačne oblike …"
                    style={{ ...btn(drawerOpen && editingId === `gen:${t.id}`), padding: '3px 9px', fontSize: '11px', opacity: genBusy ? 0.5 : 1 }}>
                    ✨ Generiraj
                  </button>
                  <button onClick={() => void del(t)} style={{ ...btn(), padding: '3px 9px', fontSize: '11px', color: '#c0392b', borderColor: '#e0b4ae' }}>× Izbriši</button>
                </div>
              </div>
            )}
          </div>
        );
        });
      })()}

      {showAdd && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {leading}
          {!adding && (
            <button onClick={() => setAdding(true)} style={{ ...btn(), borderStyle: 'dashed', padding: '7px 14px' }}>
              + Nova naloga
            </button>
          )}
          {extraAction}
        </div>
      )}
      <SideDrawer open={drawerOpen} onClose={() => setEditingId(null)}
        title={editingId?.startsWith('gen:') ? '✨ Generiraj iz naloge' : editingId === '__new' ? 'Nova naloga' : 'Urejanje naloge'}
        subtitle={editingId?.startsWith('gen:') ? 'izberi možnosti, generiraj, preveri in shrani' : editingId === '__new' ? undefined : 'sprememba se shrani v bazo nalog in povsod, kjer je naloga uporabljena'}>
        {editingId?.startsWith('gen:') ? (() => {
          const t = tasks.find(x => `gen:${x.id}` === editingId);
          if (!t) return null;
          return (
            <GeneratePanel key={`gen-${drawerSeq}`} source={t} onBusy={setGenBusy} onCancel={() => setEditingId(null)}
              onSave={async (d, mode) => { await save(mode === 'complete' ? { ...d, id: t.id, parent_id: t.parent_id } : { ...d, parent_id: t.parent_id ?? t.id }); setEditingId(null); }} />
          );
        })() : editingId === '__new' ? (
          <TaskEditor key={`nova-${drawerSeq}`} fixedTopic={fixedTopic} onCancel={() => setAdding(false)} onSave={async d => { await save(d); setAdding(false); }} />
        ) : (() => {
          const t = tasks.find(x => x.id === editingId);
          return t ? <TaskEditor key={`${t.id}-${drawerSeq}`} initial={t} onCancel={() => setEditingId(null)} onSave={async d => { await save({ ...d, id: t.id }); setEditingId(null); }} /> : null;
        })()}
      </SideDrawer>
    </div>
  );
}
