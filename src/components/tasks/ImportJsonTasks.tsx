'use client';

import { useRef, useState, useMemo } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { readTextFile } from '@/lib/quiz/textImport';
import { parseTasksJson } from '@/lib/tasks/exportJson';
import { plainKey } from '@/lib/tasks/import';
import { relinkTasks } from '@/lib/tasks/api';
import { Rich, TaskBadges, btn } from './ui';
import type { Task } from '@/lib/tasks/types';

/** Gumb + okno za uvoz nalog iz .json (izvoz iz baze nalog): obnovi vse metapodatke in povezave med nalogami. */
export default function ImportJsonTasks() {
  const { tasks, importMany, reload } = useTasks();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [skipDup, setSkipDup] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => (file ? parseTasksJson(file.text) : null), [file]);
  const byId = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
  const byText = useMemo(() => new Map(tasks.map(t => [plainKey(t.body), t.id])), [tasks]);

  /** Dvojnik: enak id ali enako besedilo kot naloga, ki je že v bazi (vrne id obstoječe naloge). */
  const dupOf = (srcId: string, body: string): string | null => (byId.has(srcId) ? srcId : byText.get(plainKey(body)) ?? null);
  const dups = parsed ? parsed.items.filter(it => dupOf(it.srcId, it.draft.body)) : [];
  const toImport = parsed ? parsed.items.filter(it => !(skipDup && dupOf(it.srcId, it.draft.body))) : [];

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setDone(null); setError(null);
    setFile({ name: f.name, text: await readTextFile(f) });
  };

  const run = async () => {
    if (!parsed || !toImport.length) return;
    setBusy(0); setError(null);
    try {
      const inserted = await importMany(toImport.map(it => it.draft), n => setBusy(n));
      // povezave: izvirnik → novo id (ali id že obstoječe naloge, če je bil preskočen kot dvojnik)
      const idMap = new Map<string, string>();
      parsed.items.forEach(it => { const d = dupOf(it.srcId, it.draft.body); if (d && skipDup) idMap.set(it.srcId, d); });
      toImport.forEach((it, i) => { if (inserted[i]) idMap.set(it.srcId, inserted[i].id); });
      const links = toImport.flatMap((it, i) => {
        const parent = it.srcParent ? idMap.get(it.srcParent) ?? (byId.has(it.srcParent) ? it.srcParent : null) : null;
        return parent && inserted[i] ? [{ id: inserted[i].id, parent_id: parent }] : [];
      });
      if (links.length) { await relinkTasks(links); reload(); }
      setDone(`Uvoženih ${inserted.length} nalog iz ${file!.name}${links.length ? `, ${links.length} povezav pod izvirnimi nalogami` : ''}.`);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const close = () => { if (busy === null) { setFile(null); setError(null); } };

  return (
    <>
      <button onClick={() => fileRef.current?.click()} title="Uvozi naloge iz izvožene datoteke (.json): obnovi besedilo z enačbami, rešitve, metapodatke in povezave" style={btn()}>⬆ Uvozi JSON</button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      {done && <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--green-ok)' }}>✓ {done}</span>}

      {file && parsed && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,20,12,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '720px', background: 'var(--canvas)', borderRadius: 'var(--r-md)', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', overflow: 'hidden', fontFamily: 'var(--font-sans)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--forest)' }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '19px', fontWeight: 400, color: '#fff' }}>Uvoz nalog (JSON) — {file.name}</h3>
              <button onClick={close} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '22px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: 'var(--body)' }}>
              <div>
                Najdenih <b>{parsed.items.length}</b> nalog
                {dups.length > 0 && (
                  <label style={{ marginLeft: '10px', display: 'inline-flex', gap: '5px', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={skipDup} onChange={e => setSkipDup(e.target.checked)} />
                    preskoči {dups.length} že obstoječih (enak id ali besedilo)
                  </label>
                )}
              </div>
              {(parsed.errors.length > 0 || parsed.warnings.length > 0) && (
                <details open={parsed.errors.length > 0} style={{ fontSize: '12px' }}>
                  <summary style={{ cursor: 'pointer', color: parsed.errors.length ? '#c0392b' : '#b7791f' }}>
                    {parsed.errors.length > 0 && `${parsed.errors.length} napak`}{parsed.errors.length > 0 && parsed.warnings.length > 0 && ' · '}{parsed.warnings.length > 0 && `${parsed.warnings.length} opozoril`}
                  </summary>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: 'var(--muted)', listStyle: 'disc' }}>
                    {[...parsed.errors, ...parsed.warnings].map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </details>
              )}
              {toImport.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>Predogled</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
                    {toImport.slice(0, 5).map((it, i) => (
                      <div key={i} style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <Rich html={it.draft.body} />
                        <TaskBadges task={{ ...it.draft, id: String(i), created_at: '', updated_at: '' } as Task} />
                      </div>
                    ))}
                    {toImport.length > 5 && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>… in še {toImport.length - 5}</div>}
                  </div>
                </div>
              )}
              {error && <p style={{ color: '#c0392b', margin: 0 }}>{error}</p>}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', borderTop: '1px solid var(--hairline)', paddingTop: '12px' }}>
                <button onClick={() => void run()} disabled={!toImport.length || busy !== null}
                  style={{ ...btn(true), opacity: !toImport.length || busy !== null ? 0.5 : 1 }}>
                  {busy !== null ? `Uvažam … ${busy}/${toImport.length}` : `Uvozi ${toImport.length} nalog`}
                </button>
                <button onClick={close} disabled={busy !== null} style={btn()}>Prekliči</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
