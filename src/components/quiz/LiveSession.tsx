'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useAuth } from '@/hooks/useAuth';
import { useQuizLibrary } from '@/hooks/useQuizLibrary';
import {
  loadSession, updateSession, deleteSession, resetStudentResult, snapshotSession, restoreSessionSnapshot, syncSessionScoring, resolveDevice, joinChannel, isLive, participated, setManualPoints, setQuestionExcluded, setQuestionCorrect, sameTask, applyCorrectFix, TEACHER_NAME,
  type QuizSession, type SessionStudent, type SessionAnswer,
} from '@/lib/quiz/sessionApi';
import { offerPersistentUndo } from '@/lib/undoStore';
import { setTaskCorrect } from '@/lib/tasks/api';
import { isCorrect, answerStatus, scoreAnswers, parseNumber, numericValue, choiceIds, isScored, answerFraction, manualPoints } from '@/lib/quiz/scoring';
import { formatNumber, pointsLabel, studentsLabel } from '@/lib/quiz/format';
import { sessionResultsCsv, downloadCsv, safeFilename } from '@/lib/quiz/csv';
import type { Question } from '@/lib/quiz/types';
import { createPortal } from 'react-dom';
import ResultsPrintSheet from './ResultsPrint';
import { readResultsSort, saveResultsSort, nextResultsSort, compareResults, type ResultsSort } from '@/lib/quiz/resultsSort';
import { layoutSheet, sheetSeed, shuffleOpts } from '@/lib/quiz/printSheet';
import type { PaperInfo } from '@/lib/quiz/paperSession';
import { ceilPct } from '@/lib/quiz/format';
import { gradeColor } from '@/lib/quiz/format';
import OptText from '@/components/OptText';

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
            const pct = answeredCount ? ceilPct((n / answeredCount) * 100) : 0;
            return (
              <div key={o.id} style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-md)', border: `2px solid ${right ? 'var(--green-ok)' : 'var(--hairline)'}`, background: 'var(--canvas)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                {revealed && <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: right ? 'rgba(60,140,80,0.18)' : 'rgba(0,0,0,0.05)', transition: 'width .5s' }} />}
                <span style={{ position: 'relative', width: '38px', height: '38px', flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '17px', background: right ? 'var(--green-ok)' : 'var(--forest)', color: '#fff' }}>{right ? '✓' : LETTERS[i]}</span>
                <span style={{ position: 'relative', flex: 1, fontFamily: 'var(--font-sans)', fontSize: 'clamp(17px, 1.8vw, 24px)', color: 'var(--ink)' }}><OptText text={o.text} /></span>
                {revealed && <span style={{ position: 'relative', fontFamily: 'var(--font-sans)', fontSize: '18px', fontWeight: 700, color: right ? 'var(--green-ok)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{n} · {pct} %</span>}
              </div>
            );
          })}
        </div>
      ) : revealed && q.kind === 'numeric' ? (
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
function QuestionStats({ q: q0, index, answers, totalStudents, excluded, onToggleExcluded, onFixCorrect }: { q: Question; index: number; answers: SessionAnswer[]; totalStudents: number; excluded?: boolean; onToggleExcluded?: () => void;
  /** popravek pravilnega odgovora (napaka v ključu); točke učencev se preračunajo */
  onFixCorrect?: (fix: { correct: string; tolerance?: number }) => Promise<void> }) {
  // urejanje pravilnega odgovora: osnutek se takoj pozna v statistiki, shrani se s »Shrani«
  const [fix, setFix] = useState<{ correct: string; tolerance: string } | null>(null);
  const [savingFix, setSavingFix] = useState(false);
  const q: Question = !fix ? q0 : q0.kind === 'mc' ? { ...q0, correct: fix.correct || null }
    : q0.kind === 'numeric' ? { ...q0, correct: fix.correct, tolerance: parseNumber(fix.tolerance) ?? 0 } : q0;
  const startFix = () => setFix({ correct: q0.kind === 'mc' ? q0.correct ?? '' : q0.kind === 'numeric' ? q0.correct : '', tolerance: q0.kind === 'numeric' ? formatNumber(q0.tolerance) : '0' });
  const pickOption = (oid: string) => setFix(f => {
    if (!f || q0.kind !== 'mc') return f;
    if (!q0.multi) return { ...f, correct: oid };
    const ids = new Set(choiceIds(f.correct));
    if (ids.has(oid)) ids.delete(oid); else ids.add(oid);
    return { ...f, correct: [...ids].sort().join(',') };
  });
  const saveFix = async () => {
    if (!fix || !onFixCorrect) return;
    if (q0.kind === 'mc' && !fix.correct) { alert('Izberi pravilni odgovor.'); return; }
    if (q0.kind === 'numeric' && (parseNumber(fix.correct) === null || parseNumber(fix.tolerance) === null || parseNumber(fix.tolerance)! < 0)) { alert('Vpiši pravilno vrednost in odstopanje (število, 0 ali več).'); return; }
    setSavingFix(true);
    try { await onFixCorrect(q0.kind === 'numeric' ? { correct: fix.correct.trim(), tolerance: parseNumber(fix.tolerance)! } : { correct: fix.correct }); }
    catch (e) { alert(`Popravka ni bilo mogoče shraniti: ${e instanceof Error ? e.message : String(e)}`); setSavingFix(false); }
  };
  const relevant = answers.filter(a => a.question_id === q.id);
  const answeredCount = relevant.length;
  const correctCount = relevant.filter(a => isCorrect(q, a.value)).length;
  const pct = answeredCount ? ceilPct((correctCount / answeredCount) * 100) : 0;
  const pctColor = answeredCount === 0 ? 'var(--muted)' : gradeColor(pct);

  const counts = new Map<string, number>();
  for (const a of relevant) {
    // pri vprašanjih z več pravilnimi šteje vsaka izbrana možnost posebej
    const keys = q.kind === 'mc' && q.multi ? choiceIds(a.value) : [q.kind === 'numeric' ? formatNumber(numericValue(q, a.value) ?? NaN).replace('NaN', a.value) : a.value];
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (
    <div style={{ border: `1px solid ${excluded ? '#d8d4cb' : 'var(--hairline)'}`, borderRadius: 'var(--r-md)', padding: '16px 18px', background: excluded ? '#f4f2ee' : 'var(--canvas)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '10px', opacity: excluded ? 0.6 : 1 }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>{index + 1}. {q.prompt || '(brez besedila)'}</div>
        {excluded && <span style={{ fontSize: '12px', fontWeight: 700, color: '#8a5a00', background: '#fdf6e3', border: '1px solid #ecd9a8', borderRadius: '999px', padding: '2px 10px', whiteSpace: 'nowrap' }}>izvzeto iz točkovanja</span>}
        <div style={{ fontSize: '15px', fontWeight: 700, color: pctColor, whiteSpace: 'nowrap' }}>
          {q.kind === 'open' && q.manual ? (answeredCount ? `povprečno ${formatNumber(Math.round((relevant.reduce((t, a) => t + (manualPoints(q, a.value) ?? 0), 0) / answeredCount) * 10) / 10)} / ${formatNumber(q.points)} točk` : 'točke še niso vpisane')
            : q.kind === 'open' ? 'ročni pregled' : answeredCount ? `${pct} % pravilno` : 'brez odgovorov'}
        </div>
      </div>

      {q.kind === 'mc' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {q.options.map((o, oi) => {
            const n = counts.get(o.id) ?? 0;
            const barPct = answeredCount ? (n / answeredCount) * 100 : 0;
            const right = q.multi ? choiceIds(q.correct).includes(o.id) : o.id === q.correct;
            return (
              <div key={o.id} onClick={fix ? () => pickOption(o.id) : undefined} title={fix ? (q.multi ? 'Klikni za označitev / odznačitev pravilne možnosti' : 'Klikni, da je to pravilni odgovor') : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: fix ? 'pointer' : undefined, ...(fix ? { outline: right ? '2px solid var(--green-ok)' : '1px dashed var(--hairline)', outlineOffset: '2px', borderRadius: '4px' } : {}) }}>
                <span style={{ width: '18px', fontSize: '12px', fontWeight: 700, color: right ? 'var(--green-ok)' : 'var(--muted)' }}>{fix ? (right ? (q.multi ? '☑' : '◉') : (q.multi ? '☐' : '○')) : LETTERS[oi]}</span>
                <div style={{ flex: 1, position: 'relative', height: '22px', background: '#00000010', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${barPct}%`, background: right ? 'rgba(60,140,80,0.35)' : 'rgba(0,0,0,0.14)', transition: 'width .3s' }} />
                  <span style={{ position: 'relative', display: 'block', fontSize: '12px', color: 'var(--ink)', padding: '0 8px', lineHeight: '22px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.text ? <OptText text={o.text} /> : '(prazna možnost)'}</span>
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
      {fix && (
        <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: 'var(--r-sm)', background: '#fdf6e3', border: '1px solid #ecd9a8', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
          {q0.kind === 'mc' ? (
            <span>{q0.multi ? 'Klikni možnosti, ki so pravilne.' : 'Klikni pravilno možnost.'} Odstotek zgoraj že kaže izid z novim ključem.</span>
          ) : (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label>Pravilno: <input value={fix.correct} onChange={e => setFix({ ...fix, correct: e.target.value })} inputMode="decimal" autoFocus
                style={{ width: '90px', padding: '4px 6px', border: '1px solid var(--hairline)', borderRadius: '6px', fontSize: '14px' }} /></label>
              {q0.kind === 'numeric' && q0.unit && <span>{q0.unit}</span>}
              <label>± <input value={fix.tolerance} onChange={e => setFix({ ...fix, tolerance: e.target.value })} inputMode="decimal"
                style={{ width: '60px', padding: '4px 6px', border: '1px solid var(--hairline)', borderRadius: '6px', fontSize: '14px' }} /></label>
            </div>
          )}
          <span style={{ color: '#8a5a00' }}>Popravek velja povsod, kjer je bila ta naloga uporabljena: v nalogi v bazi nalog, v kvizih v knjižnici in v vseh izvedbah (vsi razredi) — točke in odstotki učencev se preračunajo.</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => void saveFix()} disabled={savingFix} style={{ ...btn('primary'), padding: '6px 14px', fontSize: '13px', opacity: savingFix ? 0.6 : 1 }}>{savingFix ? '… shranjujem' : 'Shrani in preračunaj'}</button>
            <button onClick={() => setFix(null)} disabled={savingFix} style={{ ...btn(), padding: '6px 12px', fontSize: '13px' }}>Prekliči</button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted)', flex: 1 }}>{answeredCount} / {totalStudents} odgovorilo</span>
        {onFixCorrect && !fix && (q0.kind === 'mc' || q0.kind === 'numeric') && (
          <button onClick={startFix} title="Popravi pravilni odgovor (npr. napaka v ključu); točke učencev se preračunajo"
            style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--r-sm)', cursor: 'pointer', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)' }}>
            ✎ Popravi pravilni odgovor
          </button>
        )}
        {onToggleExcluded && (
          <button onClick={onToggleExcluded}
            title={excluded ? 'Naloga spet šteje v točke in odstotke' : 'Naloga ne šteje v točke in odstotke (npr. snov ni bila obravnavana); odgovori ostanejo shranjeni'}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
              border: `1px solid ${excluded ? 'var(--forest)' : 'var(--hairline)'}`, background: 'transparent', color: excluded ? 'var(--forest)' : 'var(--muted)' }}>
            {excluded ? '↺ Vključi v točkovanje' : '⊘ Izvzemi iz točkovanja'}
          </button>
        )}
      </div>
    </div>
  );
}

const pctColor = gradeColor;

/** Velika kljukica / križec v mreži rezultatov (dobro vidno tudi na projekciji). */
function Mark({ q, value, top, right }: { q: Question; value: string | undefined; top?: boolean; /** pri napačnem odgovoru: pravilni odgovor (črka ali vrednost) namesto križca */ right?: string }) {
  const st = answerStatus(q, value);
  const sym = st === 'correct' ? '✓' : st === 'wrong' ? (right ?? '✗') : '–';
  const color = st === 'correct' ? 'var(--green-ok)' : st === 'wrong' ? '#c0392b' : 'var(--hairline)';
  const label = q.kind === 'mc' ? (q.multi ? choiceIds(value).map(id => q.options.find(o => o.id === id)?.text).filter(Boolean).join(' · ') : q.options.find(o => o.id === value)?.text) : value;
  return (
    <td title={`${label ?? ''}${st === 'wrong' && right ? ` — pravilno: ${right}` : ''}`} style={{ textAlign: 'center', padding: '4px 8px', [top ? 'borderTop' : 'borderBottom']: top ? '2px solid var(--hairline)' : '1px solid var(--hairline)', color, fontWeight: 800, fontSize: sym.length > 2 ? '15px' : '24px', lineHeight: 1 }}>{sym}</td>
  );
}

/** Celica z ročno vpisanimi točkami (natisnjen kviz, naloge, ki jih skener ne prebere): vpis + Enter ali klik drugam. */
function ManualCell({ q, value, onSave }: { q: Question; value: string | undefined; onSave: (raw: string) => void }) {
  const p = manualPoints(q, value);
  const color = p === null ? 'var(--muted)' : p >= q.points - 1e-9 ? 'var(--green-ok)' : p > 0 ? '#b7791f' : '#c0392b';
  return (
    <td style={{ textAlign: 'center', padding: '3px 4px', borderBottom: '1px solid var(--hairline)', background: '#fbfaf6' }}>
      <input defaultValue={value ? formatNumber(Number(value)) : ''} inputMode="decimal" placeholder={`/${formatNumber(q.points)}`}
        title={`Točke za to nalogo (0–${formatNumber(q.points)}); prazno = še ni pregledano`}
        onBlur={e => { if (e.target.value.trim() !== (value ? formatNumber(Number(value)) : '')) onSave(e.target.value.replace(',', '.')); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ width: '40px', textAlign: 'center', fontSize: '15px', fontWeight: 700, color, border: '1px solid var(--hairline)', borderRadius: '6px', padding: '4px 2px', background: '#fff', fontFamily: 'var(--font-sans)' }} />
    </td>
  );
}

/** Podrobna stran rezultatov: tabela učencev, statistika po vprašanjih, mreža učenec × vprašanje, CSV. */
export function SessionResults({ session, students, answers, teacher, teacherAnswers, back, subtitle, note, sessionsByStudent, overall }: {
  session: QuizSession; students: SessionStudent[]; answers: SessionAnswer[];
  teacher: SessionStudent | null; teacherAnswers: SessionAnswer[];
  /** povezava nazaj (privzeto Kvizi), besedilo pod naslovom (privzeto razred · seja končana) in opomba */
  back?: { href: string; label: string }; subtitle?: string; note?: string;
  /** pri združenih rezultatih več sej: seja, v kateri je učenec rešil kviz (od nje zavisijo njegove črke); sicer velja `session` */
  sessionsByStudent?: Map<string, QuizSession>;
  /** povprečje po nalogah čez vse izvedbe istega kviza (le če jih je več) */
  overall?: { perQuestion: Map<string, number | null>; sessions: number; classes: number; people: number };
}) {
  const [deleting, setDeleting] = useState(false);
  const [ending, setEnding] = useState(false);
  /** Konča izvedbo (natisnjen kviz: konec skeniranja) — s potrditvijo. */
  const endHere = async () => {
    if (!confirm(session.paper ? 'Končam izvedbo? Skeniranje listov ne bo več mogoče.' : 'Končam izvedbo? Učenci ne bodo mogli več odgovarjati.')) return;
    setEnding(true);
    try { await updateSession(session.id, { status: 'ended', ended_at: new Date().toISOString() }); window.location.reload(); }
    catch (e) { alert(`Končanje ni uspelo: ${e instanceof Error ? e.message : String(e)}`); setEnding(false); }
  };
  /** Pobriše vrstico enega učenca (njegove odgovore v tej izvedbi) — s potrditvijo. */
  const resetRow = async (studentId: string, name: string) => {
    if (!confirm(`Pobrišem rezultat učenca ${name} v tej izvedbi?\n\nIzbrisani bodo njegovi odgovori; list lahko nato znova skeniraš.`)) return;
    try {
      const snap = await snapshotSession(session.id, studentId);
      await resetStudentResult(session.id, studentId);
      offerPersistentUndo('session', `Rezultat učenca ${name} pobrisan`, snap, async () => { await restoreSessionSnapshot(snap); window.location.reload(); });
      window.location.reload();
    }
    catch (e) { alert(`Brisanje ni uspelo: ${e instanceof Error ? e.message : String(e)}`); }
  };
  /** Trajno izbriše to izvedbo (z vsemi odgovori) — vedno s potrditvijo. */
  const removeResult = async () => {
    const n = students.filter(isOn).length;
    if (!confirm(`Trajno izbrišem rezultat »${quizTitle}« (${session.class_name}, ${new Date(session.created_at).toLocaleString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })})?\n\nIzbrisani bodo odgovori ${n} ${n === 1 ? 'učenca' : 'učencev'}.`)) return;
    setDeleting(true);
    try {
      const snap = await snapshotSession(session.id);
      await deleteSession(session.id);
      offerPersistentUndo('session', `Rezultat »${quizTitle}« (${session.class_name}) izbrisan`, snap, async () => { await restoreSessionSnapshot(snap); window.location.reload(); });
      window.location.assign(back?.href ?? '/kvizi/statistika'); } // polno nalaganje: seznam rezultatov brez izbrisane izvedbe
    catch (e) { alert(`Brisanje ni uspelo: ${e instanceof Error ? e.message : String(e)}`); setDeleting(false); }
  };
  // trenutno ime kviza (preimenovanje se pozna tudi v rezultatih), sicer ime ob izvedbi
  const lib = useQuizLibrary();
  const quizTitle = lib.quizzes.find(q => q.id === session.quiz_id)?.title || session.quiz_title;
  // točkovanje izvedbe se razlikuje od kviza v knjižnici (npr. spremenjene točke) → ponudi posodobitev
  const libQuiz = lib.quizzes.find(q => q.id === session.quiz_id);
  const scoringDiff = useMemo(() => {
    if (!libQuiz) return null;
    const byId = new Map(libQuiz.questions.map(q => [q.id, q]));
    let oldMax = 0, newMax = 0, diff = false, matched = 0;
    for (const sq of session.quiz.questions) {
      if (!isScored(sq)) continue;
      oldMax += sq.points;
      const q = byId.get(sq.id);
      if (!q) { newMax += sq.points; continue; }
      matched++;
      newMax += q.points;
      if (q.points !== sq.points) diff = true;
      if (sq.kind === 'mc' && q.kind === 'mc' && q.correct && q.correct !== sq.correct && sq.options.some(o => o.id === q.correct)) diff = true;
      if (sq.kind === 'numeric' && q.kind === 'numeric' && (q.correct !== sq.correct || q.tolerance !== sq.tolerance)) diff = true;
    }
    return { diff, oldMax, newMax, matched };
  }, [libQuiz, session.quiz.questions]);
  const [syncing, setSyncing] = useState(false);
  const syncScoring = async () => {
    if (!libQuiz) return;
    setSyncing(true);
    try { await syncSessionScoring(libQuiz.id, libQuiz.questions); window.location.reload(); }
    catch (e) { alert(`Točkovanja ni bilo mogoče posodobiti: ${e instanceof Error ? e.message : String(e)}`); setSyncing(false); }
  };
  // razvrščanje (stolpec + smer) se zapomni; velja za vse rezultate in za tisk
  const [sortBy, setSortByState] = useState<ResultsSort>(readResultsSort);
  const setSortBy = (by: ResultsSort['by']) => setSortByState(cur => { const n = nextResultsSort(cur, by); saveResultsSort(n); return n; });
  // ročno točkovane naloge starejših izvedb nimajo besedila — vzemi ga iz kviza v knjižnici
  const questions = useMemo(() => session.quiz.questions.map(q => (q.prompt || !libQuiz ? q : { ...q, prompt: libQuiz.questions.find(x => x.id === q.id)?.prompt ?? '' })), [session.quiz.questions, libQuiz]);
  // naloge, izvzete iz točkovanja (velja za to izvedbo; pri združenih rezultatih za vse prikazane izvedbe)
  const [excluded, setExcludedState] = useState<string[]>(session.quiz.excluded ?? []);
  const scoredQuiz = useMemo(() => ({ ...session.quiz, excluded }), [session.quiz, excluded]);
  const toggleExcluded = (qid: string) => {
    const on = !excluded.includes(qid);
    setExcludedState(x => (on ? [...x, qid] : x.filter(id => id !== qid)));
    const ids = [...new Set([session.id, ...[...(sessionsByStudent?.values() ?? [])].map(x => x.id)])];
    setQuestionExcluded(ids, qid, on).catch(e => {
      alert(`Ni bilo mogoče shraniti: ${e instanceof Error ? e.message : String(e)}`);
      setExcludedState(x => (on ? x.filter(id => id !== qid) : [...x, qid]));
    });
  };
  /**
   * Popravi pravilni odgovor povsod, kjer je bila ta naloga uporabljena: v vseh izvedbah (vsi razredi), v vseh kvizih
   * v knjižnici in v nalogi v bazi nalog; nato osveži.
   */
  const fixCorrect = async (qid: string, fix: { correct: string; tolerance?: number }) => {
    const sq = session.quiz.questions.find(x => x.id === qid);
    const taskId = sq?.taskId ?? libQuiz?.questions.find(x => x.id === qid)?.taskId;
    const texts = sq?.kind === 'mc' ? choiceIds(fix.correct).map(id => sq.options.find(o => o.id === id)?.text ?? '') : undefined;
    const full = { ...fix, texts };
    const match = { questionId: qid, taskId };
    const nSessions = await setQuestionCorrect(match, full);
    // kvizi v knjižnici
    let nQuizzes = 0;
    for (const qz of lib.quizzes) {
      let changed = false;
      const questions = qz.questions.map(x => {
        if (!sameTask(x, match)) return x;
        const nx = applyCorrectFix(x, full);
        if (!nx || JSON.stringify(nx) === JSON.stringify(x)) return x;
        changed = true;
        return nx;
      });
      if (changed) { lib.updateQuiz(qz.id, { questions }); nQuizzes++; }
    }
    // naloga v bazi nalog
    let taskOk = false;
    if (taskId) {
      try { taskOk = await setTaskCorrect(taskId, full); }
      catch (e) { alert(`Rezultati so popravljeni, naloge v bazi pa ni bilo mogoče posodobiti: ${e instanceof Error ? e.message : String(e)}`); }
    }
    alert(`Pravilni odgovor popravljen: ${nSessions} ${nSessions === 1 ? 'izvedba' : nSessions === 2 ? 'izvedbi' : nSessions < 5 ? 'izvedbe' : 'izvedb'}, ${nQuizzes} ${nQuizzes === 1 ? 'kviz' : nQuizzes === 2 ? 'kviza' : nQuizzes < 5 ? 'kvizi' : 'kvizov'} v knjižnici${taskOk ? ', naloga v bazi nalog' : taskId ? ' (naloge v bazi ni bilo mogoče popraviti)' : ' (vprašanje ni povezano z nalogo v bazi)'}.`);
    // knjižnica kvizov se v oblak zapiše z zamikom (1 s) — počakaj, da se ob osvežitvi ne naloži stara kopija
    if (nQuizzes) await new Promise(r => setTimeout(r, 1800));
    window.location.reload();
  };
  // ročno vpisane točke (natisnjen kviz): takoj vidne, shranijo se v ozadju
  const [manualEdits, setManualEdits] = useState<Record<string, string | null>>({});
  const editedIds = useMemo(() => new Set(Object.entries(manualEdits).filter(([, v]) => v !== null).map(([k]) => k.split('|')[0])), [manualEdits]);
  const isOn = (st: SessionStudent) => participated(st) || editedIds.has(st.student_id);
  const saveManual = (sid: string, q: Question, raw: string) => {
    const t = raw.trim();
    const n = t === '' ? null : parseNumber(t);
    if (t !== '' && (n === null || n < 0 || n > q.points)) { alert(`Vpiši število točk med 0 in ${formatNumber(q.points)}.`); return; }
    setManualEdits(m => ({ ...m, [`${sid}|${q.id}`]: n === null ? null : String(n) }));
    setManualPoints(sessOf(sid).id, sid, q.id, n).catch(e => alert(`Točk ni bilo mogoče shraniti: ${e instanceof Error ? e.message : String(e)}`));
  };
  const joinedCount = students.filter(isOn).length;

  // pravilni odgovor namesto križca: pri natisnjenem kvizu s črko, kot jo ima učenec na svojem listu (mešani odgovori),
  // pri kvizu v živo z izvirnim vrstnim redom (če so bili odgovori premešani, črke ne poznamo — ostane križec)
  const sessOf = (sid: string) => sessionsByStudent?.get(sid) ?? session;
  const lettersBy = useMemo(() => {
    const m = new Map<string, Map<string, Map<string, string>>>();
    for (const st of students) {
      const paper = (sessionsByStudent?.get(st.student_id) ?? session).paper as PaperInfo | null | undefined;
      if (!paper) continue;
      const lay = layoutSheet(paper.items, paper.shuffle ? sheetSeed(paper.salt, st.student_id) : null, { ...shuffleOpts(paper), order: paper.orders?.[st.student_id] });
      const per = new Map<string, Map<string, string>>();
      for (const c of [...lay.choice, ...lay.free]) if (c.item.choice) per.set(c.item.id, new Map(c.options.map(o => [o.id, o.letter])));
      m.set(st.student_id, per);
    }
    return m;
  }, [session, sessionsByStudent, students]);
  /**
   * Vprašanja v vrstnem redu lista posameznega učenca (natisnjen kviz z mešanjem): stolpec 1 = njegova naloga 1 itd.,
   * da učenec na projekciji takoj vidi, katero svojo nalogo je imel narobe. Pri kvizu v živo velja izvirni vrstni red.
   */
  const orderBy = useMemo(() => {
    const byId = new Map(session.quiz.questions.map(q => [q.id, q]));
    const m = new Map<string, Question[]>();
    for (const st of students) {
      const paper = (sessionsByStudent?.get(st.student_id) ?? session).paper as PaperInfo | null | undefined;
      if (!paper) continue;
      const lay = layoutSheet(paper.items, paper.shuffle ? sheetSeed(paper.salt, st.student_id) : null, { ...shuffleOpts(paper), order: paper.orders?.[st.student_id] });
      const seq = [...lay.choice, ...lay.free].map(c => byId.get(c.item.id)).filter((q): q is Question => !!q);
      // vprašanja, ki jih na listu ni (npr. dodana kasneje), na konec
      m.set(st.student_id, [...seq, ...session.quiz.questions.filter(q => !seq.includes(q))]);
    }
    return m;
  }, [session, sessionsByStudent, students]);
  const colsFor = (sid: string) => orderBy.get(sid) ?? session.quiz.questions;
  const perStudentOrder = orderBy.size > 0 && [...orderBy.values()].some(list => list.some((q, i) => q.id !== session.quiz.questions[i]?.id));

  const rightFor = (sid: string, q: Question): string | undefined => {
    if (q.kind === 'numeric') return q.correct || undefined;
    if (q.kind !== 'mc' || !q.correct) return undefined;
    const ss = sessOf(sid);
    if (ss.paper) {
      const letters = lettersBy.get(sid)?.get(q.id);
      if (q.multi) { const ls = choiceIds(q.correct).map(id => letters?.get(id)).filter(Boolean); return ls.length ? ls.sort().join('') : undefined; }
      return letters?.get(q.correct);
    }
    if (ss.shuffle) return undefined;
    const i = q.options.findIndex(o => o.id === q.correct);
    return i >= 0 ? LETTERS[i] : undefined;
  };

  const answersByStudent = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    for (const a of answers) {
      const rec = m.get(a.student_id) ?? {};
      rec[a.question_id] = a.value;
      m.set(a.student_id, rec);
    }
    for (const [k, v] of Object.entries(manualEdits)) {
      const [sid, qid] = k.split('|');
      const rec = m.get(sid) ?? {};
      if (v === null) delete rec[qid]; else rec[qid] = v;
      m.set(sid, rec);
    }
    return m;
  }, [answers, manualEdits]);

  const rows = useMemo(() => {
    const withScore = students.map(s => ({ s, ans: answersByStudent.get(s.student_id) ?? {}, sc: scoreAnswers(scoredQuiz, answersByStudent.get(s.student_id) ?? {}) }));
    return withScore.sort((a, b) => compareResults(sortBy, { name: a.s.name, points: a.sc.points }, { name: b.s.name, points: b.sc.points }));
  }, [students, answersByStudent, scoredQuiz, sortBy]);

  // povprečje razreda po nalogah: delež pravilnih med učenci, ki so sodelovali (odprta vprašanja niso točkovana)
  const perQuestion = useMemo(() => {
    const part = rows.filter(r => participated(r.s) || editedIds.has(r.s.student_id));
    return new Map(session.quiz.questions.map(q => {
      if (!isScored(q) || excluded.includes(q.id) || !part.length) return [q.id, null] as const;
      const ok = part.reduce((t, r) => t + answerFraction(q, r.ans[q.id]), 0);
      return [q.id, ceilPct((ok / part.length) * 100)] as const;
    }));
  }, [rows, session.quiz.questions, editedIds, excluded]);

  // učitelj (testna oseba) — prikazan pod učenci, ne šteje v povprečje
  const teacherScore = teacher?.device_id
    ? scoreAnswers(scoredQuiz, Object.fromEntries(teacherAnswers.map(a => [a.question_id, a.value])))
    : null;

  // povprečje le med učenci, ki so sodelovali (neskenirani / nepovezani ne štejejo kot 0 %)
  const partRows = rows.filter(r => isOn(r.s));
  const overallLabel = overall ? `${overall.sessions} izvedb${overall.sessions === 2 ? 'i' : overall.sessions < 5 ? 'e' : ''}, ${overall.people} učencev` : '';
  const avgPct = partRows.length ? ceilPct(partRows.reduce((s, r) => s + r.sc.percent, 0) / partRows.length) : 0;

  // tisk rezultatov na A4 (med tiskom je viden le .print-results; globals.css, html.printing-results)
  const [anon, setAnonState] = useState(() => { try { return localStorage.getItem('rezultati-tisk-zakrij') === '1'; } catch { return false; } });
  const setAnon = (v: boolean) => { setAnonState(v); try { localStorage.setItem('rezultati-tisk-zakrij', v ? '1' : '0'); } catch { /* ignore */ } };
  const [printing, setPrinting] = useState(false);
  const printResults = () => {
    setPrinting(true);
    const root = document.documentElement;
    const done = () => { root.classList.remove('printing-results'); window.removeEventListener('afterprint', done); setPrinting(false); };
    setTimeout(() => { root.classList.add('printing-results'); window.addEventListener('afterprint', done); window.print(); }, 60);
  };

  const exportCsv = () => {
    const csv = sessionResultsCsv(scoredQuiz, students.map(s => ({ name: s.name, participated: participated(s), answers: answersByStudent.get(s.student_id) ?? {} })));
    const date = new Date(session.ended_at ?? session.created_at).toISOString().slice(0, 10);
    downloadCsv(`${safeFilename(quizTitle, session.class_name, date)}.csv`, csv);
  };

  const sortBtn = (active: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: active ? 700 : 500,
    color: active ? 'var(--forest)' : 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px',
  });

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px', fontFamily: 'var(--font-sans)' }}>
      <Link href={back?.href ?? '/kvizi'} style={{ fontSize: '13px', color: 'var(--forest)', textDecoration: 'none' }}>{back?.label ?? '← Kvizi'}</Link>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginTop: '10px' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '36px', fontWeight: 300, margin: '0 0 4px', color: 'var(--ink)' }}>{quizTitle}</h1>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            {subtitle ?? `${session.class_name} · seja končana`} · {studentsLabel(joinedCount)} sodelovalo od {students.length} · povprečje <b style={{ color: gradeColor(avgPct) }}>{avgPct} %</b>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {session.status === 'open' && (
            <button onClick={() => void endHere()} disabled={ending}
              title={session.paper ? 'Konča izvedbo: skeniranje listov ne bo več mogoče, učenci lahko s QR kodo vidijo rezultate' : 'Konča izvedbo: učenci ne morejo več odgovarjati'}
              style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: '#c0392b', background: '#fff', border: '1px solid #c0392b', borderRadius: 'var(--r-sm)', padding: '9px 16px', cursor: 'pointer', whiteSpace: 'nowrap', opacity: ending ? 0.5 : 1 }}>
              {ending ? 'Končujem …' : '■ Končaj'}
            </button>
          )}
          <label title="Na izpisu namesto imena in priimka okrajšave (npr. Janez Lojze Novak → JL. No.)"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} /> zakrij imena
          </label>
          <button onClick={printResults} title="Natisne tabelo rezultatov na list A4"
            style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: 'var(--forest)', background: 'transparent', border: '1px solid var(--forest)', borderRadius: 'var(--r-sm)', padding: '9px 16px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            🖨 Natisni
          </button>
          <button onClick={exportCsv} style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 16px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            ⬇ Izvozi CSV
          </button>
          <button onClick={() => void removeResult()} disabled={deleting}
            title="Trajno izbriše ta rezultat (to izvedbo kviza z vsemi odgovori učencev)"
            style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500, color: '#c0392b', background: 'transparent', border: '1px solid #e0b4ae', borderRadius: 'var(--r-sm)', padding: '9px 16px', cursor: 'pointer', whiteSpace: 'nowrap', opacity: deleting ? 0.5 : 1 }}>
            {deleting ? 'Brišem …' : '🗑 Izbriši rezultat'}
          </button>
        </div>
      </div>

      {note && <p style={{ fontSize: '12px', color: '#b7791f', margin: '12px 0 0' }}>{note}</p>}
      {scoringDiff?.diff && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '14px', padding: '10px 14px', background: '#fdf6e3', border: '1px solid #ecd9a8', borderRadius: 'var(--r-md)', fontSize: '13px', color: '#8a5a00' }}>
          <span style={{ flex: 1 }}>Točkovanje v kvizu je bilo spremenjeno ({formatNumber(scoringDiff.oldMax)} → {formatNumber(scoringDiff.newMax)} točk), ta izvedba pa ima še staro.</span>
          <button onClick={() => void syncScoring()} disabled={syncing}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '7px 14px', cursor: 'pointer' }}>
            {syncing ? 'Posodabljam …' : '↻ Posodobi točkovanje'}
          </button>
        </div>
      )}

      {/* združena tabela: učenec · točke in % · ✓/✗ po vprašanjih (primerna za projekcijo) */}
      <div style={{ marginTop: '28px' }}>
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 10px' }}>Učenec × vprašanje</h2>
        {perStudentOrder && <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '-4px 0 10px' }}>Številke stolpcev so številke nalog na listu posameznega učenca (vsak je imel premešan vrstni red).</p>}
        {/* tabela se drsi v svojem okvirju, da glava s številkami nalog ostane pripeta na vrhu (tudi na projekciji) */}
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 140px)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '15px', minWidth: '100%' }}>
            <thead><tr>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 3, background: 'var(--canvas)', padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--hairline)', whiteSpace: 'nowrap' }}>
                <button style={sortBtn(sortBy.by === 'name')} onClick={() => setSortBy('name')} title="Razvrsti po priimku; ponoven klik obrne smer">Učenec{sortBy.by === 'name' ? (sortBy.desc ? ' ↑' : ' ↓') : ''}</button>
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--canvas)', padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--hairline)', borderRight: '2px solid var(--hairline)', whiteSpace: 'nowrap' }}>
                <button style={sortBtn(sortBy.by === 'points')} onClick={() => setSortBy('points')} title="Razvrsti po točkah (najprej največ); ponoven klik obrne smer">Točke · %{sortBy.by === 'points' ? (sortBy.desc ? ' ↓' : ' ↑') : ''}</button>
              </th>
              {questions.map((q, i) => <th key={q.id} title={perStudentOrder ? `Naloga ${i + 1} na listu posameznega učenca` : `${q.prompt}${!perStudentOrder && excluded.includes(q.id) ? ' (izvzeto iz točkovanja)' : ''}`} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--canvas)', padding: '8px 6px', borderBottom: '1px solid var(--hairline)', minWidth: '38px', color: 'var(--muted)', fontWeight: 600, textDecoration: !perStudentOrder && excluded.includes(q.id) ? 'line-through' : 'none' }}>{i + 1}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(({ s, ans, sc }) => {
                const on = isOn(s);
                return (
                  <tr key={s.student_id}>
                    <td style={{ position: 'sticky', left: 0, background: '#fff', padding: '7px 12px', borderBottom: '1px solid var(--hairline)', whiteSpace: 'nowrap', color: on ? 'var(--ink)' : 'var(--muted)' }}>
                      {s.name}{!on && <span style={{ fontSize: '12px' }}> (ni sodeloval)</span>}
                      {(on || Object.keys(ans).length > 0) && (
                        <button onClick={() => void resetRow(s.student_id, s.name)} title={`Pobriši rezultat učenca ${s.name} (odgovore v tej izvedbi)`}
                          style={{ marginLeft: '8px', width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', fontSize: '14px', lineHeight: 1, cursor: 'pointer', verticalAlign: 'middle' }}>↺</button>
                      )}
                    </td>
                    <td style={{ padding: '7px 12px', borderBottom: '1px solid var(--hairline)', borderRight: '2px solid var(--hairline)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {on ? (<>
                        <b style={{ color: 'var(--ink)' }}>{formatNumber(sc.points)}</b><span style={{ color: 'var(--muted)' }}> / {formatNumber(sc.maxPoints)}</span>
                        <span style={{ marginLeft: '10px', fontWeight: 700, color: pctColor(sc.percent) }}>{formatNumber(sc.percent)} %</span>
                      </>) : <span style={{ color: 'var(--muted)' }}>– <span>/ {formatNumber(sc.maxPoints)}</span></span>}
                    </td>
                    {colsFor(s.student_id).map((q, i) => q.kind === 'open' && q.manual
                      ? <ManualCell key={`${i}:${ans[q.id] ?? ''}`} q={q} value={ans[q.id]} onSave={raw => saveManual(s.student_id, q, raw)} />
                      : <Mark key={i} q={q} value={ans[q.id]} right={rightFor(s.student_id, q)} />)}
                  </tr>
                );
              })}
              {/* povprečje razreda po nalogah — le če so stolpci v istem vrstnem redu za vse učence */}
              {!perStudentOrder && rows.some(r => isOn(r.s)) && (
                <tr>
                  <td style={{ position: 'sticky', left: 0, background: '#f7f6f3', padding: '7px 12px', borderTop: '2px solid var(--hairline)', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--ink)' }}>Povprečje razreda</td>
                  <td style={{ padding: '7px 12px', borderTop: '2px solid var(--hairline)', borderRight: '2px solid var(--hairline)', background: '#f7f6f3', whiteSpace: 'nowrap', fontWeight: 700, color: gradeColor(avgPct) }}>{avgPct} %</td>
                  {questions.map(q => { const p = perQuestion.get(q.id); return (
                    <td key={q.id} style={{ textAlign: 'center', padding: '7px 6px', borderTop: '2px solid var(--hairline)', background: '#f7f6f3', fontWeight: 700, fontSize: '13px', color: p == null ? 'var(--muted)' : gradeColor(p) }}>{p == null ? '–' : `${p} %`}</td>
                  ); })}
                </tr>
              )}
              {!perStudentOrder && overall && (
                <tr title={`Delež pravilnih odgovorov med vsemi ${overall.people} učenci v ${overall.sessions} izvedbah tega kviza`}>
                  <td style={{ position: 'sticky', left: 0, background: '#efeee9', padding: '7px 12px', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--ink)' }}>Povprečje vseh izvedb <span style={{ fontWeight: 500, color: 'var(--muted)' }}>({overallLabel})</span></td>
                  <td style={{ padding: '7px 12px', borderRight: '2px solid var(--hairline)', background: '#efeee9' }} />
                  {questions.map(q => { const p = overall.perQuestion.get(q.id); return (
                    <td key={q.id} style={{ textAlign: 'center', padding: '7px 6px', background: '#efeee9', fontWeight: 700, fontSize: '13px', color: p == null ? 'var(--muted)' : gradeColor(p) }}>{p == null ? '–' : `${p} %`}</td>
                  ); })}
                </tr>
              )}
              {teacherScore && (
                <tr title="Učitelj (testna oseba) — ne šteje v povprečje" style={{ fontStyle: 'italic' }}>
                  <td style={{ position: 'sticky', left: 0, background: '#fff', padding: '7px 12px', borderTop: '2px solid var(--hairline)', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{TEACHER_NAME} (test)</td>
                  <td style={{ padding: '7px 12px', borderTop: '2px solid var(--hairline)', borderRight: '2px solid var(--hairline)', whiteSpace: 'nowrap', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(teacherScore.points)} / {formatNumber(teacherScore.maxPoints)}<span style={{ marginLeft: '10px' }}>{formatNumber(teacherScore.percent)} %</span>
                  </td>
                  {questions.map(q => <Mark key={q.id} q={q} value={teacherAnswers.find(a => a.question_id === q.id)?.value} top />)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* povprečje po nalogah pri premešanih listih (vrstni red kviza); pri več izvedbah čez vse izvedbe */}
      {perStudentOrder && rows.some(r => isOn(r.s)) && (
        <div style={{ marginTop: '24px' }}>
          <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 10px' }}>
            {overall ? `Povprečje po nalogah — vse izvedbe (${overallLabel})` : 'Povprečje razreda po nalogah'} (izvirni vrstni red kviza)
          </h2>
          <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            {overall && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '5px 12px', background: 'var(--surface)', fontSize: '11px', fontWeight: 700, color: 'var(--muted)' }}>
                <span style={{ flex: 1 }} />
                <span style={{ width: '120px', textAlign: 'center' }}>vse izvedbe</span>
                <span style={{ minWidth: '48px', textAlign: 'right' }}>skupaj</span>
                <span style={{ minWidth: '64px', textAlign: 'right' }}>{session.class_name}</span>
              </div>
            )}
            {questions.map((q, i) => { const own = perQuestion.get(q.id); const p = overall ? overall.perQuestion.get(q.id) ?? null : own; return (
              <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '7px 12px', borderTop: i || overall ? '1px solid var(--hairline)' : 'none', background: 'var(--canvas)', fontSize: '13px' }}>
                <b style={{ minWidth: '24px', color: 'var(--muted)' }}>{i + 1}.</b>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{q.prompt}</span>
                <div style={{ width: '120px', height: '8px', background: 'var(--surface)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${p ?? 0}%`, height: '100%', background: p == null ? 'transparent' : gradeColor(p) }} />
                </div>
                <b style={{ minWidth: '48px', textAlign: 'right', color: p == null ? 'var(--muted)' : gradeColor(p) }}>{p == null ? '–' : `${p} %`}</b>
                {overall && <span style={{ minWidth: '64px', textAlign: 'right', color: own == null ? 'var(--muted)' : gradeColor(own) }}>{own == null ? '–' : `${own} %`}</span>}
              </div>
            ); })}
          </div>
        </div>
      )}

      {printing && typeof document !== 'undefined' && createPortal(
        <div className="print-results">
          <ResultsPrintSheet session={session} students={students} answersByStudent={answersByStudent} questions={questions} excluded={excluded}
            title={quizTitle} anon={anon} isOn={isOn} sessionsByStudent={sessionsByStudent} sort={sortBy} />
        </div>,
        document.body,
      )}

      {/* statistika po vprašanjih */}
      {questions.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 10px' }}>Vprašanja{perStudentOrder ? ' (v izvirnem vrstnem redu kviza)' : ''}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {questions.map((q, i) => <QuestionStats key={q.id} q={q} index={i} answers={answers} totalStudents={students.length}
              excluded={excluded.includes(q.id)} onToggleExcluded={isScored(q) ? () => toggleExcluded(q.id) : undefined}
              onFixCorrect={q.kind === 'mc' || q.kind === 'numeric' ? fix => fixCorrect(q.id, fix) : undefined} />)}
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
  const [teacher, setTeacher] = useState<SessionStudent | null>(null);
  const [teacherAnswers, setTeacherAnswers] = useState<SessionAnswer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showJoin, setShowJoin] = useState(true);
  const channel = useRef<ReturnType<typeof joinChannel> | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    try {
      const d = await loadSession(sessionId);
      setSession(d.session); setStudents(d.students); setAnswers(d.answers);
      setTeacher(d.teacher); setTeacherAnswers(d.teacherAnswers); setError(null);
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
      const n = q?.kind === 'numeric' ? numericValue(q, a.value) : null;
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
    if (confirm(session.paper ? 'Končam sejo? Skeniranje listov ne bo več mogoče.' : 'Končam sejo? Učenci ne bodo mogli več odgovarjati.')) void act({ status: 'ended', ended_at: new Date().toISOString() });
  };

  // ── konec seje: podrobni rezultati ──
  if (!live || session.paper) {
    return (
      <>
        {live && (
          <div style={{ background: '#eef6ee', borderBottom: '1px solid #bfe3c0', padding: '10px 32px', fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}>🖨 Natisnjen kviz — seja je odprta in skeniranje deluje, dokler je ne končaš. Vsak nov sken lista prepiše prejšnjega.</span>
            <Link href="/kvizi/skener" style={{ color: 'var(--forest)', fontWeight: 600 }}>📷 Skener</Link>
            <button onClick={endSession} style={{ fontSize: '12px', fontWeight: 500, color: '#c0392b', background: 'transparent', border: '1px solid #e0b4ae', borderRadius: 'var(--r-sm)', padding: '5px 12px', cursor: 'pointer' }}>Končaj sejo</button>
          </div>
        )}
        <SessionResults session={session} students={students} answers={answers} teacher={teacher} teacherAnswers={teacherAnswers} />
      </>
    );
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
