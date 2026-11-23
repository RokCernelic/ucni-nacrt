'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useQuizLibrary } from '@/hooks/useQuizLibrary';
import type { QuizFolder } from '@/lib/quiz/types';
import { loadAllHistory, joinStatsChannel, isLive, participated, type QuizSession, type SessionStudent, type SessionAnswer } from '@/lib/quiz/sessionApi';
import { scoreAnswers, isScored, answerFraction } from '@/lib/quiz/scoring';
import { SessionResults } from './LiveSession';
import ResultsPrintSheet from './ResultsPrint';
import { createPortal } from 'react-dom';
import { ceilPct, questionsLabel, pointsLabel, dateTimeLabel } from '@/lib/quiz/format';
import { gradeColor } from '@/lib/quiz/format';

type Data = Awaited<ReturnType<typeof loadAllHistory>>;
const keyOf = (s: QuizSession) => s.quiz_id ?? `naslov:${s.quiz_title}`;
const pctColor = gradeColor;

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.3l2 2.2h8.7A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
    </svg>
  );
}

/** Kvizi → Rezultati: vsaka izvedba kviza (seja) posebej; ?k=kviz filtrira, ?s=seja odpre podrobne rezultate. */
export default function QuizStats() {
  const { user, loading } = useAuth();
  const lib = useQuizLibrary();
  const search = useSearchParams();
  const selected = search.get('k');
  const sessionId = search.get('s');
  const [showEmpty, setShowEmpty] = useState(false);
  const [openQuizzes, setOpenQuizzes] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('rezultati-odprti') ?? '[]')); } catch { return new Set(); }
  });
  const toggleQuiz = (k: string) => setOpenQuizzes(prev => {
    const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k);
    try { localStorage.setItem('rezultati-odprti', JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('rezultati-mape-odprte') ?? '[]')); } catch { return new Set(); }
  });
  const toggleFolder = (id: string) => setOpenFolders(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id);
    try { localStorage.setItem('rezultati-mape-odprte', JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  // tisk rezultatov vseh izvedb kviza (vsak razred na svoj list A4); »zakrij imena« velja tudi za tisk ene izvedbe
  const [anon, setAnonState] = useState(() => { try { return localStorage.getItem('rezultati-tisk-zakrij') === '1'; } catch { return false; } });
  const setAnon = (v: boolean) => { setAnonState(v); try { localStorage.setItem('rezultati-tisk-zakrij', v ? '1' : '0'); } catch { /* ignore */ } };
  const [printKey, setPrintKey] = useState<string | null>(null);
  const printAll = (key: string) => {
    setPrintKey(key);
    const root = document.documentElement;
    const done = () => { root.classList.remove('printing-results'); window.removeEventListener('afterprint', done); setPrintKey(null); };
    setTimeout(() => { root.classList.add('printing-results'); window.addEventListener('afterprint', done); window.print(); }, 80);
  };

  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () => loadAllHistory().then(setData).catch(e => setError(e instanceof Error ? e.message : String(e)));
    void load();
    // v živo: skener po vsakem shranjenem listu pošlje ping (več hitrih pingov združimo)
    const ch = joinStatsChannel(user.id, () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void load(), 600); });
    const onFocus = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onFocus);
    // tekoči kvizi na tablicah ne pošiljajo pingov: osveži vsakih 20 s, ko je stran vidna
    const poll = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 20000);
    return () => { ch.close(); if (timer) clearTimeout(timer); clearInterval(poll); document.removeEventListener('visibilitychange', onFocus); };
  }, [user]);

  // vsaka izvedba (seja) je svoj vnos: končane, nezaključene in tekoče
  const rows = useMemo(() => {
    if (!data) return [];
    return [...data.sessions].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(s => {
      const ans = data.answersBySession.get(s.id) ?? [];
      const by = new Map<string, Record<string, string>>();
      for (const a of ans) by.set(a.student_id, { ...(by.get(a.student_id) ?? {}), [a.question_id]: a.value });
      const students = data.studentsBySession.get(s.id) ?? [];
      const part = students.filter(participated);
      const sum = part.reduce((t, st) => t + scoreAnswers(s.quiz, by.get(st.student_id) ?? {}).percent, 0);
      // ime kviza: trenutno ime v knjižnici (preimenovanje se pozna tudi v rezultatih), sicer ime ob izvedbi
      const libQuiz = lib.quizzes.find(q => q.id === s.quiz_id);
      const title = libQuiz?.title || s.quiz_title;
      // točke v kvizu so bile spremenjene, izvedba pa še ni potrdila novega točkovanja
      const scoringChanged = !!libQuiz && s.quiz.questions.some(sq => { const q = libQuiz.questions.find(x => x.id === sq.id); return !!q && isScored(sq) && q.points !== sq.points; });
      return {
        s: title === s.quiz_title ? s : { ...s, quiz_title: title }, key: keyOf(s), people: part.length, total: students.length,
        avg: part.length ? ceilPct(sum / part.length) : null,
        live: isLive(s), open: s.status === 'open',
        deleted: !!s.quiz_id && lib.loaded && !lib.quizzes.some(q => q.id === s.quiz_id),
        nQ: s.paper ? ((s.paper as { items?: unknown[] }).items?.length ?? s.quiz.questions.length) : s.quiz.questions.length,
        maxPts: s.quiz.questions.filter(q => isScored(q) && !s.quiz.excluded?.includes(q.id)).reduce((t, q) => t + q.points, 0),
        quizCreated: libQuiz?.createdAt ?? null,
        scoringChanged,
      };
    });
  }, [data, lib.loaded, lib.quizzes]);

  // izvedbe istega kviza so ugnezdene pod kviz (razpri / skrij); kviz z najnovejšo izvedbo na vrhu
  const groups = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) {
      if (selected && r.key !== selected) continue;
      if (!showEmpty && !r.people && !r.open) continue; // izvedbe brez rezultatov (npr. poskusni tisk) skrite
      m.set(r.key, [...(m.get(r.key) ?? []), r]);
    }
    return [...m.entries()].map(([key, rs]) => {
      const people = rs.reduce((t, r) => t + r.people, 0);
      const sum = rs.reduce((t, r) => t + (r.avg ?? 0) * r.people, 0);
      const quizId = rs[0].s.quiz_id;
      const folderId = (quizId && lib.quizzes.find(q => q.id === quizId)?.folderId) || null;
      return { key, folderId, rows: rs, title: rs[0].s.quiz_title, people, avg: people ? ceilPct(sum / people) : null,
        classes: [...new Set(rs.map(r => r.s.class_name))], live: rs.some(r => r.live), open: rs.some(r => r.open), deleted: rs[0].deleted };
    });
  }, [rows, selected, showEmpty, lib.quizzes]);

  if (loading) return null;
  if (!user) return <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}><p style={{ color: 'var(--muted)' }}>Za rezultate se <Link href="/login" style={{ color: 'var(--forest)' }}>prijavite</Link>.</p></div>;
  if (error) return <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}><p style={{ color: '#c0392b', fontFamily: 'var(--font-sans)' }}>{error}</p></div>;
  if (!data) return <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px', fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>Nalagam …</div>;

  const renderGroup = (g: (typeof groups)[number]) => {
          const isOpen = !!selected || openQuizzes.has(g.key);
          return (
            <div key={g.key} style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', background: 'var(--canvas)', overflow: 'hidden' }}>
              <div onClick={() => !selected && toggleQuiz(g.key)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '12px 16px', cursor: selected ? 'default' : 'pointer', background: isOpen ? 'rgba(45,106,49,0.06)' : 'transparent' }}>
                <span style={{ color: 'var(--muted)', fontSize: '14px', width: '12px', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>
                    {g.title}{g.deleted && <span style={{ fontSize: '11px', fontWeight: 500, color: '#b7791f', marginLeft: '8px' }}>izbrisan kviz</span>}
                    {g.live ? <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green-ok)', marginLeft: '8px' }}>● v teku</span>
                      : g.open ? <span style={{ fontSize: '11px', fontWeight: 600, color: '#b7791f', marginLeft: '8px' }}>nezaključeno</span>
                      : <span style={{ fontSize: '11px', fontWeight: 700, color: '#c0392b', marginLeft: '8px' }}>● zaključeno</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                    {g.rows.length} {g.rows.length === 1 ? 'izvedba' : g.rows.length === 2 ? 'izvedbi' : g.rows.length < 5 ? 'izvedbe' : 'izvedb'} · {g.classes.join(', ')} · nazadnje {dateTimeLabel(g.rows[0].s.created_at)}
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{g.people} rezultatov</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: pctColor(g.avg), minWidth: '64px', textAlign: 'right' }}>{g.avg === null ? '—' : `${g.avg} %`}</div>
              </div>
              {isOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 12px 12px 34px', borderTop: '1px solid var(--hairline)' }}>
                  {g.rows.some(r => r.people > 0) && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                      <label title="Na izpisu namesto imena in priimka okrajšave (npr. Janez Lojze Novak → JL. No.)"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} /> zakrij imena
                      </label>
                      <button onClick={() => printAll(g.key)} title="Natisne rezultate vseh izvedb tega kviza: vsak razred na svoj list A4"
                        style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: 'var(--forest)', background: '#fff', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '6px 12px', cursor: 'pointer' }}>
                        🖨 Natisni vse izvedbe
                      </button>
                    </div>
                  )}
                  {printKey === g.key && typeof document !== 'undefined' && createPortal(
                    <div className="print-results">
                      {[...g.rows].filter(r => r.people > 0).sort((a, b) => a.s.class_name.localeCompare(b.s.class_name, 'sl') || a.s.created_at.localeCompare(b.s.created_at)).map(r => {
                        const libQ = lib.quizzes.find(q => q.id === r.s.quiz_id);
                        const questions = r.s.quiz.questions.map(q => (q.prompt || !libQ ? q : { ...q, prompt: libQ.questions.find(x => x.id === q.id)?.prompt ?? '' }));
                        const by = new Map<string, Record<string, string>>();
                        for (const a of data.answersBySession.get(r.s.id) ?? []) by.set(a.student_id, { ...(by.get(a.student_id) ?? {}), [a.question_id]: a.value });
                        return <ResultsPrintSheet key={r.s.id} session={r.s} students={data.studentsBySession.get(r.s.id) ?? []} answersByStudent={by}
                          questions={questions} excluded={r.s.quiz.excluded ?? []} title={g.title} anon={anon} />;
                      })}
                    </div>,
                    document.body,
                  )}
                  {g.rows.map(r => (
              <Link key={r.s.id} href={`/kvizi/statistika?${selected ? `k=${encodeURIComponent(selected)}&` : ''}s=${r.s.id}`} style={card}>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
                    {r.s.class_name} · {dateTimeLabel(r.s.created_at)}
                    {r.live ? <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green-ok)', marginLeft: '8px' }}>● v teku</span>
                      : r.open ? <span style={{ fontSize: '11px', fontWeight: 600, color: '#b7791f', marginLeft: '8px' }}>nezaključeno</span>
                      : <span style={{ fontSize: '11px', fontWeight: 700, color: '#c0392b', marginLeft: '8px' }}>● zaključeno</span>}
                    {r.scoringChanged && <span style={{ fontSize: '11px', fontWeight: 600, color: '#b7791f', marginLeft: '8px' }} title="Točke v kvizu so bile spremenjene — odpri izvedbo in potrdi novo točkovanje">⚠ novo točkovanje ni potrjeno</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px' }}>
                    {r.s.paper ? '🖨 natisnjeno' : r.s.mode === 'teacher' ? 'v živo · projekcija' : 'v živo · tablica'}
                    {r.s.ended_at && ` · končana ${dateTimeLabel(r.s.ended_at)}`}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '1px' }}>
                    {questionsLabel(r.nQ)} · {pointsLabel(r.maxPts)} (samodejno točkovano){r.quizCreated && ` · kviz ustvarjen ${dateTimeLabel(r.quizCreated)}`}
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{r.people} / {r.total} učencev</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: pctColor(r.avg), minWidth: '64px', textAlign: 'right' }}>{r.avg === null ? '—' : `${r.avg} %`}</div>
              </Link>
            
                  ))}
                </div>
              )}
            </div>
          );
  };

  // rezultati so razvrščeni v iste mape kot kvizi (Kvizi → mape); izbrisani kvizi so brez mape
  const folderIds = new Set(lib.folders.map(f => f.id));
  const groupsIn = (folderId: string | null) => groups.filter(g => (g.folderId && folderIds.has(g.folderId) ? g.folderId : null) === folderId);
  /** ali je mapa `id` enaka `ancestor` ali leži v njej */
  const inFolder = (id: string, ancestor: string): boolean => {
    for (let cur: string | null = id, guard = 0; cur && guard < 50; guard++) {
      if (cur === ancestor) return true;
      cur = lib.folders.find(f => f.id === cur)?.parentId ?? null;
    }
    return false;
  };
  const countIn = (folderId: string) => groups.filter(g => g.folderId && folderIds.has(g.folderId) && inFolder(g.folderId, folderId)).length;
  const foldersIn = (parentId: string | null) => lib.folders.filter(f => f.parentId === parentId && countIn(f.id) > 0).sort((a, b) => a.name.localeCompare(b.name, 'sl'));
  const renderFolder = (f: QuizFolder, depth: number): React.ReactNode => {
    const isOpen = openFolders.has(f.id);
    return (
      <div key={f.id} style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', background: depth ? 'transparent' : 'var(--canvas)', overflow: 'hidden' }}>
        <div onClick={() => toggleFolder(f.id)}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', cursor: 'pointer', background: isOpen ? 'rgba(45,106,49,0.06)' : 'transparent' }}>
          <span style={{ color: 'var(--muted)', fontSize: '13px', width: '12px', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
          <span style={{ color: 'var(--forest)', display: 'flex' }}><FolderIcon /></span>
          <span style={{ flex: 1, minWidth: 0, fontSize: '15px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {f.name} <span style={{ fontWeight: 400, fontSize: '13px', color: 'var(--muted)' }}>· {countIn(f.id)}</span>
          </span>
        </div>
        {isOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 12px 12px 28px', borderTop: '1px solid var(--hairline)' }}>
            {foldersIn(f.id).map(sf => renderFolder(sf, depth + 1))}
            {groupsIn(f.id).map(renderGroup)}
          </div>
        )}
      </div>
    );
  };

  const listHref = selected ? `/kvizi/statistika?k=${encodeURIComponent(selected)}` : '/kvizi/statistika';
  const shown = selected ? rows.filter(r => r.key === selected) : rows;

  // ena izvedba: podrobni rezultati (iz seznama ali z gumba »Rezultati«, če ima kviz samo eno izvedbo)
  const one = sessionId ? rows.find(r => r.s.id === sessionId) : selected && shown.length === 1 ? shown[0] : null;
  if (one) {
    const s = one.s;
    const students: SessionStudent[] = data.studentsBySession.get(s.id) ?? [];
    const answers: SessionAnswer[] = data.answersBySession.get(s.id) ?? [];
    const status = one.live ? 'v teku' : one.open ? 'nezaključeno' : 'končano';
    // povprečje po nalogah čez vse izvedbe istega kviza (npr. v več razredih): delež pravilnih med vsemi sodelujočimi
    const same = rows.filter(r => r.key === one.key && r.people > 0);
    const okBy = new Map<string, { ok: number; n: number }>();
    let allPeople = 0;
    for (const r of same) {
      const part = (data.studentsBySession.get(r.s.id) ?? []).filter(participated);
      allPeople += part.length;
      const by = new Map<string, Record<string, string>>();
      for (const a of data.answersBySession.get(r.s.id) ?? []) by.set(a.student_id, { ...(by.get(a.student_id) ?? {}), [a.question_id]: a.value });
      for (const q of r.s.quiz.questions) {
        if (!isScored(q) || r.s.quiz.excluded?.includes(q.id)) continue;
        const c = okBy.get(q.id) ?? { ok: 0, n: 0 };
        for (const st of part) { c.n++; c.ok += answerFraction(q, by.get(st.student_id)?.[q.id]); }
        okBy.set(q.id, c);
      }
    }
    const overall = same.length > 1 ? {
      perQuestion: new Map([...okBy].map(([id, c]) => [id, c.n ? ceilPct((c.ok / c.n) * 100) : null])),
      sessions: same.length, classes: new Set(same.map(r => r.s.class_name)).size, people: allPeople,
    } : undefined;
    return (
      <SessionResults session={s} students={students} answers={answers} teacher={null} teacherAnswers={[]} overall={overall}
        back={sessionId && shown.length > 1 ? { href: listHref, label: '← Izvedbe tega kviza' } : { href: '/kvizi/statistika', label: '← Rezultati' }}
        subtitle={`${s.class_name} · ${s.paper ? 'natisnjeno' : 'v živo'} · izvedba ${dateTimeLabel(s.created_at)} · ${status} · ${questionsLabel(one.nQ)} · ${pointsLabel(one.maxPts)}${one.quizCreated ? ` · kviz ustvarjen ${dateTimeLabel(one.quizCreated)}` : ''}`}
        note={one.deleted ? 'Kviz je izbrisan — rezultati so ohranjeni.' : undefined} />
    );
  }

  const card: React.CSSProperties = { background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', padding: '14px 16px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' };
  return (
    <div>
      <div style={{ background: 'var(--forest)', padding: '28px 32px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {selected && <Link href="/kvizi/statistika" style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>← Vsi rezultati</Link>}
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 300, color: '#fff', lineHeight: 1, margin: selected ? '8px 0 0' : 0 }}>
            {selected && shown[0] ? shown[0].s.quiz_title : 'Rezultati'}
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: '10px 0 0' }}>
            {selected ? 'Vse izvedbe tega kviza.' : 'Vsaka izvedba kviza (v živo in natisnjena) posebej. Rezultati ostanejo, tudi če kviz izbrišeš.'}
          </p>
        </div>
      </div>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 32px 64px', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(() => {
          const empty = rows.filter(r => (!selected || r.key === selected) && !r.people && !r.open).length;
          return empty > 0 && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer', marginBottom: '4px' }}>
              <input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} />
              pokaži tudi izvedbe brez rezultatov ({empty}) — npr. poskusni tiski, ki niso bili skenirani
            </label>
          );
        })()}
        {groups.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '14px' }}>{selected ? 'Ta kviz še ni bil rešen.' : 'Noben kviz še ni bil rešen.'}</p>}
        {selected || !lib.folders.some(f => groups.some(g => g.folderId && inFolder(g.folderId, f.id)))
          ? groups.map(renderGroup)
          : (
            <>
              {foldersIn(null).map(f => renderFolder(f, 0))}
              {groupsIn(null).length > 0 && <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', margin: '10px 0 0 4px' }}>Brez mape</div>}
              {groupsIn(null).map(renderGroup)}
            </>
          )}
      </div>
    </div>
  );
}
