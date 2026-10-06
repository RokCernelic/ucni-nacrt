'use client';

import { useRef, useState, useMemo } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { readTextFile } from '@/lib/quiz/textImport';
import { parseTex, parseTxt, plainKey, type ImportResult } from '@/lib/tasks/import';
import { allCurricula, topicLabel } from '@/lib/tasks/topics';
import { Rich, TaskBadges, btn, input } from './ui';
import type { Task } from '@/lib/tasks/types';

/** Gumb + okno za uvoz nalog iz .txt ali .tex. */
export default function ImportTasks() {
  const { tasks, importMany } = useTasks();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string; tex: boolean } | null>(null);
  const [curriculum, setCurriculum] = useState(allCurricula()[0]?.id ?? 'fizika');
  const [skipDup, setSkipDup] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const result: ImportResult | null = useMemo(() => {
    if (!file) return null;
    return file.tex ? parseTex(file.text, curriculum) : parseTxt(file.text, curriculum);
  }, [file, curriculum]);

  const existing = useMemo(() => new Set(tasks.map(t => plainKey(t.body))), [tasks]);
  const dupCount = result ? result.drafts.filter(d => existing.has(plainKey(d.body))).length : 0;
  const toImport = useMemo(() => (result ? result.drafts.filter(d => !(skipDup && existing.has(plainKey(d.body)))) : []), [result, skipDup, existing]);

  const byTopic = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of toImport) { const k = d.topics[0] ?? ''; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()];
  }, [toImport]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setDone(null); setError(null);
    const text = await readTextFile(f);
    setFile({ name: f.name, text, tex: /\.tex$/i.test(f.name) || text.includes('\\begin{naloga}') });
  };

  const run = async () => {
    if (!toImport.length) return;
    setBusy(0); setError(null);
    try {
      const ins = await importMany(toImport, n => setBusy(n));
      setDone(`Uvoženih ${ins.length} nalog iz ${file!.name}.`);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const close = () => { if (busy === null) { setFile(null); setError(null); } };

  return (
    <>
      <button onClick={() => fileRef.current?.click()} title="Uvozi naloge iz besedilne (.txt) ali LaTeX (.tex) datoteke" style={btn()}>⬆ Uvozi (.txt / .tex)</button>
      <a href="/primer-naloge.txt" download style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)' }}>primer .txt</a>
      <input ref={fileRef} type="file" accept=".txt,.tex,text/plain" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      {done && <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--green-ok)' }}>✓ {done}</span>}

      {file && result && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,20,12,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '720px', background: 'var(--canvas)', borderRadius: 'var(--r-md)', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', overflow: 'hidden', fontFamily: 'var(--font-sans)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--forest)' }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '19px', fontWeight: 400, color: '#fff' }}>Uvoz nalog — {file.name}</h3>
              <button onClick={close} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '22px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: 'var(--body)' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span>Format: <b>{file.tex ? 'LaTeX (okolje naloga)' : 'besedilo (.txt)'}</b></span>
                <span>· Učni načrt za povezave:</span>
                <select value={curriculum} onChange={e => setCurriculum(e.target.value)} style={{ ...input, padding: '4px 6px' }}>
                  {allCurricula().map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                Najdenih <b>{result.drafts.length}</b> nalog
                {dupCount > 0 && (
                  <label style={{ marginLeft: '10px', display: 'inline-flex', gap: '5px', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={skipDup} onChange={e => setSkipDup(e.target.checked)} />
                    preskoči {dupCount} že obstoječih (enako besedilo)
                  </label>
                )}
              </div>

              {byTopic.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '12px' }}>
                  {byTopic.map(([k, n]) => (
                    <div key={k || 'none'} style={{ color: k ? 'var(--forest)' : '#b7791f' }}>{k ? `↳ ${topicLabel(k)}` : '⚠ brez podpoglavja'}: <b>{n}</b></div>
                  ))}
                </div>
              )}

              {(result.errors.length > 0 || result.warnings.length > 0) && (
                <details open={result.errors.length > 0} style={{ fontSize: '12px' }}>
                  <summary style={{ cursor: 'pointer', color: result.errors.length ? '#c0392b' : '#b7791f' }}>
                    {result.errors.length > 0 && `${result.errors.length} napak`}{result.errors.length > 0 && result.warnings.length > 0 && ' · '}{result.warnings.length > 0 && `${result.warnings.length} opozoril`}
                  </summary>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: 'var(--muted)', listStyle: 'disc' }}>
                    {[...result.errors, ...result.warnings].map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </details>
              )}

              {toImport.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>Predogled</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
                    {toImport.slice(0, 5).map((d, i) => (
                      <div key={i} style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <Rich html={d.body} />
                        <TaskBadges task={{ ...d, id: String(i), created_at: '', updated_at: '' } as Task} />
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
