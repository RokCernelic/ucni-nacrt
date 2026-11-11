'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import ActiveSessions from '@/components/quiz/ActiveSessions';
import { useQuizLibrary, QuizStorageFullError } from '@/hooks/useQuizLibrary';
import { questionProblems } from '@/lib/quiz/scoring';
import { deleteEmptySessionsOfQuiz } from '@/lib/quiz/sessionApi';
import { questionsLabel, pointsLabel, dateTimeLabel } from '@/lib/quiz/format';
import StartSessionDialog from '@/components/quiz/StartSessionDialog';
import type { Quiz, QuizFolder } from '@/lib/quiz/types';

const OPEN_KEY = 'kvizi-odprte-mape'; // localStorage (le ta naprava): katere mape so razprte

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
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [draggingQuiz, setDraggingQuiz] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null); // '' pomeni koren
  const dragQuizId = useRef<string | null>(null);

  // razprte mape (drevo kot v učnem načrtu): zapomnjeno na tej napravi
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]')); } catch { return new Set(); }
  });
  const toggleFolder = (id: string, on?: boolean) => setOpenFolders(prev => {
    const n = new Set(prev);
    if (on ?? !n.has(id)) n.add(id); else n.delete(id);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });

  const guard = (fn: () => void) => {
    try { setError(null); fn(); }
    catch (e) { setError(e instanceof QuizStorageFullError ? e.message : 'Shranjevanje ni uspelo.'); }
  };

  // Povleci-in-spusti kviz na mapo (podmapo v seznamu ali mapo v poti zgoraj), da ga premakneš vanjo.
  // Ciljna mapa potuje prek data-folder-id (''=koren), ne prek zaprtja, da ostanejo ročniki stabilni.
  const onFolderDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (!dragQuizId.current) return;
    e.preventDefault();
    setDragOverFolder(e.currentTarget.dataset.folderId ?? '');
  };
  const onFolderDragLeave = (e: React.DragEvent<HTMLElement>) => {
    const id = e.currentTarget.dataset.folderId ?? '';
    setDragOverFolder(prev => (prev === id ? null : prev));
  };
  const onFolderDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const folderId = e.currentTarget.dataset.folderId || null; // '' (koren) -> null
    const id = dragQuizId.current;
    dragQuizId.current = null; setDraggingQuiz(null); setDragOverFolder(null);
    if (id) guard(() => lib.updateQuiz(id, { folderId }));
  };
  if (loading || !lib.loaded) return null;

  const sortQuizzes = (list: Quiz[]) => [...list].sort((a, b) => (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt));
  const quizzesIn = (folderId: string | null) => sortQuizzes(lib.quizzes.filter(q => q.folderId === folderId));
  const foldersIn = (parentId: string | null) => lib.folders.filter(f => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, 'sl'));
  const allFolders = flatFolders(lib.folders);
  const countIn = (folderId: string): number => {
    const direct = lib.quizzes.filter(q => q.folderId === folderId).length;
    return direct + lib.folders.filter(f => f.parentId === folderId).reduce((n, f) => n + countIn(f.id), 0);
  };

  const card: React.CSSProperties = { background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', padding: '14px 16px' };

  const renderQuiz = (q: Quiz) => {
    const incomplete = q.questions.filter(x => questionProblems(x).length > 0).length;
                  const maxPoints = q.questions.reduce((s, x) => s + x.points, 0);
                  return (
                    <div key={q.id}
                      draggable
                      onDragStart={e => { dragQuizId.current = q.id; setDraggingQuiz(q.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { dragQuizId.current = null; setDraggingQuiz(null); setDragOverFolder(null); }}
                      title="Povleci na mapo (zgoraj ali v seznamu), da premakneš kviz vanjo"
                      style={{ ...card, display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', cursor: 'grab', opacity: draggingQuiz === q.id ? 0.4 : 1 }}>
                      <Link href={`/kvizi/${q.id}`} draggable={false} style={{ flex: '1 1 200px', minWidth: 0, textDecoration: 'none' }}>
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>{q.title || 'Brez naslova'}</div>
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                          {questionsLabel(q.questions.length)} · {pointsLabel(maxPoints)} · ustvarjen {dateTimeLabel(q.createdAt)}{q.updatedAt - q.createdAt > 60000 && ` · spremenjen ${dateTimeLabel(q.updatedAt)}`}
                          {' · '}
                          {incomplete > 0
                            ? <span style={{ color: '#b7791f' }}>⚠ nedokončano: {incomplete}</span>
                            : <span style={{ color: 'var(--green-ok)' }}>✓ pripravljen</span>}
                        </div>
                      </Link>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', flexShrink: 0 }}>
                        <select value={q.folderId ?? ''} title="Premakni v mapo"
                          onChange={e => guard(() => lib.updateQuiz(q.id, { folderId: e.target.value || null }))}
                          style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--ink)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '5px 4px', background: 'var(--canvas)', width: '112px' }}>
                          <option value="">📁 Vsi kvizi (koren)</option>
                          {allFolders.map(({ f, depth }) => <option key={f.id} value={f.id}>{'  '.repeat(depth)}📁 {f.name}</option>)}
                        </select>
                        <button style={{ ...btn(true), padding: '7px 11px' }} disabled={incomplete > 0} title={incomplete > 0 ? 'Najprej dokončaj vsa vprašanja' : 'Zaženi kot projekcijo z razredom ali natisni'}
                          onClick={() => setStarting(q.id)}>▶ Zaženi / natisni</button>
                        <Link href={`/kvizi/${q.id}`} style={{ ...btn(), padding: '7px 10px', textDecoration: 'none' }}>Uredi</Link>
                        <Link href={`/kvizi/statistika?k=${encodeURIComponent(q.id)}`} style={{ ...btn(), padding: '7px 10px', textDecoration: 'none' }} title="Rezultati izvedb tega kviza">Rezultati</Link>
                        <button style={{ ...btn(), padding: '7px 10px' }} onClick={() => guard(() => lib.duplicateQuiz(q.id))}>Podvoji</button>
                        <button style={{ ...btn(), padding: '7px 10px', color: '#c0392b', borderColor: '#e0b4ae' }}
                          onClick={() => { if (confirm(`Izbrišem kviz »${q.title}«? Izvedbe brez rezultatov se izbrišejo, rezultati izvedb, pri katerih so učenci sodelovali, pa ostanejo v Rezultatih.`)) { guard(() => lib.deleteQuiz(q.id)); void deleteEmptySessionsOfQuiz(q.id).catch(() => { /* statistika ostane, kviz je izbrisan */ }); } }}>Izbriši</button>
                      </div>
                    </div>
                  );
  };

  const renderFolder = (f: QuizFolder, depth: number): React.ReactNode => {
    const isOpen = openFolders.has(f.id);
    const subs = foldersIn(f.id), qs = quizzesIn(f.id);
    return (
      <div key={f.id} style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', background: depth ? 'transparent' : 'var(--canvas)', overflow: 'hidden' }}>
        <div data-folder-id={f.id} onDragOver={onFolderDragOver} onDragLeave={onFolderDragLeave} onDrop={onFolderDrop}
          onClick={() => { if (renaming !== f.id) toggleFolder(f.id); }}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', cursor: 'pointer', fontFamily: 'var(--font-sans)',
            background: dragOverFolder === f.id ? '#e9f2ea' : isOpen ? 'rgba(45,106,49,0.06)' : 'transparent' }}>
          <span style={{ color: 'var(--muted)', fontSize: '13px', width: '12px', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
          <span style={{ color: 'var(--forest)', display: 'flex' }}><FolderIcon /></span>
          {renaming === f.id ? (
            <input autoFocus defaultValue={f.name} onClick={e => e.stopPropagation()}
              onFocus={e => e.currentTarget.select()}
              onBlur={e => { lib.renameFolder(f.id, e.currentTarget.value.trim() || f.name); setRenaming(null); }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }}
              style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-sans)', fontSize: '14px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '4px 6px' }} />
          ) : (
            <span style={{ flex: 1, minWidth: 0, fontSize: '15px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.name} <span style={{ fontWeight: 400, fontSize: '13px', color: 'var(--muted)' }}>· {countIn(f.id)}</span>
            </span>
          )}
          <span onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '2px' }}>
            <button title="Preimenuj" style={smallBtn} onClick={() => setRenaming(f.id)}>✎</button>
            <button title="Izbriši mapo (vsebina gre v nadrejeno mapo)" style={smallBtn}
              onClick={() => { if (confirm(`Izbrišem mapo »${f.name}«? Kvizi in podmape se premaknejo eno raven višje.`)) guard(() => lib.deleteFolder(f.id)); }}>×</button>
          </span>
        </div>
        {isOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 12px 12px 28px', borderTop: '1px solid var(--hairline)' }}>
            {subs.map(sf => renderFolder(sf, depth + 1))}
            {qs.map(q => renderQuiz(q))}
            {!subs.length && !qs.length && <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0, fontFamily: 'var(--font-sans)' }}>Mapa je prazna. Kviz premakneš vanjo s povlekom ali z izbirnikom pri kvizu.</p>}
          </div>
        )}
      </div>
    );
  };

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
            <ActiveSessions />

            {/* pot + orodja */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
              <span style={{ flex: '1 1 auto' }} />
              <button style={btn()} onClick={() => guard(() => { const id = lib.createFolder('Nova mapa', null); setRenaming(id); })}>+ Nova mapa</button>
              <button style={btn(true)} onClick={() => guard(() => { const id = lib.createQuiz(null); router.push(`/kvizi/${id}`); })}>+ Nov kviz</button>
              <Link href="/kvizi/skener" style={{ ...btn(), textDecoration: 'none' }} title="Telefon kot skener natisnjenih kvizov (okvir z odgovori)">📷 Skener</Link>
            </div>

            {error && <p style={{ fontSize: '13px', color: '#c0392b', marginBottom: '12px' }}>{error}</p>}

            {/* drevo: mape (razpri / skrij) s podmapami in kvizi, nato kvizi brez mape */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {foldersIn(null).map(f => renderFolder(f, 0))}
              {foldersIn(null).length > 0 && quizzesIn(null).length > 0 && (
                <div data-folder-id="" onDragOver={onFolderDragOver} onDragLeave={onFolderDragLeave} onDrop={onFolderDrop}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: dragOverFolder === '' ? '#fff' : 'var(--muted)',
                    background: dragOverFolder === '' ? 'var(--forest)' : 'transparent', borderRadius: 'var(--r-sm)', padding: '10px 4px 2px' }}>
                  Brez mape
                </div>
              )}
              {quizzesIn(null).map(q => renderQuiz(q))}
              {!lib.quizzes.length && !lib.folders.length && (
                <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Tu še ni kvizov. Ustvari prvega z gumbom »+ Nov kviz«.</p>
              )}
            </div>
          </>
        )}
      </div>
      {starting && lib.quizzes.find(x => x.id === starting) && (
        <StartSessionDialog quiz={lib.quizzes.find(x => x.id === starting)!} onClose={() => setStarting(null)} />
      )}
    </div>
  );
}
