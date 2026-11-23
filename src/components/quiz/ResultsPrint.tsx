'use client';

import { useMemo } from 'react';
import { participated, type QuizSession, type SessionStudent } from '@/lib/quiz/sessionApi';
import { answerStatus, scoreAnswers, choiceIds, isScored, answerFraction, manualPoints } from '@/lib/quiz/scoring';
import { formatNumber, studentsLabel, ceilPct, gradeColor } from '@/lib/quiz/format';
import type { Question } from '@/lib/quiz/types';
import { initialsName } from '@/lib/names';
import { compareResults, type ResultsSort } from '@/lib/quiz/resultsSort';
import { layoutSheet, sheetSeed, shuffleOpts } from '@/lib/quiz/printSheet';
import type { PaperInfo } from '@/lib/quiz/paperSession';

const LETTERS = 'ABCDEF';

/**
 * Tabela rezultatov ene izvedbe za tisk na A4 (glava z razredom in datumom, vrstica na učenca, povprečje razreda).
 * Uporablja jo »Natisni« pri rezultatih izvedbe in »Natisni vse izvedbe« (vsak razred na svoj list).
 */
export default function ResultsPrintSheet({ session, students, answersByStudent, questions, excluded, title, anon, isOn = participated, sessionsByStudent, sort = { by: 'name', desc: false } }: {
  session: QuizSession;
  students: SessionStudent[];
  answersByStudent: Map<string, Record<string, string>>;
  /** vprašanja izvedbe (z besedili) */
  questions: Question[];
  excluded: string[];
  title: string;
  anon: boolean;
  isOn?: (st: SessionStudent) => boolean;
  /** pri združenih rezultatih več sej: seja posameznega učenca */
  sessionsByStudent?: Map<string, QuizSession>;
  /** razvrščanje vrstic (kot v tabeli rezultatov) */
  sort?: ResultsSort;
}) {
  const sessOf = (sid: string) => sessionsByStudent?.get(sid) ?? session;
  const paperLayouts = useMemo(() => {
    const m = new Map<string, ReturnType<typeof layoutSheet>>();
    for (const st of students) {
      const paper = (sessionsByStudent?.get(st.student_id) ?? session).paper as PaperInfo | null | undefined;
      if (paper) m.set(st.student_id, layoutSheet(paper.items, paper.shuffle ? sheetSeed(paper.salt, st.student_id) : null, { ...shuffleOpts(paper), order: paper.orders?.[st.student_id] }));
    }
    return m;
  }, [session, sessionsByStudent, students]);

  // stolpci v vrstnem redu lista posameznega učenca (natisnjen kviz z mešanjem), sicer izvirni red
  const byId = new Map(questions.map(q => [q.id, q]));
  const colsFor = (sid: string): Question[] => {
    const lay = paperLayouts.get(sid);
    if (!lay) return questions;
    const seq = [...lay.choice, ...lay.free].map(c => byId.get(c.item.id)).filter((q): q is Question => !!q);
    return [...seq, ...questions.filter(q => !seq.includes(q))];
  };
  const perStudentOrder = students.some(st => colsFor(st.student_id).some((q, i) => q.id !== questions[i]?.id));

  const rightFor = (sid: string, q: Question): string | undefined => {
    if (q.kind === 'numeric') return q.correct || undefined;
    if (q.kind !== 'mc' || !q.correct) return undefined;
    const ss = sessOf(sid);
    if (ss.paper) {
      const lay = paperLayouts.get(sid);
      const cell = lay ? [...lay.choice, ...lay.free].find(c => c.item.id === q.id) : undefined;
      const letters = new Map(cell?.options.map(o => [o.id, o.letter]) ?? []);
      if (q.multi) { const ls = choiceIds(q.correct).map(id => letters.get(id)).filter(Boolean); return ls.length ? ls.sort().join('') : undefined; }
      return letters.get(q.correct);
    }
    if (ss.shuffle) return undefined;
    const i = q.options.findIndex(o => o.id === q.correct);
    return i >= 0 ? LETTERS[i] : undefined;
  };

  const scoredQuiz = { questions, excluded };
  const rows = [...students]
    .map(s => ({ s, ans: answersByStudent.get(s.student_id) ?? {}, sc: scoreAnswers(scoredQuiz, answersByStudent.get(s.student_id) ?? {}) }))
    .sort((a, b) => compareResults(sort, { name: a.s.name, points: a.sc.points }, { name: b.s.name, points: b.sc.points }));
  const part = rows.filter(r => isOn(r.s));
  const avgPct = part.length ? ceilPct(part.reduce((t, r) => t + r.sc.percent, 0) / part.length) : 0;
  const perQuestion = new Map(questions.map(q => {
    if (!isScored(q) || excluded.includes(q.id) || !part.length) return [q.id, null] as const;
    return [q.id, ceilPct((part.reduce((t, r) => t + answerFraction(q, r.ans[q.id]), 0) / part.length) * 100)] as const;
  }));

  return (
    <div className="prs-sheet">
      <div className="prs-head">
        <div>
          <div className="prs-cls">{session.class_name} · {new Date(session.created_at).toLocaleDateString('sl-SI')}</div>
          <div className="prs-title">{title}</div>
        </div>
        <div className="prs-meta">{studentsLabel(part.length)} od {students.length} · povprečje <b style={{ color: gradeColor(avgPct) }}>{avgPct} %</b></div>
      </div>
      <table className="prs-table">
        <thead><tr>
          <th className="num">#</th><th className="left">{anon ? 'Učenec (okrajšano)' : 'Učenec'}</th><th>Točke</th><th>%</th>
          {questions.map((q, i) => <th key={q.id} className={excluded.includes(q.id) && !perStudentOrder ? 'ex' : ''}>{i + 1}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(({ s: st, ans, sc }, ri) => {
            const on = isOn(st);
            return (
              <tr key={st.student_id}>
                <td className="num">{ri + 1}</td>
                <td className="left name">{anon ? initialsName(st.name) : st.name}</td>
                <td className="res">{on ? `${formatNumber(sc.points)} / ${formatNumber(sc.maxPoints)}` : '–'}</td>
                <td className="res" style={on ? { color: gradeColor(sc.percent) } : undefined}>{on ? `${formatNumber(sc.percent)} %` : ''}</td>
                {colsFor(st.student_id).map((q, i) => {
                  if (!on) return <td key={i} />;
                  if (q.kind === 'open' && q.manual) { const p = manualPoints(q, ans[q.id]); return <td key={i} className="pts" style={{ color: p === null ? '#888' : p >= q.points - 1e-9 ? '#2d6a31' : p > 0 ? '#b7791f' : '#c0392b' }}>{p === null ? '–' : formatNumber(p)}</td>; }
                  const stt = answerStatus(q, ans[q.id]);
                  const right = rightFor(st.student_id, q);
                  return <td key={i} className={stt === 'correct' ? 'ok' : stt === 'wrong' ? 'bad' : 'none'}>{stt === 'correct' ? '✓' : stt === 'wrong' ? (right ?? '✗') : '–'}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
        {!perStudentOrder && (
          <tfoot><tr>
            <td /><td className="left"><b>Povprečje razreda</b></td><td /><td className="res" style={{ color: gradeColor(avgPct) }}>{avgPct} %</td>
            {questions.map(q => { const p = perQuestion.get(q.id); return <td key={q.id} className="avg" style={p == null ? undefined : { color: gradeColor(p), fontWeight: 700 }}>{p == null ? '–' : `${p}`}</td>; })}
          </tr></tfoot>
        )}
      </table>
      <p className="prs-legend">✓ pravilno · črka = pravilni odgovor pri napačno rešeni nalogi · – brez odgovora · število = ročno vpisane točke{excluded.length && !perStudentOrder ? ' · prečrtana številka = naloga izvzeta iz točkovanja' : ''}{perStudentOrder ? ' · številke stolpcev so številke nalog na listu posameznega učenca' : ''}{!perStudentOrder ? ' · zadnja vrstica: delež pravilnih v %' : ''}</p>
    </div>
  );
}
