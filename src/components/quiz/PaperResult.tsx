'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { layoutSheet, sheetSeed, shuffleOpts } from '@/lib/quiz/printSheet';
import { scoreAnswers } from '@/lib/quiz/scoring';
import { formatNumber, gradeColor, dateTimeLabel } from '@/lib/quiz/format';
import type { PaperInfo } from '@/lib/quiz/paperSession';
import type { Question, McQuestion } from '@/lib/quiz/types';

type Result =
  | { status: 'not_found' }
  | { status: 'open'; title: string }
  | { status: 'ended'; title: string; className: string; name: string; createdAt: string; quiz: { questions: Question[] }; paper: PaperInfo; answers: Record<string, string> };

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

  const { paper, quiz, answers } = res;
  const lay = layoutSheet(paper.items, paper.shuffle ? sheetSeed(paper.salt, studentId) : null, { ...shuffleOpts(paper), order: paper.orders?.[studentId] });
  const byId = new Map(quiz.questions.map(q => [q.id, q]));
  const rows = lay.choice.map(c => ({ c, q: byId.get(c.item.id) as McQuestion | undefined })).filter((r): r is { c: typeof r.c; q: McQuestion } => !!r.q && r.q.kind === 'mc');
  const sc = scoreAnswers(quiz, answers);
  const freeCount = lay.free.length;

  return (
    <div style={page}>
      <div style={box}>
        <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{res.title} · {res.className} · {dateTimeLabel(res.createdAt)}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap', margin: '8px 0 14px' }}>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '30px', fontWeight: 400, color: 'var(--ink)', margin: 0 }}>{res.name}</h1>
          <span style={{ fontSize: '20px', fontVariantNumeric: 'tabular-nums' }}>
            <b>{formatNumber(sc.points)}</b><span style={{ color: 'var(--muted)' }}> / {formatNumber(sc.maxPoints)}</span>
            <b style={{ marginLeft: '12px', color: gradeColor(sc.percent) }}>{formatNumber(sc.percent)} %</b>
          </span>
        </div>
        {/* pregled kot v učiteljevih rezultatih: ✓ ali pravilna črka (rdeče) pri napačnem odgovoru */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>{rows.map(({ c }) => <td key={c.n} style={{ textAlign: 'center', padding: '2px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: '14px' }}>{c.n}</td>)}</tr>
              <tr>
                {rows.map(({ c, q }) => {
                  const v = answers[q.id];
                  const ok = !!v && v === q.correct;
                  const right = c.options.find(o => o.id === q.correct)?.letter ?? '';
                  return <td key={c.n} style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 800, fontSize: '24px', color: !v ? 'var(--hairline)' : ok ? 'var(--green-ok)' : '#c0392b' }}>{!v ? '–' : ok ? '✓' : right}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '6px 0 0' }}>✓ pravilno · rdeča črka = pravilni odgovor, ti si izbral drugega · – brez odgovora</p>
      </div>

      <div style={{ ...box, marginTop: '14px' }}>
        <h2 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 12px' }}>Tvoj list</h2>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {rows.map(({ c, q }) => {
            const v = answers[q.id];
            return (
              <li key={c.n}>
                <div style={{ fontSize: '15px', color: 'var(--ink)', whiteSpace: 'pre-wrap' }}><b>{c.n}.</b> {q.prompt}</div>
                {q.image && (/* eslint-disable-next-line @next/next/no-img-element */
                  <img src={q.image} alt="" style={{ maxWidth: '100%', maxHeight: '220px', marginTop: '6px', borderRadius: 'var(--r-sm)' }} />)}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  {c.options.map(o => {
                    const text = q.options.find(x => x.id === o.id)?.text ?? '';
                    const isRight = o.id === q.correct, isMine = o.id === v;
                    const bg = isMine ? (isRight ? '#e6f3e7' : '#fbe9e7') : 'transparent';
                    const bd = isRight ? 'var(--green-ok)' : isMine ? '#c0392b' : 'var(--hairline)';
                    return (
                      <div key={o.id} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', padding: '6px 10px', borderRadius: 'var(--r-sm)', border: `1.5px solid ${bd}`, background: bg, fontSize: '14px' }}>
                        <b style={{ minWidth: '18px' }}>{o.letter})</b>
                        <span style={{ flex: 1 }}>{text}</span>
                        {isRight && <span style={{ color: 'var(--green-ok)', fontWeight: 700, fontSize: '12px' }}>✓ pravilno</span>}
                        {isMine && !isRight && <span style={{ color: '#c0392b', fontWeight: 700, fontSize: '12px' }}>tvoj odgovor</span>}
                      </div>
                    );
                  })}
                  {!v && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Brez odgovora.</span>}
                </div>
              </li>
            );
          })}
        </ol>
        {freeCount > 0 && <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '16px 0 0' }}>Odprta vprašanja ({freeCount}) pregleda učitelj ročno; v točkah zgoraj niso všteta.</p>}
      </div>
    </div>
  );
}
