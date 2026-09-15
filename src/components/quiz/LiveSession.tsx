'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useAuth } from '@/hooks/useAuth';
import {
  loadSession, updateSession, resolveDevice, joinChannel, isLive,
  type QuizSession, type SessionStudent, type SessionAnswer,
} from '@/lib/quiz/sessionApi';
import { isCorrect, answerStatus, scoreAnswers, parseNumber } from '@/lib/quiz/scoring';
import { formatNumber, pointsLabel, studentsLabel } from '@/lib/quiz/format';
import { sessionResultsCsv, downloadCsv, safeFilename } from '@/lib/quiz/csv';
import type { Question } from '@/lib/quiz/types';

const LETTERS = 'ABCDEF';

const btn = (kind: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties => ({
  fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 600, borderRadius: 'var(--r-sm)', padding: '10px 18px', cursor: 'pointer', whiteSpace: 'nowrap',
  ...(kind === 'primary' ? { background: 'var(--forest)', color: '#fff', border: 'none' }
    : kind === 'danger' ? { background: 'transparent', color: '#c0392b', border: '1px solid #e0b4ae' }
    : { background: 'transparent', color: 'var(--forest)', border: '1px solid var(--hairline)' }),
});

export function JoinPanel({ code, compact }: { code: string; compact: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/k/${code}` : '';
  const host = typeof window !== 'undefined' ? `${window.location.host}/k` : '';
  useEffect(() => { if (url) QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(null)); }, [url]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '14px' : '28px', flexWrap: 'wrap' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img src={qr} alt="QR koda za pridružitev" style={{ width: compact ? '96px' : '220px', height: compact ? '96px' : '220px', background: '#fff', borderRadius: '8px', padding: '6px' }} />}
      <div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: compact ? '12px' : '15px', color: 'rgba(255,255,255,0.7)' }}>
          Skeniraj QR ali odpri <b style={{ color: '#fff' }}>{host}</b> in vpiši kodo
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: compact ? '34px' : '72px', fontWeight: 700, letterSpacing: '0.12em', color: '#fff', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{code}</div>
      </div>
    </div>
  );
}

export function QuestionView({ q, index, total, revealed, counts, answeredCount }: {
  q: Question; index: number; total: number; revealed: boolean; counts: Map<string, number>; answeredCount: number;
}) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '10px' }}>
        Vprašanje {index + 1} / {total} · {pointsLabel(q.points)}
      </div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(22px, 2.6vw, 34px)', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, whiteSpace: 'pre-wrap' }}>{q.prompt}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {q.image && <img src={q.image} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: '38vh', marginTop: '16px', borderRadius: 'var(--r-md)', border: '1px solid var(--hairline)' }} />}

      {q.kind === 'mc' ? (
        <div style={{ display: 'grid', gridTemplateColumns: q.options.length > 3 ? '1fr 1fr' : '1fr', gap: '10px', marginTop: '20px' }}>
          {q.options.map((o, i) => {
            const right = revealed && o.id === q.correct;
            const n = counts.get(o.id) ?? 0;
            const pct = answeredCount ? Math.round((n / answeredCount) * 100) : 0;
            return (
              <div key={o.id} style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-md)', border: `2px solid ${right ? 'var(--green-ok)' : 'var(--hairline)'}`, background: 'var(--canvas)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                {revealed && <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: right ? 'rgba(60,140,80,0.18)' : 'rgba(0,0,0,0.05)', transition: 'width .5s' }} />}
                <span style={{ position: 'relative', width: '38px', height: '38px', flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '17px', background: right ? 'var(--green-ok)' : 'var(--forest)', color: '#fff' }}>{right ? '✓' : LETTERS[i]}</span>
                <span style={{ position: 'relative', flex: 1, fontFamily: 'var(--font-sans)', fontSize: 'clamp(17px, 1.8vw, 24px)', color: 'var(--ink)' }}>{o.text}</span>
                {revealed && <span style={{ position: 'relative', fontFamily: 'var(--font-sans)', fontSize: '18px', fontWeight: 700, color: right ? 'var(--green-ok)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{n} · {pct} %</span>}
              </div>
            );
          })}
        </div>
      ) : revealed ? (
        <div style={{ marginTop: '20px', fontFamily: 'var(--font-sans)' }}>
          <div style={{ fontSize: '22px', color: 'var(--ink)' }}>
            Pravilno: <b style={{ color: 'var(--green-ok)' }}>{formatNumber(parseNumber(q.correct) ?? 0)}</b>
            {q.tolerance > 0 && <span style={{ color: 'var(--muted)', fontSize: '17px' }}> (± {formatNumber(q.tolerance)})</span>}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
            {[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v, n]) => {
              const ok = isCorrect(q, v);
              return (
                <span key={v} style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', fontSize: '17px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', border: `1.5px solid ${ok ? 'var(--green-ok)' : 'var(--hairline)'}`, color: ok ? 'var(--green-ok)' : 'var(--ink)' }}>
                  {v} <span style={{ opacity: 0.6 }}>× {n}</span>
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <p style={{ marginTop: '20px', fontFamily: 'var(--font-sans)', fontSize: '18px', color: 'var(--muted)' }}>Učenci vpišejo številski odgovor.</p>
      )}
    </div>
  );
}

/** Statistika enega vprašanja: % pravilno + porazdelitev odgovorov. */
function QuestionStats({ q, index, answers, totalStudents }: { q: Question; index: number; answers: SessionAnswer[]; totalStudents: number }) {
  const relevant = answers.filter(a => a.question_id === q.id);
  const answeredCount = relevant.length;
  const correctCount = relevant.filter(a => isCorrect(q, a.value)).length;
  const pct = answeredCount ? Math.round((correctCount / answeredCount) * 100) : 0;
  const pctColor = answeredCount === 0 ? 'var(--muted)' : pct >= 70 ? 'var(--green-ok)' : pct >= 40 ? '#b7791f' : '#c0392b';

  const counts = new Map<string, number>();
  for (const a of relevant) {
    const key = q.kind === 'numeric' ? formatNumber(parseNumber(a.value) ?? NaN).replace('NaN', a.value) : a.value;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', padding: '16px 18px', background: 'var(--canvas)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '10px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>{index + 1}. {q.prompt || '(brez besedila)'}</div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: pctColor, whiteSpace: 'nowrap' }}>
          {answeredCount ? `${pct} % pravilno` : 'brez odgovorov'}
        </div>
      </div>

      {q.kind === 'mc' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {q.options.map((o, oi) => {
            const n = counts.get(o.id) ?? 0;
            const barPct = answeredCount ? (n / answeredCount) * 100 : 0;
            const right = o.id === q.correct;
            return (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '18px', fontSize: '12px', fontWeight: 700, color: right ? 'var(--green-ok)' : 'var(--muted)' }}>{LETTERS[oi]}</span>
                <div style={{ flex: 1, position: 'relative', height: '22px', background: '#00000010', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${barPct}%`, background: right ? 'rgba(60,140,80,0.35)' : 'rgba(0,0,0,0.14)', transition: 'width .3s' }} />
                  <span style={{ position: 'relative', display: 'block', fontSize: '12px', color: 'var(--ink)', padding: '0 8px', lineHeight: '22px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.text || '(prazna možnost)'}</span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--muted)', minWidth: '52px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{n} · {Math.round(barPct)} %</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => {
            const ok = isCorrect(q, v);
            return (
              <span key={v} style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', border: `1.5px solid ${ok ? 'var(--green-ok)' : 'var(--hairline)'}`, color: ok ? 'var(--green-ok)' : 'var(--ink)' }}>
                {v} <span style={{ opacity: 0.6, fontWeight: 400 }}>× {n}</span>
              </span>
            );
          })}
          {answeredCount === 0 && <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Nihče ni odgovoril.</span>}
        </div>
      )}
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '10px' }}>{answeredCount} / {totalStudents} odgovorilo</div>
    </div>
  );
}

/** Podrobna stran rezultatov: tabela učencev, statistika po vprašanjih, mreža učenec × vprašanje, CSV. */
function SessionResults({ session, students, answers }: { session: QuizSession; students: SessionStudent[]; answers: SessionAnswer[] }) {
  const [sortBy, setSortBy] = useState<'name' | 'points'>('name');
  const questions = session.quiz.questions;
  const joinedCount = students.filter(s => s.device_id).length;

  const answersByStudent = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    for (const a of answers) {
      const rec = m.get(a.student_id) ?? {};
      rec[a.question_id] = a.value;
      m.set(a.student_id, rec);
    }
    return m;
  }, [answers]);

  const rows = useMemo(() => {
    const withScore = students.map(s => ({ s, ans: answersByStudent.get(s.student_id) ?? {}, sc: scoreAnswers(session.quiz, answersByStudent.get(s.student_id) ?? {}) }));
    return withScore.sort((a, b) => sortBy === 'points' ? b.sc.points - a.sc.points || a.s.name.localeCompare(b.s.name, 'sl') : a.s.name.localeCompare(b.s.name, 'sl'));
  }, [students, answersByStudent, session.quiz, sortBy]);

  const avgPct = rows.length ? Math.round(rows.reduce((s, r) => s + r.sc.percent, 0) / rows.length) : 0;

  const exportCsv = () => {
    const csv = sessionResultsCsv(session.quiz, students.map(s => ({ name: s.name, participated: !!s.device_id, answers: answersByStudent.get(s.student_id) ?? {} })));
    const date = new Date(session.ended_at ?? session.created_at).toISOString().slice(0, 10);
    downloadCsv(`${safeFilename(session.quiz_title, session.class_name, date)}.csv`, csv);
  };

  const sortBtn = (active: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: active ? 700 : 500,
    color: active ? 'var(--forest)' : 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px',
  });

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px', fontFamily: 'var(--font-sans)' }}>
      <Link href="/kvizi" style={{ fontSize: '13px', color: 'var(--forest)', textDecoration: 'none' }}>← Kvizi</Link>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginTop: '10px' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '36px', fontWeight: 300, margin: '0 0 4px', color: 'var(--ink)' }}>{session.quiz_title}</h1>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            {session.class_name} · seja končana · {studentsLabel(joinedCount)} sodelovalo od {students.length} · povprečje {avgPct} %
          </p>
        </div>
        <button onClick={exportCsv} style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 16px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          ⬇ Izvozi CSV
        </button>
      </div>

      {/* tabela učencev */}
      <div style={{ marginTop: '28px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <th style={{ padding: '8px 6px' }}><button style={sortBtn(sortBy === 'name')} onClick={() => setSortBy('name')}>Učenec</button></th>
            <th style={{ padding: '8px 6px' }}><button style={sortBtn(sortBy === 'points')} onClick={() => setSortBy('points')}>Točke</button></th>
            <th style={{ padding: '8px 6px' }}>%</th>
            <th style={{ padding: '8px 6px' }}>Pravilno / narobe / brez</th>
          </tr></thead>
          <tbody>{rows.map(({ s, sc }) => (
            <tr key={s.student_id} style={{ borderTop: '1px solid var(--hairline)', color: s.device_id ? 'var(--ink)' : 'var(--muted)' }}>
              <td style={{ padding: '8px 6px' }}>{s.name}{!s.device_id && ' (ni sodeloval)'}</td>
              <td style={{ padding: '8px 6px', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(sc.points)} / {formatNumber(sc.maxPoints)}</td>
              <td style={{ padding: '8px 6px', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(sc.percent)} %</td>
              <td style={{ padding: '8px 6px', fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: 'var(--green-ok)' }}>{sc.correct}</span> / <span style={{ color: '#c0392b' }}>{sc.wrong}</span> / <span>{sc.unanswered}</span>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* mreža učenec × vprašanje */}
      {questions.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 10px' }}>Učenec × vprašanje</h2>
          <div style={{ overflowX: 'auto', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '13px', minWidth: '100%' }}>
              <thead><tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--canvas)', padding: '7px 12px', textAlign: 'left', borderBottom: '1px solid var(--hairline)', whiteSpace: 'nowrap' }}>Učenec</th>
                {questions.map((q, i) => <th key={q.id} title={q.prompt} style={{ padding: '7px 6px', borderBottom: '1px solid var(--hairline)', minWidth: '32px', color: 'var(--muted)', fontWeight: 600 }}>{i + 1}</th>)}
              </tr></thead>
              <tbody>{rows.map(({ s, ans }) => (
                <tr key={s.student_id}>
                  <td style={{ position: 'sticky', left: 0, background: '#fff', padding: '6px 12px', borderBottom: '1px solid var(--hairline)', whiteSpace: 'nowrap', color: s.device_id ? 'var(--ink)' : 'var(--muted)' }}>{s.name}</td>
                  {questions.map(q => {
                    const st = answerStatus(q, ans[q.id]);
                    const sym = st === 'correct' ? '✓' : st === 'wrong' ? '✗' : '–';
                    const color = st === 'correct' ? 'var(--green-ok)' : st === 'wrong' ? '#c0392b' : 'var(--hairline)';
                    const label = q.kind === 'mc' ? q.options.find(o => o.id === ans[q.id])?.text : ans[q.id];
                    return <td key={q.id} title={label ?? ''} style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid var(--hairline)', color, fontWeight: 700 }}>{sym}</td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* statistika po vprašanjih */}
      {questions.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 10px' }}>Vprašanja</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {questions.map((q, i) => <QuestionStats key={q.id} q={q} index={i} answers={answers} totalStudents={students.length} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LiveSession({ sessionId }: { sessionId: string }) {
  const { user, loading } = useAuth();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [students, setStudents] = useState<SessionStudent[]>([]);
  const [answers, setAnswers] = useState<SessionAnswer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showJoin, setShowJoin] = useState(true);
  const channel = useRef<ReturnType<typeof joinChannel> | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    try {
      const d = await loadSession(sessionId);
      setSession(d.session); setStudents(d.students); setAnswers(d.answers); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sessionId]);

  const refetchSoon = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => { void refetch(); }, 250);
  }, [refetch]);

  useEffect(() => { if (user) void refetch(); }, [user, refetch]);

  // obvestila v živo + rezervno osveževanje
  const code = session?.code;
  useEffect(() => {
    if (!code) return;
    const ch = joinChannel(code, () => refetchSoon());
    channel.current = ch;
    const t = setInterval(() => { if (!document.hidden) void refetch(); }, 4000);
    return () => { clearInterval(t); ch.close(); channel.current = null; };
  }, [code, refetch, refetchSoon]);

  const act = async (patch: Parameters<typeof updateSession>[1]) => {
    if (!session) return;
    setBusy(true);
    try {
      await updateSession(session.id, patch);
      setSession({ ...session, ...patch } as QuizSession);
      channel.current?.send('state');
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const questions = session?.quiz.questions ?? [];
  const q = session ? questions[session.current_index] : undefined;
  const joined = students.filter(s => s.device_id);
  const pending = students.filter(s => s.pending_device);

  const answersByStudent = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    for (const a of answers) {
      const rec = m.get(a.student_id) ?? {};
      rec[a.question_id] = a.value;
      m.set(a.student_id, rec);
    }
    return m;
  }, [answers]);

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

  const isLast = !!session && session.current_index >= questions.length - 1;

  /** Preslednica/gumb: zbiranje → zaklep → razkritje → naslednje vprašanje. */
  const step = () => {
    if (!session || !q) return;
    if (session.phase === 'collecting') void act({ phase: 'locked' });
    else if (session.phase === 'locked') void act({ phase: 'revealed' });
    else if (!isLast) void act({ current_index: session.current_index + 1, phase: 'collecting' });
  };

  // tipkovnica: preslednica = naslednji korak, ← → = vprašanja
  useEffect(() => {
    if (!session || session.mode !== 'teacher' || !isLive(session)) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || busy) return;
      if (e.key === ' ') { e.preventDefault(); step(); }
      else if (e.key === 'ArrowRight' && session.current_index < questions.length - 1) void act({ current_index: session.current_index + 1, phase: 'collecting' });
      else if (e.key === 'ArrowLeft' && session.current_index > 0) void act({ current_index: session.current_index - 1, phase: 'collecting' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loading) return null;
  if (!user) return <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}><p style={{ color: 'var(--muted)' }}>Za vodenje kviza se <Link href="/login" style={{ color: 'var(--forest)' }}>prijavite</Link>.</p></div>;
  if (!session) return <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px', fontFamily: 'var(--font-sans)', color: error ? '#c0392b' : 'var(--muted)' }}>{error ?? 'Nalagam sejo …'}</div>;

  const live = isLive(session);
  const endSession = () => {
    if (confirm('Končam sejo? Učenci ne bodo mogli več odgovarjati.')) void act({ status: 'ended', ended_at: new Date().toISOString() });
  };

  // ── konec seje: podrobni rezultati ──
  if (!live) {
    return <SessionResults session={session} students={students} answers={answers} />;
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)', background: 'var(--surface, #f4f2ee)' }}>
      {/* glava s kodo */}
      <div style={{ background: 'var(--forest)', padding: showJoin ? '24px 32px' : '12px 32px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 auto' }}>
            <JoinPanel code={session.code} compact={!showJoin} />
          </div>
          <div style={{ textAlign: 'right', fontFamily: 'var(--font-sans)', color: '#fff' }}>
            <div style={{ fontSize: showJoin ? '44px' : '26px', fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{joined.length}<span style={{ opacity: 0.5, fontSize: '0.6em' }}> / {students.length}</span></div>
            <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '4px' }}>povezanih · {session.class_name}</div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowJoin(v => !v)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 'var(--r-sm)', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>
                {showJoin ? 'Skrči kodo' : 'Pokaži kodo'}
              </button>
              <button
                onClick={() => window.open(`/kvizi/seja/${session.id}/predavatelj`, 'predavatelj', 'noopener,noreferrer')}
                title="Odpri ločeno okno za projektor/drug zaslon (brez upravljanja)"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 'var(--r-sm)', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>
                ⤢ Okno predavatelja
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 32px 48px' }}>
        {/* menjave naprav — le ime, brez rezultatov */}
        {pending.map(s => (
          <div key={s.student_id} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', background: '#fff8e6', border: '1px solid #ecd9a8', borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: '12px', fontFamily: 'var(--font-sans)' }}>
            <span style={{ flex: 1, fontSize: '15px', color: 'var(--ink)' }}><b>{s.name}</b> se želi povezati z drugo napravo.</span>
            <button style={btn('primary')} onClick={async () => { await resolveDevice(session.id, s.student_id, true, s.pending_device!); channel.current?.send('state'); void refetch(); }}>Dovoli</button>
            <button style={btn()} onClick={async () => { await resolveDevice(session.id, s.student_id, false, s.pending_device!); void refetch(); }}>Zavrni</button>
          </div>
        ))}
        {error && <p style={{ color: '#c0392b', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>{error}</p>}

        {session.mode === 'teacher' && q ? (
          <>
            <div style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-lg)', padding: '24px 28px' }}>
              <QuestionView q={q} index={session.current_index} total={questions.length}
                revealed={session.phase === 'revealed'} counts={counts} answeredCount={currentAnswers.length} />
            </div>

            {/* upravljanje */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '18px 0' }}>
              <button style={btn()} disabled={busy || session.current_index === 0}
                onClick={() => act({ current_index: session.current_index - 1, phase: 'collecting' })}>‹ Prejšnje</button>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', minWidth: '140px' }}>
                Odgovorilo: <b>{currentAnswers.length}</b> / {joined.length}
              </span>
              <span style={{ flex: 1 }} />
              {session.phase === 'collecting' && <button style={btn('primary')} disabled={busy} onClick={() => act({ phase: 'locked' })}>🔒 Zakleni odgovore</button>}
              {session.phase === 'locked' && <button style={btn('primary')} disabled={busy} onClick={() => act({ phase: 'revealed' })}>👁 Razkrij</button>}
              {session.phase !== 'collecting' && !isLast && <button style={btn(session.phase === 'revealed' ? 'primary' : 'ghost')} disabled={busy} onClick={() => act({ current_index: session.current_index + 1, phase: 'collecting' })}>Naslednje ›</button>}
              {session.phase === 'revealed' && isLast && <button style={btn('primary')} disabled={busy} onClick={endSession}>Končaj kviz</button>}
              <button style={btn('danger')} disabled={busy} onClick={endSession}>Končaj sejo</button>
            </div>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', margin: '-6px 0 18px' }}>Preslednica: zakleni → razkrij → naprej · ← → menjava vprašanja</p>

            {/* kdo je odgovoril (brez pravilnosti) */}
            {session.phase === 'collecting' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
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
          </>
        ) : session.mode === 'student' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', fontFamily: 'var(--font-sans)' }}>
              <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '30px', fontWeight: 300, color: 'var(--ink)', flex: 1 }}>{session.quiz_title}</h1>
              <span style={{ fontSize: '15px', color: 'var(--ink)' }}>Oddalo: <b>{students.filter(s => s.submitted_at).length}</b> / {joined.length}</span>
              <button style={btn('danger')} disabled={busy} onClick={endSession}>Končaj sejo</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '8px' }}>
              {students.map(s => {
                const n = Object.keys(answersByStudent.get(s.student_id) ?? {}).length;
                const done = !!s.submitted_at;
                return (
                  <div key={s.student_id} style={{ fontFamily: 'var(--font-sans)', padding: '10px 12px', borderRadius: 'var(--r-sm)', background: done ? 'var(--forest)' : 'var(--canvas)', color: done ? '#fff' : s.device_id ? 'var(--ink)' : 'var(--muted)', border: `1px ${s.device_id ? 'solid' : 'dashed'} ${done ? 'var(--forest)' : 'var(--hairline)'}` }}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: '12px', opacity: 0.75, marginTop: '4px' }}>
                      {!s.device_id ? 'ni povezan' : done ? 'oddano ✓' : `${n} / ${questions.length} odgovorjenih`}
                    </div>
                    {s.device_id && <div style={{ height: '4px', background: done ? 'rgba(255,255,255,0.3)' : 'var(--hairline)', borderRadius: '2px', marginTop: '6px' }}><div style={{ height: '100%', width: `${questions.length ? (n / questions.length) * 100 : 0}%`, background: done ? '#fff' : 'var(--forest)', borderRadius: '2px' }} /></div>}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>Kviz nima vprašanj.</p>
        )}
      </div>
    </div>
  );
}
