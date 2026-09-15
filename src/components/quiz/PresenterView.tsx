'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { loadSession, joinChannel, isLive, type QuizSession, type SessionStudent, type SessionAnswer } from '@/lib/quiz/sessionApi';
import { parseNumber } from '@/lib/quiz/scoring';
import { formatNumber } from '@/lib/quiz/format';
import { JoinPanel, QuestionView } from './LiveSession';

/** Čisti prikaz (brez podatkov/omrežja) — ločeno, da ga je mogoče preizkusiti neodvisno od Supabase/prijave. */
export function PresenterBody({ session, students, answers, isFs, onToggleFs }: {
  session: QuizSession; students: SessionStudent[]; answers: SessionAnswer[]; isFs: boolean; onToggleFs: () => void;
}) {
  const questions = session.quiz.questions;
  const q = questions[session.current_index];
  const joined = students.filter(s => s.device_id);

  const currentAnswers = useMemo(() => (q ? answers.filter(a => a.question_id === q.id) : []), [answers, q]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of currentAnswers) {
      const n = q?.kind === 'numeric' ? parseNumber(a.value) : null;
      const key = n !== null ? formatNumber(n) : a.value;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [currentAnswers, q]);

  const cornerBtn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff',
    borderRadius: 'var(--r-sm)', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)',
  };

  const live = isLive(session);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface, #f4f2ee)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--forest)', padding: '20px 28px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 auto' }}>
          <JoinPanel code={session.code} compact={false} />
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--font-sans)', color: '#fff' }}>
          <div style={{ fontSize: '40px', fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{joined.length}<span style={{ opacity: 0.5, fontSize: '0.6em' }}> / {students.length}</span></div>
          <div style={{ fontSize: '12px', opacity: 0.6, margin: '4px 0 8px' }}>povezanih · {session.class_name}</div>
          <button onClick={onToggleFs} style={cornerBtn}>{isFs ? '✕ Okno' : '⤢ Cel zaslon'}</button>
        </div>
      </div>

      <div style={{ flex: 1, maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '28px' }}>
        {!live ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: '32px', fontWeight: 300, color: 'var(--muted)' }}>Kviz je končan.<br />Rezultate si oglej na svojem zaslonu.</p>
          </div>
        ) : session.mode === 'teacher' && q ? (
          <div style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-lg)', padding: '28px 32px' }}>
            <QuestionView q={q} index={session.current_index} total={questions.length} revealed={session.phase === 'revealed'} counts={counts} answeredCount={currentAnswers.length} />
            {session.phase === 'collecting' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', marginTop: '24px' }}>
                {students.map(s => {
                  const answered = currentAnswers.some(a => a.student_id === s.student_id);
                  const connected = !!s.device_id;
                  return (
                    <div key={s.student_id} style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 500, padding: '10px 12px', borderRadius: 'var(--r-sm)', textAlign: 'center',
                      background: answered ? 'var(--forest)' : 'var(--canvas)', color: answered ? '#fff' : connected ? 'var(--ink)' : 'var(--muted)',
                      border: `1px ${connected ? 'solid' : 'dashed'} ${answered ? 'var(--forest)' : 'var(--hairline)'}` }}>
                      {s.name}{answered ? ' ✓' : ''}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : session.mode === 'student' ? (
          <>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '32px', fontWeight: 300, color: 'var(--ink)', marginBottom: '18px' }}>{session.quiz_title}</h1>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '10px' }}>
              {students.map(s => {
                const n = new Set(answers.filter(a => a.student_id === s.student_id).map(a => a.question_id)).size;
                const done = !!s.submitted_at;
                return (
                  <div key={s.student_id} style={{ fontFamily: 'var(--font-sans)', padding: '12px 14px', borderRadius: 'var(--r-sm)', background: done ? 'var(--forest)' : 'var(--canvas)', color: done ? '#fff' : s.device_id ? 'var(--ink)' : 'var(--muted)', border: `1px ${s.device_id ? 'solid' : 'dashed'} ${done ? 'var(--forest)' : 'var(--hairline)'}` }}>
                    <div style={{ fontSize: '15px', fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: '12px', opacity: 0.75, marginTop: '4px' }}>{!s.device_id ? 'ni povezan' : done ? 'oddano ✓' : `${n} / ${questions.length} odgovorjenih`}</div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Ločeno okno za projektor/drug zaslon — samo javni prikaz (koda/QR, trenutno
 * vprašanje, kdo je odgovoril), brez gumbov za upravljanje in brez zasebnih
 * rezultatov. Namenjeno "razširjenemu" drugemu zaslonu, medtem ko učitelj
 * upravlja sejo iz svojega (glej /kvizi/seja/[id]).
 */
export default function PresenterView({ sessionId }: { sessionId: string }) {
  const { user, loading } = useAuth();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [students, setStudents] = useState<SessionStudent[]>([]);
  const [answers, setAnswers] = useState<SessionAnswer[]>([]);
  const [isFs, setIsFs] = useState(false);
  const channel = useRef<ReturnType<typeof joinChannel> | null>(null);

  const refetch = useCallback(async () => {
    try {
      const d = await loadSession(sessionId);
      setSession(d.session); setStudents(d.students); setAnswers(d.answers);
    } catch { /* tiho — naslednji poskus čez interval */ }
  }, [sessionId]);

  useEffect(() => { if (user) void refetch(); }, [user, refetch]);

  const code = session?.code;
  useEffect(() => {
    if (!code) return;
    const ch = joinChannel(code, () => void refetch());
    channel.current = ch;
    const t = setInterval(() => { if (!document.hidden) void refetch(); }, 3000);
    return () => { clearInterval(t); ch.close(); channel.current = null; };
  }, [code, refetch]);

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  if (loading || !user) return null; // isto zasebno okno kot glavno — če ni prijave, ni česa prikazati
  if (!session) return <div style={{ minHeight: '100vh', background: 'var(--forest)' }} />;

  return <PresenterBody session={session} students={students} answers={answers} isFs={isFs} onToggleFs={toggleFs} />;
}
