'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMasterClasses } from '@/hooks/useMasterClasses';
import { useRoster } from '@/hooks/useRoster';
import { useQuizLibrary } from '@/hooks/useQuizLibrary';
import { questionProblems } from '@/lib/quiz/scoring';
import { startSession, type SessionMode } from '@/lib/quiz/sessionApi';
import { studentsLabel, hasNotVerb } from '@/lib/quiz/format';
import type { Quiz } from '@/lib/quiz/types';

const LAST_CLASS = 'kvizi-zadnji-razred'; // sessionStorage

export default function StartSessionDialog({ quiz, onClose }: { quiz: Quiz; onClose: () => void }) {
  const router = useRouter();
  const { classes } = useMasterClasses();
  const { updateQuiz } = useQuizLibrary();
  const [classId, setClassId] = useState<string>('');
  const [mode, setMode] = useState<SessionMode>('teacher');
  const [shuffle, setShuffle] = useState(true);
  const [showSolutions, setShowSolutions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { students, save } = useRoster(classId || undefined);

  useEffect(() => {
    if (classId || !classes.length) return;
    let last: string | null = null;
    try { last = sessionStorage.getItem(LAST_CLASS); } catch { /* ignore */ }
    setClassId(classes.some(c => c.id === last) ? last! : classes[0].id);
  }, [classes, classId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cls = classes.find(c => c.id === classId);
  const incomplete = quiz.questions.filter(q => questionProblems(q).length > 0).length;
  const missingPins = students.filter(s => !s.pin).length;
  const canStart = !!cls && students.length > 0 && missingPins === 0 && incomplete === 0 && quiz.questions.length > 0 && !busy;

  const start = async () => {
    if (!cls || !canStart) return;
    setBusy(true); setError(null);
    try {
      const session = await startSession({
        quiz,
        classId: cls.id,
        className: [cls.name, cls.school].filter(Boolean).join(' · '),
        students: students.map(s => ({ id: s.id, name: s.name, pin: s.pin! })),
        mode, shuffle, showSolutions,
      });
      try { sessionStorage.setItem(LAST_CLASS, cls.id); } catch { /* ignore */ }
      try { updateQuiz(quiz.id, { lastUsedAt: Date.now() }); } catch { /* ne ustavi zagona */ }
      router.push(`/kvizi/seja/${session.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/relation .* does not exist|schema cache|Could not find the table/i.test(msg)
        ? 'Baza za kvize še ni nameščena (tabele v Supabase). Glej docs/KVIZI.md.'
        : `Seje ni bilo mogoče začeti: ${msg}`);
      setBusy(false);
    }
  };

  const label: React.CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '8px' };
  const choice = (active: boolean): React.CSSProperties => ({
    flex: '1 1 200px', textAlign: 'left', cursor: 'pointer', borderRadius: 'var(--r-md)', padding: '12px 14px',
    border: `1.5px solid ${active ? 'var(--forest)' : 'var(--hairline)'}`, background: active ? 'rgba(45,80,60,0.06)' : 'var(--canvas)',
    fontFamily: 'var(--font-sans)', color: 'var(--ink)',
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(20,30,25,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Zaženi kviz"
        style={{ width: '100%', maxWidth: '560px', background: 'var(--canvas)', borderRadius: 'var(--r-lg)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '18px' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 400, color: 'var(--ink)', lineHeight: 1.1, flex: 1 }}>Zaženi kviz</h2>
          <button onClick={onClose} aria-label="Zapri" style={{ background: 'none', border: 'none', fontSize: '22px', color: 'var(--muted)', cursor: 'pointer' }}>×</button>
        </div>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--ink)', fontWeight: 600, margin: '0 0 18px' }}>{quiz.title || 'Brez naslova'}</p>

        {/* razred */}
        <div style={label}>Razred</div>
        {classes.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--muted)', margin: '0 0 16px' }}>Najprej ustvari razred v Nastavitve → Razredi in učenci.</p>
        ) : (
          <select value={classId} onChange={e => setClassId(e.target.value)}
            style={{ width: '100%', fontFamily: 'var(--font-sans)', fontSize: '14px', padding: '9px 10px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', background: 'var(--canvas)', color: 'var(--ink)', marginBottom: '6px' }}>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.school ? ` · ${c.school}` : ''}</option>)}
          </select>
        )}
        {cls && (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: missingPins || !students.length ? '#b7791f' : 'var(--muted)', margin: '0 0 18px' }}>
            {!students.length ? 'Ta razred nima učencev.'
              : missingPins ? (<>{studentsLabel(missingPins)} {hasNotVerb(missingPins)} PIN-a. <button onClick={() => save(students)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--forest)', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}>Dodeli PIN-e</button></>)
              : `${studentsLabel(students.length)} s PIN-i`}
          </p>
        )}

        {/* način */}
        <div style={label}>Način</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
          <button style={choice(mode === 'teacher')} onClick={() => setMode('teacher')}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Vodim jaz</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px', lineHeight: 1.4 }}>Vsi na istem vprašanju. Ti zakleneš, razkriješ in greš naprej.</div>
          </button>
          <button style={choice(mode === 'student')} onClick={() => setMode('student')}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Vsak sam</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px', lineHeight: 1.4 }}>Vsak rešuje v svojem tempu in na koncu odda.</div>
          </button>
        </div>

        {/* nastavitve */}
        <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)', marginBottom: '10px', cursor: 'pointer' }}>
          <input type="checkbox" checked={shuffle} onChange={e => setShuffle(e.target.checked)} style={{ marginTop: '3px' }} />
          <span>Premešaj vrstni red
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)' }}>
              {mode === 'teacher' ? 'Možnosti so na vsakem iPadu premešane, dokler ne zakleneš; potem povsod izvirni vrstni red.' : 'Vprašanja in možnosti so za vsakega učenca premešani.'}
            </span>
          </span>
        </label>
        <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)', marginBottom: '18px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showSolutions} onChange={e => setShowSolutions(e.target.checked)} style={{ marginTop: '3px' }} />
          <span>Pokaži rešitve na koncu
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)' }}>Po koncu seje učenci vidijo pregled po vprašanjih s pravilnimi odgovori. Izklopi, če bo kviz reševal še drug razred.</span>
          </span>
        </label>

        {incomplete > 0 && <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: '#b7791f', margin: '0 0 12px' }}>⚠ Kviz ima nedokončana vprašanja ({incomplete}) — dokončaj jih v urejevalniku.</p>}
        {error && <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: '#c0392b', margin: '0 0 12px' }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', padding: '9px 16px', borderRadius: 'var(--r-sm)', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--ink)', cursor: 'pointer' }}>Prekliči</button>
          <button onClick={start} disabled={!canStart}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, padding: '9px 18px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--forest)', color: '#fff', cursor: canStart ? 'pointer' : 'not-allowed', opacity: canStart ? 1 : 0.5 }}>
            {busy ? 'Zaganjam …' : '▶ Začni sejo'}
          </button>
        </div>
      </div>
    </div>
  );
}
