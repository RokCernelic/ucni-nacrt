'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { loadStudentHistory, type StudentHistoryEntry } from '@/lib/quiz/sessionApi';
import { scoreAnswers } from '@/lib/quiz/scoring';
import { formatNumber } from '@/lib/quiz/format';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('sl-SI', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Čist prikaz (brez omrežja) — ločeno, da ga je mogoče preizkusiti neodvisno od Supabase/prijave. */
export function StudentHistoryBody({ studentName, entries, error, onClose }: {
  studentName: string; entries: StudentHistoryEntry[] | null; error: string | null; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const avg = entries && entries.length
    ? Math.round(entries.reduce((sum, e) => sum + scoreAnswers(e.session.quiz, Object.fromEntries(e.answers.map(a => [a.question_id, a.value]))).percent, 0) / entries.length)
    : null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(20,30,25,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={`Zgodovina — ${studentName}`}
        style={{ width: '100%', maxWidth: '560px', background: 'var(--canvas)', borderRadius: 'var(--r-lg)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '4px' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '26px', fontWeight: 400, color: 'var(--ink)', lineHeight: 1.1, flex: 1 }}>{studentName}</h2>
          <button onClick={onClose} aria-label="Zapri" style={{ background: 'none', border: 'none', fontSize: '22px', color: 'var(--muted)', cursor: 'pointer' }}>×</button>
        </div>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', margin: '0 0 16px' }}>
          Zgodovina kvizov {avg !== null && `· povprečje ${avg} %`}
        </p>

        {error && <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: '#c0392b' }}>{error}</p>}
        {!entries && !error && <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--muted)' }}>Nalagam …</p>}
        {entries && entries.length === 0 && <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--muted)' }}>Ta učenec še ni sodeloval v nobenem kvizu.</p>}

        {entries && entries.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {entries.map(e => {
              const answersMap = Object.fromEntries(e.answers.map(a => [a.question_id, a.value]));
              const sc = scoreAnswers(e.session.quiz, answersMap);
              return (
                <Link key={e.session.id} href={`/kvizi/seja/${e.session.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--hairline)', textDecoration: 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.session.quiz_title}</div>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{fmtDate(e.session.created_at)}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {formatNumber(sc.points)}/{formatNumber(sc.maxPoints)}
                  </div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: '16px', fontWeight: 700, minWidth: '52px', textAlign: 'right',
                    color: sc.percent >= 70 ? 'var(--green-ok)' : sc.percent >= 40 ? '#b7791f' : '#c0392b' }}>
                    {formatNumber(sc.percent)} %
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Zgodovina enega učenca skozi kvize (znotraj njegovega razreda), skozi vse leto. */
export default function StudentHistoryDialog({ studentId, studentName, onClose }: { studentId: string; studentName: string; onClose: () => void }) {
  const [entries, setEntries] = useState<StudentHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStudentHistory(studentId).then(setEntries).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [studentId]);

  return <StudentHistoryBody studentName={studentName} entries={entries} error={error} onClose={onClose} />;
}
