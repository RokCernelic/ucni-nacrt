'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { layoutSheet, sheetSeed, shuffleOpts } from '@/lib/quiz/printSheet';
import { scoreAnswers, isCorrect, choiceIds, manualPoints } from '@/lib/quiz/scoring';
import { formatNumber, gradeColor, dateTimeLabel, ceilPct } from '@/lib/quiz/format';
import type { PaperInfo } from '@/lib/quiz/paperSession';
import { withManualQuestions } from '@/lib/quiz/sessionApi';
import type { Question, McQuestion } from '@/lib/quiz/types';

type Result =
  | { status: 'not_found' }
  | { status: 'open'; title: string }
  | { status: 'ended'; title: string; className: string; name: string; createdAt: string; quiz: { questions: Question[] }; paper: PaperInfo; answers: Record<string, string>;
      /** anonimni odgovori vseh sodelujočih učencev (za povprečje razreda in porazdelitev); starejša različica funkcije jih nima */
      classAnswers?: Record<string, string>[] };

/**
 * Rezultat enega učenca za natisnjen kviz (odpre ga s QR kodo, brez prijave). Vidi se šele, ko učitelj kviz zaključi.
 * Zgoraj: ime, točke, odstotek in ✓ / pravilna črka po vprašanjih; spodaj: celoten kviz v vrstnem redu njegovega lista.
 */
export default function PaperResult({ sessionId, studentId }: { sessionId: string; studentId: string }) {
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSupabaseBrowserClient().rpc('quiz_paper_result', { p_session: sessionId, p_student: studentId })
      .then(({ data, error: e }: { data: unknown; error: { message: string } | null }) => { if (e) setError(e.message); else setRes(data as Result); });
  }, [sessionId, studentId]);

  const page: React.CSSProperties = { minHeight: '100vh', background: 'var(--surface, #f4f2ee)', fontFamily: 'var(--font-sans)', padding: '20px 14px 40px' };
  const box: React.CSSProperties = { maxWidth: '760px', margin: '0 auto', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', padding: '18px 18px 20px' };
  const msg = (t: string, sub?: string) => (
    <div style={page}><div style={{ ...box, textAlign: 'center', padding: '36px 20px' }}>
      <p style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{t}</p>
      {sub && <p style={{ fontSize: '14px', color: 'var(--muted)', margin: '8px 0 0' }}>{sub}</p>}
    </div></div>
  );

  if (error) return msg('Rezultata ni bilo mogoče naložiti.', error);
  if (!res) return msg('Nalagam …');
  if (res.status === 'not_found') return msg('Rezultata ni mogoče najti.', 'Preveri, ali si skeniral QR kodo na svojem listu.');
  if (res.status === 'open') return msg(res.title, 'Kviz še ni zaključen. Rezultati bodo vidni, ko ga učitelj zaključi.');

  const { paper, answers } = res;
  // naloge, ki jih skener ne prebere: točke vpiše učitelj (štejejo v rezultat)
  const quiz = withManualQuestions({ quiz: res.quiz, paper: res.paper as never }).quiz;
  const manualQs = quiz.questions.filter(q => q.kind === 'open' && q.manual);
  const lay = layoutSheet(paper.items, paper.shuffle ? sheetSeed(paper.salt, studentId) : null, { ...shuffleOpts(paper), order: paper.orders?.[studentId] });
  const manualCells = lay.free.flatMap(c => { const q = manualQs.find(x => x.id === c.item.id); return q ? [{ c, q }] : []; });
  const byId = new Map(quiz.questions.map(q => [q.id, q]));
  const rows = lay.choice.map(c => ({ c, q: byId.get(c.item.id) as McQuestion | undefined })).filter((r): r is { c: typeof r.c; q: McQuestion } => !!r.q && r.q.kind === 'mc');
  const sc = scoreAnswers(quiz, answers);
  /** list tega učenca ni bil skeniran: prazna vrstica (– / največ točk), ostalo kot pri drugih */
  const took = Object.keys(answers).length > 0;
  const freeCount = lay.free.filter(c => !manualQs.some(q => q.id === c.item.id)).length;
  const cls = res.classAnswers ?? [];
  /** rešitve prostih nalog (številske: pravilna vrednost; odprte: vzorčni odgovor, če ga je učitelj zapisal) */
  const freeSols = lay.free.flatMap(c => {
    const q = byId.get(c.item.id);
    if (!q) return [];
    const sol = q.kind === 'numeric' ? `${q.correct.replace('.', ',')}${q.tolerance ? ` ± ${formatNumber(q.tolerance)}` : ''}${q.unit ? ` ${q.unit}` : ''}`
      : q.kind === 'open' ? (q.answer ?? '').trim() : '';
    return sol ? [{ n: c.n, q, sol }] : [];
  });
  const classAvg = cls.length ? ceilPct(cls.reduce((t, a) => t + scoreAnswers(quiz, a).percent, 0) / cls.length) : null;
  const label: React.CSSProperties = { fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 12px' };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface, #f4f2ee)', fontFamily: 'var(--font-sans)' }}>
      <div style={{ background: 'var(--forest)', padding: '22px 16px 20px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '34px', fontWeight: 300, color: '#fff', lineHeight: 1, margin: 0, letterSpacing: '0.06em' }}>REZULTATI</h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', margin: '8px 0 0' }}>{res.title} · {res.className} · {dateTimeLabel(res.createdAt)}</p>
        </div>
      </div>
      <div style={{ padding: '16px 14px 40px' }}>
      <div style={box}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 400, color: 'var(--ink)', margin: '0 0 10px' }}>{res.name}</h2>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tvoj rezultat</div>
            <div style={{ fontSize: '22px', fontVariantNumeric: 'tabular-nums' }}>
              {took ? (<>
                <b>{formatNumber(sc.points)}</b><span style={{ color: 'var(--muted)' }}> / {formatNumber(sc.maxPoints)}</span>
                <b style={{ marginLeft: '10px', color: gradeColor(sc.percent) }}>{formatNumber(sc.percent)} %</b>
              </>) : (
                <span style={{ color: 'var(--muted)' }}>– / {formatNumber(sc.maxPoints)} <span style={{ fontSize: '13px' }}>(list ni bil pregledan)</span></span>
              )}
            </div>
          </div>
          {classAvg !== null && (
            <div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Povprečje razreda</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: gradeColor(classAvg) }}>{classAvg} %</div>
            </div>
          )}
        </div>
        {!took && (
          <p style={{ fontSize: '14px', color: '#1f4f8a', background: '#e9f1fb', border: '1px solid #c8d6e8', borderRadius: 'var(--r-sm)', padding: '8px 12px', margin: '0 0 12px', lineHeight: 1.5 }}>
            Tvoj list ni bil skeniran, zato rezultata ni. Spodaj so <b>pravilni odgovori za tvoj list</b> (številke in črke so take kot na tvojem listu) — preveri se sam.
          </p>
        )}
        {/* ✓ pri pravilnih, rdeča črka pravilnega odgovora pri napačnih — v vrstnem redu tvojega lista */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>{[...rows.map(r => r.c), ...manualCells.map(m => m.c)].map(c => <td key={c.n} style={{ textAlign: 'center', padding: '2px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: '14px' }}>{c.n}</td>)}</tr>
              <tr>
                {rows.map(({ c, q }) => {
                  const v = answers[q.id];
                  const ok = !!v && isCorrect(q, v);
                  const right = c.options.filter(o => choiceIds(q.correct).includes(o.id)).map(o => o.letter).join('');
                  // list ni bil skeniran: pravilna črka (za samopreverjanje)
                  if (!took) return <td key={c.n} style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 800, fontSize: '24px', color: 'var(--forest)' }}>{right || '–'}</td>;
                  return <td key={c.n} style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 800, fontSize: '24px', color: !v ? 'var(--hairline)' : ok ? 'var(--green-ok)' : '#c0392b' }}>{!v ? '–' : ok ? '✓' : right}</td>;
                })}
                {manualCells.map(({ c, q }) => {
                  const p = manualPoints(q, answers[q.id]);
                  return <td key={c.n} title="Točke za to nalogo (pregledal učitelj)" style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 800, fontSize: '16px', whiteSpace: 'nowrap',
                    color: p === null ? 'var(--hairline)' : p >= q.points ? 'var(--green-ok)' : p > 0 ? '#b7791f' : '#c0392b' }}>{p === null ? '–' : `${formatNumber(p)}/${formatNumber(q.points)}`}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
        {!took ? (
          <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
            Pod vsako številko naloge je črka pravilnega odgovora. Rešitve ostalih nalog so na dnu strani.
          </p>
        ) : <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
          <b>Legenda:</b> <span style={{ color: 'var(--green-ok)', fontWeight: 700 }}>✓</span> pravilen odgovor ·{' '}
          <span style={{ color: '#c0392b', fontWeight: 700 }}>rdeča črka</span> = pravilni odgovor pri nalogi, ki si jo imel napačno ·{' '}
          – brez odgovora · pri ostalih nalogah dobljene točke. Številke so številke nalog na tvojem listu.
        </p>}
      </div>

      <div style={{ ...box, marginTop: '14px' }}>
        <h2 style={label}>Naloge in odgovori razreda</h2>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {rows.map(({ c, q }) => {
            const v = answers[q.id];
            const answered = cls.filter(a => a[q.id]);
            const okPct = cls.length ? ceilPct((cls.filter(a => isCorrect(q, a[q.id])).length / cls.length) * 100) : null;
            return (
              <li key={c.n}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
                  <div style={{ flex: 1, fontSize: '15px', color: 'var(--ink)', whiteSpace: 'pre-wrap' }}><b>{c.n}.</b> {q.prompt}</div>
                  {okPct !== null && <b style={{ fontSize: '13px', color: gradeColor(okPct), whiteSpace: 'nowrap' }}>{okPct} % pravilno</b>}
                </div>
                {q.image && (/* eslint-disable-next-line @next/next/no-img-element */
                  <img src={q.image} alt="" style={{ maxWidth: '100%', maxHeight: '220px', marginTop: '6px', borderRadius: 'var(--r-sm)' }} />)}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  {c.options.map(o => {
                    const text = q.options.find(x => x.id === o.id)?.text ?? '';
                    const isRight = choiceIds(q.correct).includes(o.id), isMine = choiceIds(v).includes(o.id);
                    const n = cls.filter(a => choiceIds(a[q.id]).includes(o.id)).length;
                    const share = answered.length ? (n / answered.length) * 100 : 0;
                    const bd = isRight ? 'var(--green-ok)' : isMine ? '#c0392b' : 'var(--hairline)';
                    return (
                      <div key={o.id} style={{ position: 'relative', overflow: 'hidden', display: 'flex', gap: '8px', alignItems: 'baseline', padding: '6px 10px', borderRadius: 'var(--r-sm)', border: `1.5px solid ${bd}`, fontSize: '14px' }}>
                        <div aria-hidden style={{ position: 'absolute', inset: 0, width: `${share}%`, background: isRight ? 'rgba(45,106,49,0.14)' : 'rgba(0,0,0,0.05)' }} />
                        <b style={{ position: 'relative', minWidth: '18px' }}>{o.letter})</b>
                        <span style={{ position: 'relative', flex: 1 }}>{text}</span>
                        {isRight && <span style={{ position: 'relative', color: 'var(--green-ok)', fontWeight: 700, fontSize: '12px' }}>✓ pravilno</span>}
                        {isMine && !isRight && <span style={{ position: 'relative', color: '#c0392b', fontWeight: 700, fontSize: '12px' }}>tvoj odgovor</span>}
                        {isMine && isRight && <span style={{ position: 'relative', color: 'var(--green-ok)', fontSize: '12px' }}>(tvoj)</span>}
                        {cls.length > 0 && <span style={{ position: 'relative', fontSize: '12px', color: 'var(--muted)', minWidth: '62px', textAlign: 'right' }}>{n} {n === 1 ? 'učenec' : n === 2 ? 'učenca' : n < 5 ? 'učenci' : 'učencev'}</span>}
                      </div>
                    );
                  })}
                  {!v && took && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Nisi odgovoril.</span>}
                </div>
              </li>
            );
          })}
        </ol>
        {freeCount > 0 && <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '16px 0 0' }}>Odprta vprašanja ({freeCount}) pregleda učitelj ročno; v točkah zgoraj niso všteta.</p>}
      </div>

      {freeSols.length > 0 && (
        <div style={{ ...box, marginTop: '14px' }}>
          <h2 style={label}>Rešitve ostalih nalog</h2>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {freeSols.map(({ n, q, sol }) => (
              <li key={n}>
                <div style={{ fontSize: '15px', color: 'var(--ink)', whiteSpace: 'pre-wrap' }}><b>{n}.</b> {q.prompt}</div>
                {q.image && (/* eslint-disable-next-line @next/next/no-img-element */
                  <img src={q.image} alt="" style={{ maxWidth: '100%', maxHeight: '220px', marginTop: '6px', borderRadius: 'var(--r-sm)' }} />)}
                <div style={{ marginTop: '6px', padding: '6px 10px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--green-ok)', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
                  <b style={{ color: 'var(--green-ok)' }}>Rešitev:</b> {sol}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      </div>
    </div>
  );
}
