'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useQuizLibrary, folderPath, QuizStorageFullError } from '@/hooks/useQuizLibrary';
import { questionProblems } from '@/lib/quiz/scoring';
import { questionsLabel, pointsLabel } from '@/lib/quiz/format';
import StartSessionDialog from '@/components/quiz/StartSessionDialog';
import type { QuizFolder } from '@/lib/quiz/types';

const FOLDER_KEY = 'kvizi-trenutna-mapa'; // sessionStorage (ne sinhronizira v oblak)

const btn = (primary = false): React.CSSProperties => ({
  fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: primary ? 600 : 500,
  color: primary ? '#fff' : 'var(--forest)', background: primary ? 'var(--forest)' : 'transparent',
  border: primary ? 'none' : '1px solid var(--hairline)', borderRadius: 'var(--r-sm)',
  padding: '7px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
});
const smallBtn: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: 'var(--muted)',
  background: 'transparent', border: 'none', padding: '4px 6px', cursor: 'pointer',
};

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.3l2 2.2h8.7A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
    </svg>
  );
}

/** Vse mape kot seznam z zamikom (za izbirnik »Premakni v«). */
function flatFolders(folders: QuizFolder[], parentId: string | null = null, depth = 0): { f: QuizFolder; depth: number }[] {
  return folders
    .filter(f => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'sl'))
    .flatMap(f => [{ f, depth }, ...flatFolders(folders, f.id, depth + 1)]);
}

export default function QuizLibrary() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const lib = useQuizLibrary();
  const [current, setCurrent] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    try { const v = sessionStorage.getItem(FOLDER_KEY); if (v) setCurrent(v); } catch { /* ignore */ }
  }, []);
  const open = (id: string | null) => {
    setCurrent(id);
    try { if (id) sessionStorage.setItem(FOLDER_KEY, id); else sessionStorage.removeItem(FOLDER_KEY); } catch { /* ignore */ }
  };

  // če je trenutna mapa izbrisana, pojdi na koren
  useEffect(() => {
    if (lib.loaded && current && !lib.folders.some(f => f.id === current)) open(null);
  }, [lib.loaded, lib.folders, current]);

  const guard = (fn: () => void) => {
    try { setError(null); fn(); }
    catch (e) { setError(e instanceof QuizStorageFullError ? e.message : 'Shranjevanje ni uspelo.'); }
  };

  if (loading || !lib.loaded) return null;

  const path = folderPath(lib.folders, current);
  const subfolders = lib.folders.filter(f => f.parentId === current).sort((a, b) => a.name.localeCompare(b.name, 'sl'));
  const quizzes = lib.quizzes
    .filter(q => q.folderId === current)
    .sort((a, b) => (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt));
  const allFolders = flatFolders(lib.folders);
  const countIn = (folderId: string): number => {
    const direct = lib.quizzes.filter(q => q.folderId === folderId).length;
    return direct + lib.folders.filter(f => f.parentId === folderId).reduce((n, f) => n + countIn(f.id), 0);
  };

  const card: React.CSSProperties = { background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', padding: '14px 16px' };

  return (
    <div>
      <div style={{ background: 'var(--forest)', padding: '32px 32px 28px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 6px' }}>
            Knjižnica
          </p>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px,4vw,48px)', fontWeight: 300, color: '#fff', lineHeight: 1 }}>Kvizi</h1>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', padding: '28px 32px 64px' }}>
        {!user ? (
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>
            Za kvize se <Link href="/login" style={{ color: 'var(--forest)', fontWeight: 500 }}>prijavite</Link>.
          </p>
        ) : (
          <>
            {/* pot + orodja */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
              <nav style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontFamily: 'var(--font-sans)', fontSize: '13px', flex: '1 1 auto' }}>
                <button onClick={() => open(null)} style={{ ...smallBtn, fontSize: '13px', padding: 0, color: current ? 'var(--forest)' : 'var(--ink)', fontWeight: current ? 500 : 600 }}>Vsi kvizi</button>
                {path.map((f, i) => (
                  <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--muted)' }}>/</span>
                    <button onClick={() => open(f.id)} style={{ ...smallBtn, fontSize: '13px', padding: 0, color: i === path.length - 1 ? 'var(--ink)' : 'var(--forest)', fontWeight: i === path.length - 1 ? 600 : 500 }}>{f.name}</button>
                  </span>
                ))}
              </nav>
              <button style={btn()} onClick={() => guard(() => { const id = lib.createFolder('Nova mapa', current); setRenaming(id); })}>+ Nova mapa</button>
              <button style={btn(true)} onClick={() => guard(() => { const id = lib.createQuiz(current); router.push(`/kvizi/${id}`); })}>+ Nov kviz</button>
            </div>

            {error && <p style={{ fontSize: '13px', color: '#c0392b', marginBottom: '12px' }}>{error}</p>}

            {/* podmape */}
            {subfolders.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', marginBottom: '22px' }}>
                {subfolders.map(f => (
                  <div key={f.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px' }}>
                    <span style={{ color: 'var(--forest)', display: 'flex' }}><FolderIcon /></span>
                    {renaming === f.id ? (
                      <input autoFocus defaultValue={f.name}
                        onFocus={e => e.currentTarget.select()}
                        onBlur={e => { lib.renameFolder(f.id, e.currentTarget.value.trim() || f.name); setRenaming(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }}
                        style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-sans)', fontSize: '13px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '4px 6px' }} />
                    ) : (
                      <button onClick={() => open(f.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· {countIn(f.id)}</span>
                      </button>
                    )}
                    <button title="Preimenuj" style={smallBtn} onClick={() => setRenaming(f.id)}>✎</button>
                    <button title="Izbriši mapo (vsebina gre v nadrejeno mapo)" style={smallBtn}
                      onClick={() => { if (confirm(`Izbrišem mapo »${f.name}«? Kvizi in podmape se premaknejo eno raven višje.`)) guard(() => lib.deleteFolder(f.id)); }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* kvizi */}
            {quizzes.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {subfolders.length ? 'V tej mapi ni kvizov.' : 'Tu še ni kvizov. Ustvari prvega z gumbom »+ Nov kviz«.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {quizzes.map(q => {
                  const incomplete = q.questions.filter(x => questionProblems(x).length > 0).length;
                  const maxPoints = q.questions.reduce((s, x) => s + x.points, 0);
                  return (
                    <div key={q.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                      <Link href={`/kvizi/${q.id}`} style={{ flex: '1 1 260px', minWidth: 0, textDecoration: 'none' }}>
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>{q.title || 'Brez naslova'}</div>
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                          {questionsLabel(q.questions.length)} · {pointsLabel(maxPoints)}
                          {' · '}
                          {incomplete > 0
                            ? <span style={{ color: '#b7791f' }}>⚠ nedokončano: {incomplete}</span>
                            : <span style={{ color: 'var(--green-ok)' }}>✓ pripravljen</span>}
                        </div>
                      </Link>
                      <select value={q.folderId ?? ''} title="Premakni v mapo"
                        onChange={e => guard(() => lib.updateQuiz(q.id, { folderId: e.target.value || null }))}
                        style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--ink)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '5px 6px', background: 'var(--canvas)', maxWidth: '180px' }}>
                        <option value="">📁 Vsi kvizi (koren)</option>
                        {allFolders.map(({ f, depth }) => <option key={f.id} value={f.id}>{'  '.repeat(depth)}📁 {f.name}</option>)}
                      </select>
                      <button style={btn(true)} disabled={incomplete > 0} title={incomplete > 0 ? 'Najprej dokončaj vsa vprašanja' : 'Zaženi sejo z razredom'}
                        onClick={() => setStarting(q.id)}>▶ Zaženi</button>
                      <Link href={`/kvizi/${q.id}`} style={{ ...btn(), textDecoration: 'none' }}>Uredi</Link>
                      {q.lastUsedAt && <Link href={`/kvizi/${q.id}/zgodovina`} style={{ ...btn(), textDecoration: 'none' }} title="Pretekle seje in primerjava med razredi">Zgodovina</Link>}
                      <button style={btn()} onClick={() => guard(() => lib.duplicateQuiz(q.id))}>Podvoji</button>
                      <button style={{ ...btn(), color: '#c0392b', borderColor: '#e0b4ae' }}
                        onClick={() => { if (confirm(`Izbrišem kviz »${q.title}«?`)) guard(() => lib.deleteQuiz(q.id)); }}>Izbriši</button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      {starting && lib.quizzes.find(x => x.id === starting) && (
        <StartSessionDialog quiz={lib.quizzes.find(x => x.id === starting)!} onClose={() => setStarting(null)} />
      )}
    </div>
  );
}
