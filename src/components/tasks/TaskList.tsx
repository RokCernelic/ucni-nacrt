'use client';

import { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useTaskSelection } from '@/hooks/useTaskSelection';
import { isChoice, correctIds, LETTERS, type Task, type TaskDraft } from '@/lib/tasks/types';
import { nestUnderParents, isNested } from '@/lib/tasks/order';
import { offerUndo } from '@/lib/undoStore';
import { GEN_GROUPS } from '@/lib/tasks/genOptions';
import TaskEditor from './TaskEditor';
import { Rich, TaskBadges, TaskAnswer, Chip, btn, tinyLabel, input } from './ui';

/** Seznam nalog (vsaka v svojem okvirju): kljukica za izbor, Uredi, Izbriši, + Nova naloga. */
export default function TaskList({ tasks, fixedTopic, showTopics = true, emptyText, showAdd = true, startIndex = 0, hideTopic, hideChapter, extraAction, leading }: {
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
}) {
  const { save, remove, restore } = useTasks();
  const { selected, toggle } = useTaskSelection();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** naloga, ki ima odprto okno ✨ Generiraj */
  const [genOpen, setGenOpen] = useState<string | null>(null);
  const [mods, setMods] = useState<Record<string, string>>({});   // skupina → izbrana možnost
  const [kindMode, setKindMode] = useState<'similar' | 'variant' | 'complete'>('similar');
  const variant = kindMode === 'variant';
  const complete = kindMode === 'complete';
  const [extra, setExtra] = useState('');
  const [genBusy, setGenBusy] = useState<string | null>(null);
  /** generiran osnutek, prikazan pod nalogo `forId`, preden ga shraniš */
  const [gen, setGen] = useState<{ forId: string; draft: TaskDraft; note: string; mode: 'similar' | 'variant' | 'complete' } | null>(null);

  const openGen = (t: Task) => { setGenOpen(genOpen === t.id ? null : t.id); setMods({}); setKindMode('similar'); setExtra(''); setGen(null); setEditingId(null); setAdding(false); };

  const generate = async (t: Task) => {
    setGenBusy(t.id); setError(null);
    try {
      const { id: _id, created_at: _c, updated_at: _u, ...task } = t; // eslint-disable-line @typescript-eslint/no-unused-vars
      const res = await fetch('/api/tasks/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, mode: kindMode, mods: Object.values(mods), extra }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Napaka ${res.status}`);
      setGen({ forId: t.id, draft: data.draft, note: data.note ?? '', mode: kindMode });
      setGenOpen(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setGenBusy(null); }
  };

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
        const list = nestUnderParents(tasks);
        const ids = new Set(list.map(t => t.id));
        let num = startIndex;
        return list.map(t => {
        const nested = isNested(t, ids);
        if (!nested) num++;
        const on = selected.has(t.id);
        return (
          <div key={t.id} style={{ border: `1px solid ${on ? 'var(--forest)' : 'var(--hairline)'}`, borderRadius: 'var(--r-md)',
            background: editingId === t.id ? 'var(--surface)' : 'var(--canvas)', padding: '10px 12px', fontSize: '13px', color: 'var(--body)', lineHeight: 1.5,
            ...(nested ? { marginLeft: '28px', borderLeft: '4px solid var(--forest)' } : {}) }}>
            {editingId === t.id ? (
              <TaskEditor initial={t} onCancel={() => setEditingId(null)} onSave={async d => { await save({ ...d, id: t.id }); setEditingId(null); }} />
            ) : (
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
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                  <button onClick={() => { setEditingId(t.id); setAdding(false); }} style={{ ...btn(), padding: '3px 9px', fontSize: '11px' }}>✎ Uredi</button>
                  <button onClick={() => openGen(t)} disabled={genBusy !== null}
                    title="Z umetno inteligenco (Claude) ustvari novo nalogo iz te: podobno, težjo, lažjo, drugačne oblike …"
                    style={{ ...btn(genOpen === t.id), padding: '3px 9px', fontSize: '11px', opacity: genBusy !== null ? 0.5 : 1 }}>
                    ✨ Generiraj
                  </button>
                  <button onClick={() => void del(t)} style={{ ...btn(), padding: '3px 9px', fontSize: '11px', color: '#c0392b', borderColor: '#e0b4ae' }}>× Izbriši</button>
                </div>
              </div>
            )}
            {genOpen === t.id && (
              <div style={{ marginTop: '10px', border: '1px dashed var(--forest)', borderRadius: 'var(--r-md)', padding: '12px', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '12px', color: 'var(--forest)', fontWeight: 600 }}>✨ Generiraj iz te naloge</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ ...tinyLabel, minWidth: '120px' }}>Osnova</span>
                  <Chip active={kindMode === 'similar'} onClick={() => setKindMode('similar')} title="Nova, podobna naloga (druga situacija, podatki, izid)">podobna naloga</Chip>
                  <Chip active={variant} onClick={() => setKindMode('variant')} title="Minimalna sprememba: zamenja številke (po potrebi kakšno besedo)">le zamenjaj številke</Chip>
                  <Chip active={complete} onClick={() => setKindMode('complete')} title="Ista naloga: dopolni manjkajoče (rešitev, pojasnilo, težavnost, Bloom, oblika odgovora, poglavje, standardi) in uredi obliko">dopolni to nalogo</Chip>
                </div>
                {kindMode === 'similar' && GEN_GROUPS.map(g => (
                  <div key={g.id} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ ...tinyLabel, minWidth: '120px' }}>{g.label}</span>
                    {g.options.map(o => (
                      <Chip key={o.id} active={mods[g.id] === o.id} title={o.instruction}
                        onClick={() => setMods(m => { const n = { ...m }; if (n[g.id] === o.id) delete n[g.id]; else n[g.id] = o.id; return n; })}>
                        {o.label}
                      </Chip>
                    ))}
                  </div>
                ))}
                {kindMode === 'similar' && <input value={extra} onChange={e => setExtra(e.target.value)} maxLength={600} placeholder="Dodatno navodilo (neobvezno), npr. »naj gre za dvigalo na gradbišču«" style={{ ...input, width: '100%', boxSizing: 'border-box' }} />}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => void generate(t)} disabled={genBusy !== null} style={{ ...btn(true), padding: '5px 14px', opacity: genBusy !== null ? 0.6 : 1 }}>
                    {genBusy === t.id ? '… generiram' : complete ? 'Dopolni' : 'Generiraj'}
                  </button>
                  <button onClick={() => setGenOpen(null)} disabled={genBusy !== null} style={{ ...btn(), padding: '5px 12px' }}>Prekliči</button>
                </div>
              </div>
            )}
            {gen?.forId === t.id && (
              <div style={{ marginTop: '10px', border: '1px dashed var(--forest)', borderRadius: 'var(--r-md)', padding: '12px', background: 'var(--surface)' }}>
                <div style={{ fontSize: '12px', color: 'var(--forest)', fontWeight: 600, marginBottom: '2px' }}>{gen.mode === 'complete' ? '✨ Dopolnjena naloga (preveri in shrani — prepiše to nalogo)' : '✨ Predlagana naloga (osnutek — preveri, popravi in shrani)'}</div>
                {gen.note && <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>{gen.note}</div>}
                <TaskEditor initial={gen.draft} onCancel={() => setGen(null)} onSave={async d => { await save(gen.mode === 'complete' ? { ...d, id: t.id, parent_id: t.parent_id } : { ...d, parent_id: t.parent_id ?? t.id }); setGen(null); }} />
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
            <button onClick={() => { setAdding(true); setEditingId(null); }} style={{ ...btn(), borderStyle: 'dashed', padding: '7px 14px' }}>
              + Nova naloga
            </button>
          )}
          {extraAction}
        </div>
      )}
      {showAdd && adding && (
        <div style={{ border: '1px dashed var(--forest)', borderRadius: 'var(--r-md)', padding: '12px', background: 'var(--surface)' }}>
          <TaskEditor fixedTopic={fixedTopic} onCancel={() => setAdding(false)} onSave={async d => { await save(d); setAdding(false); }} />
        </div>
      )}
    </div>
  );
}
