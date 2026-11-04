'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useQuizLibrary } from '@/hooks/useQuizLibrary';
import { loadAllHistory, joinStatsChannel, isLive, participated, type QuizSession, type SessionStudent, type SessionAnswer } from '@/lib/quiz/sessionApi';
import { scoreAnswers } from '@/lib/quiz/scoring';
import { SessionResults } from './LiveSession';
import { ceilPct } from '@/lib/quiz/format';
import { gradeColor } from '@/lib/quiz/format';

type Data = Awaited<ReturnType<typeof loadAllHistory>>;
const keyOf = (s: QuizSession) => s.quiz_id ?? `naslov:${s.quiz_title}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('sl-SI', { day: 'numeric', month: 'short', year: 'numeric' });
const pctColor = gradeColor;

/** Kvizi → Statistika: vse odigrane seje po kvizih (ostanejo tudi, ko kviz izbrišeš). */
export default function QuizStats() {
  const { user, loading } = useAuth();
  const lib = useQuizLibrary();
  const search = useSearchParams();
  const selected = search.get('k');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () => loadAllHistory().then(setData).catch(e => setError(e instanceof Error ? e.message : String(e)));
    void load();
    // v živo: skener po vsakem shranjenem listu pošlje ping (več hitrih pingov združimo)
    const ch = joinStatsChannel(user.id, () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void load(), 600); });
    const onFocus = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => { ch.close(); if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', onFocus); };
  }, [user]);

  const groups = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, QuizSession[]>();
    for (const s of data.sessions.filter(x => !isLive(x))) m.set(keyOf(s), [...(m.get(keyOf(s)) ?? []), s]);
    return [...m.entries()].map(([key, sessions]) => {
      let sum = 0, n = 0, people = 0;
      for (const s of sessions) {
        const ans = data.answersBySession.get(s.id) ?? [];
        const by = new Map<string, Record<string, string>>();
        for (const a of ans) by.set(a.student_id, { ...(by.get(a.student_id) ?? {}), [a.question_id]: a.value });
        for (const st of (data.studentsBySession.get(s.id) ?? []).filter(participated)) {
          sum += scoreAnswers(s.quiz, by.get(st.student_id) ?? {}).percent; n++; people++;
        }
      }
      return {
        key, title: sessions[0].quiz_title, sessions, people,
        avg: n ? ceilPct(sum / n) : null,
        classes: [...new Set(sessions.map(s => s.class_name))],
        last: sessions[0].created_at,
        deleted: !!sessions[0].quiz_id && lib.loaded && !lib.quizzes.some(q => q.id === sessions[0].quiz_id),
      };
    }).sort((a, b) => b.last.localeCompare(a.last));
  }, [data, lib.loaded, lib.quizzes]);

  if (loading) return null;
  if (!user) return <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}><p style={{ color: 'var(--muted)' }}>Za statistiko se <Link href="/login" style={{ color: 'var(--forest)' }}>prijavite</Link>.</p></div>;
  if (error) return <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}><p style={{ color: '#c0392b', fontFamily: 'var(--font-sans)' }}>{error}</p></div>;
  if (!data) return <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px', fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>Nalagam …</div>;

  const group = selected ? groups.find(g => g.key === selected) : null;
  if (group) {
    // en kviz = ena stran rezultatov: za vsakega učenca zadnji rezultat (iz najnovejše seje, v kateri je sodeloval)
    const sessions = [...group.sessions].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const latest = sessions[0];
    const seen = new Set<string>();
    const students: SessionStudent[] = [];
    const answers: SessionAnswer[] = [];
    for (const s of sessions) {
      for (const st of data.studentsBySession.get(s.id) ?? []) {
        if (seen.has(st.student_id) || !participated(st)) continue;
        seen.add(st.student_id);
        students.push(st);
        answers.push(...(data.answersBySession.get(s.id) ?? []).filter(a => a.student_id === st.student_id));
      }
    }
    // učenci, ki še niso sodelovali, iz najnovejše seje
    for (const st of data.studentsBySession.get(latest.id) ?? []) if (!seen.has(st.student_id)) students.push(st);
    const classes = [...new Set(sessions.map(s => s.class_name))].join(', ');
    const n = sessions.length;
    return (
      <SessionResults session={latest} students={students} answers={answers} teacher={null} teacherAnswers={[]}
        back={{ href: '/kvizi/statistika', label: '← Statistika' }}
        subtitle={`${classes}${n > 1 ? ` · zadnji rezultat vsakega učenca (${n} izvedb)` : ''}`}
        note={group.deleted ? 'Kviz je izbrisan — rezultati so ohranjeni.' : undefined} />
    );
  }

  const card: React.CSSProperties = { background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', padding: '14px 16px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' };
  return (
    <div>
      <div style={{ background: 'var(--forest)', padding: '28px 32px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 300, color: '#fff', lineHeight: 1, margin: 0 }}>Statistika</h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: '10px 0 0' }}>Vsi rešeni kvizi (v živo in natisnjeni). Rezultati ostanejo, tudi če kviz izbrišeš.</p>
        </div>
      </div>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 32px 64px', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {groups.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Noben kviz še ni bil rešen.</p>}
        {groups.map(g => (
          <Link key={g.key} href={`/kvizi/statistika?k=${encodeURIComponent(g.key)}`} style={card}>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>
                {g.title}{g.deleted && <span style={{ fontSize: '11px', fontWeight: 500, color: '#b7791f', marginLeft: '8px' }}>izbrisan kviz</span>}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px' }}>
                {g.classes.join(', ')} · {g.sessions.length} {g.sessions.length === 1 ? 'seja' : g.sessions.length === 2 ? 'seji' : g.sessions.length < 5 ? 'seje' : 'sej'} · nazadnje {fmtDate(g.last)}
              </div>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{g.people} rezultatov</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: pctColor(g.avg), minWidth: '64px', textAlign: 'right' }}>{g.avg === null ? '—' : `${g.avg} %`}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
