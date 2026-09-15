'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useQuizLibrary } from '@/hooks/useQuizLibrary';
import { loadQuizHistory, isLive, type QuizSession } from '@/lib/quiz/sessionApi';
import { scoreAnswers } from '@/lib/quiz/scoring';
import { studentsLabel } from '@/lib/quiz/format';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('sl-SI', { day: 'numeric', month: 'short', year: 'numeric' });
}

type HistoryData = Awaited<ReturnType<typeof loadQuizHistory>>;

/** Čist prikaz (brez omrežja) — ločeno, da ga je mogoče preizkusiti neodvisno od Supabase/prijave. */
export function QuizHistoryBody({ quizTitle, data }: { quizTitle: string; data: HistoryData }) {
  const avgPercentFor = (sessionId: string) => {
    const s = data.studentsBySession.get(sessionId) ?? [];
    const a = data.answersBySession.get(sessionId) ?? [];
    const byStudent = new Map<string, Record<string, string>>();
    for (const x of a) byStudent.set(x.student_id, { ...(byStudent.get(x.student_id) ?? {}), [x.question_id]: x.value });
    const joined = s.filter(x => x.device_id);
    if (!joined.length) return null;
    const session = data.sessions.find(x => x.id === sessionId)!;
    const pct = joined.reduce((sum, st) => sum + scoreAnswers(session.quiz, byStudent.get(st.student_id) ?? {}).percent, 0) / joined.length;
    return Math.round(pct);
  };

  // združi po razredu
  const byClass = new Map<string, { className: string; sessions: QuizSession[] }>();
  for (const s of data.sessions) {
    const g = byClass.get(s.class_id) ?? { className: s.class_name, sessions: [] };
    g.sessions.push(s);
    byClass.set(s.class_id, g);
  }
  const classRows = [...byClass.entries()].map(([classId, g]) => {
    const pcts = g.sessions.map(s => avgPercentFor(s.id)).filter((x): x is number => x !== null);
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    const last = g.sessions.reduce((max, s) => s.created_at > max ? s.created_at : max, g.sessions[0]?.created_at ?? '');
    return { classId, className: g.className, count: g.sessions.length, avg, last };
  }).sort((a, b) => b.last.localeCompare(a.last));

  const card: React.CSSProperties = { background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', padding: '16px 18px' };

  return (
    <div>
      <div style={{ background: 'var(--forest)', padding: '28px 32px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <Link href="/kvizi" style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>← Kvizi</Link>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '10px 0 6px' }}>Zgodovina kviza</p>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 300, color: '#fff', lineHeight: 1 }}>{quizTitle}</h1>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '28px 32px 64px', fontFamily: 'var(--font-sans)' }}>
        {data.sessions.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Ta kviz še ni bil zagnan v nobenem razredu.</p>
        ) : (
          <>
            {/* primerjava med razredi */}
            <h2 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 10px' }}>Primerjava med razredi</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginBottom: '32px' }}>
              {classRows.map(c => (
                <div key={c.classId} style={card}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{c.className}</div>
                  <div style={{ fontSize: '30px', fontWeight: 700, color: c.avg === null ? 'var(--muted)' : c.avg >= 70 ? 'var(--green-ok)' : c.avg >= 40 ? '#b7791f' : '#c0392b', marginTop: '6px' }}>
                    {c.avg === null ? '—' : `${c.avg} %`}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                    {c.count} {c.count === 1 ? 'seja' : c.count < 5 ? 'seje' : 'sej'} · nazadnje {fmtDate(c.last)}
                  </div>
                </div>
              ))}
            </div>

            {/* seznam sej */}
            <h2 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 10px' }}>Vse seje</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {data.sessions.map(s => {
                const students = data.studentsBySession.get(s.id) ?? [];
                const joined = students.filter(x => x.device_id).length;
                const pct = avgPercentFor(s.id);
                const live = isLive(s);
                return (
                  <Link key={s.id} href={`/kvizi/seja/${s.id}`} style={{ ...card, display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', textDecoration: 'none' }}>
                    <div style={{ flex: '1 1 160px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
                        {fmtDate(s.created_at)}
                        {live && <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 700, color: 'var(--green-ok)' }}>● V TEKU</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                        {s.class_name} · {s.mode === 'teacher' ? 'vodi učitelj' : 'vsak sam'}
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{studentsLabel(joined)} sodelovalo</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: pct === null ? 'var(--muted)' : pct >= 70 ? 'var(--green-ok)' : pct >= 40 ? '#b7791f' : '#c0392b', minWidth: '56px', textAlign: 'right' }}>
                      {pct === null ? '—' : `${pct} %`}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function QuizHistory({ quizId }: { quizId: string }) {
  const { user, loading } = useAuth();
  const lib = useQuizLibrary();
  const [data, setData] = useState<HistoryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadQuizHistory(quizId).then(setData).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [user, quizId]);

  const quiz = lib.quizzes.find(q => q.id === quizId);

  if (loading || !lib.loaded) return null;
  if (!user) return <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}><p style={{ color: 'var(--muted)' }}>Za zgodovino se <Link href="/login" style={{ color: 'var(--forest)' }}>prijavite</Link>.</p></div>;
  if (error) return <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}><p style={{ color: '#c0392b', fontFamily: 'var(--font-sans)' }}>{error}</p></div>;
  if (!data) return null;

  return <QuizHistoryBody quizTitle={quiz?.title ?? '—'} data={data} />;
}
