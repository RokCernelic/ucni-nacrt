'use client';

import type { Student } from '@/hooks/useRoster';
import { initialsName } from '@/lib/names';
import { ceilPct, gradeColor, formatNumber } from '@/lib/quiz/format';
import { avgPctOf, numberOf, numVal, pctColsOf, pctOf, resOf, seatRulesText, sortStudents, columnsOf, type ColCfg, type QuizCol, type RosterSort } from '@/lib/rosterTable';

const SEP = '1mm double #8f9b92';
const tint = (p: number | null) => (p == null ? '#888' : gradeColor(ceilPct(p)));
const fmt = (p: number | null) => (p == null ? '–' : `${ceilPct(p)} %`);

/**
 * Seznam učencev enega razreda za tisk (A4), v videzu tiska rezultatov (globals.css: .print-results .prs-*).
 * Natisnejo se vidni stolpci razreda (meni Stolpci), stolpec Povprečje in po želji prazni stolpci;
 * `minPct`: le učenci s povprečjem nad tem odstotkom.
 */
export default function RosterPrintSheet({ className, students, quizCols, cfg, sort, anon, blank, minPct, classOf }: {
  className: string; students: Student[]; quizCols: QuizCol[]; cfg: ColCfg; sort: RosterSort; anon: boolean; blank: number; minPct: number | null;
  /** več razredov na enem listu: razred vsakega učenca (doda stolpec Razred; zaporedne številke 1, 2, 3 … po vrsti izpisa) */
  classOf?: Map<string, string>;
}) {
  const { colKeys, visibleKeys: keys } = columnsOf(cfg, quizCols);
  const pctCols = pctColsOf(cfg);
  const avg = (st: Student) => avgPctOf(st, quizCols, pctCols);
  const sorted = sortStudents(students, sort, quizCols, cfg, colKeys);
  // več razredov, razvrščeno po imenu: najprej po razredu, znotraj razreda po priimku
  const ordered = classOf && sort.key === 'name' ? [...sorted].sort((a, b) => (classOf.get(a.id) ?? '').localeCompare(classOf.get(b.id) ?? '', 'sl')) : sorted;
  const shown = ordered.filter(st => { if (minPct == null) return true; const a = avg(st); return a != null && a > minPct; });
  const avgs = shown.map(avg).filter((n): n is number => n != null);
  const classAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  const quizOf = (k: string) => quizCols.find(c => `q:${c.s.id}` === k)!;
  const manualOf = (k: string) => cfg.manual.find(m => `m:${m.id}` === k)!;

  return (
    <div className="prs-sheet">
      <div className="prs-head">
        <div>
          <div className="prs-cls">{className} · {new Date().toLocaleDateString('sl-SI')}</div>
          <div className="prs-title">Seznam učencev{minPct != null ? ` — povprečje nad ${formatNumber(minPct)} %` : ''}</div>
        </div>
        <div className="prs-meta">
          {minPct != null ? `${shown.length} od ${students.length} učencev` : `${students.length} učencev · ${students.filter(x => x.gender === 'Ž').length} Ž / ${students.filter(x => x.gender === 'M').length} M`}
          {classAvg != null && <> · povprečje <b style={{ color: tint(classAvg) }}>{fmt(classAvg)}</b></>}
        </div>
      </div>
      <table className="prs-table">
        <thead><tr>
          <th className="num">#</th><th className="left">{anon ? 'Učenec (okrajšano)' : 'Učenec'}</th>{classOf && <th>Razred</th>}
          <th style={{ borderRight: SEP }}>Povprečje</th>
          {keys.map(k => {
            if (k === 'gender') return <th key={k}>Spol</th>;
            if (k === 'pin') return <th key={k}>PIN</th>;
            if (k === 'seat') return <th key={k} className="left">Sedežni red</th>;
            if (k.startsWith('q:')) { const c = quizOf(k); return <th key={k} style={{ maxWidth: '24mm', fontWeight: 600, lineHeight: 1.2 }}>{c.title}{!classOf && <><br /><span style={{ fontWeight: 400, color: '#666' }}>{new Date(c.s.created_at).toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric', year: '2-digit' })}</span></>}</th>; }
            return <th key={k} style={{ maxWidth: '24mm', lineHeight: 1.2 }}>{manualOf(k).name}</th>;
          })}
          {Array.from({ length: blank }, (_, i) => <th key={`b${i}`} style={{ minWidth: '14mm' }} />)}
        </tr></thead>
        <tbody>
          {shown.map((s, si) => { const g = avg(s); return (
            <tr key={s.id}>
              <td className="num">{classOf ? si + 1 : numberOf(s, students)}</td>
              <td className="left name">{anon ? initialsName(s.name) : s.name}</td>
              {classOf && <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{classOf.get(s.id) ?? ''}</td>}
              <td className="res" style={{ color: tint(g), borderRight: SEP }}>{fmt(g)}</td>
              {keys.map(k => {
                if (k === 'gender') return <td key={k}>{s.gender || '–'}</td>;
                if (k === 'pin') return <td key={k} className="res" style={{ letterSpacing: '.08em' }}>{s.pin ?? '–'}</td>;
                if (k === 'seat') return <td key={k} className="left" style={{ fontSize: '8.5pt' }}>{seatRulesText(s, students)}</td>;
                if (k.startsWith('q:')) { const r = resOf(quizOf(k), s); return <td key={k} className={r ? 'res' : 'none'} style={r ? { color: gradeColor(r.pct) } : undefined}>{r ? `${r.pct} %` : '–'}</td>; }
                return <td key={k} className="pts">{manualOf(k).values[s.id] ?? ''}</td>;
              })}
              {Array.from({ length: blank }, (_, i) => <td key={`b${i}`} />)}
            </tr>
          ); })}
        </tbody>
        <tfoot><tr>
          <td /><td className="left"><b>Povprečje{minPct != null ? ' izpisanih' : classOf ? ' generacije' : ' razreda'}</b></td>{classOf && <td />}
          <td className="res" style={{ color: tint(classAvg), borderRight: SEP }}>{fmt(classAvg)}</td>
          {keys.map(k => {
            if (k.startsWith('q:')) {
              const c = quizOf(k);
              const v = shown.map(st => resOf(c, st)?.pct).filter((n): n is number => n != null);
              const p = v.length ? ceilPct(v.reduce((t, x) => t + x, 0) / v.length) : null;
              return <td key={k} className="avg" style={p == null ? undefined : { color: gradeColor(p), fontWeight: 700 }}>{p == null ? '–' : `${p} %`}</td>;
            }
            if (k.startsWith('m:')) {
              const m = manualOf(k);
              const isPct = pctCols.includes(m);
              const nums = shown.map(x => (isPct ? pctOf(m.values[x.id]) : numVal(m.values[x.id]))).filter((n): n is number => n != null);
              const a = nums.length ? nums.reduce((x, y) => x + y, 0) / nums.length : null;
              return <td key={k} className="avg" style={isPct && a != null ? { color: tint(a), fontWeight: 700 } : undefined}>{a == null ? '' : isPct ? fmt(a) : formatNumber(Math.round(a * 100) / 100)}</td>;
            }
            return <td key={k} />;
          })}
          {Array.from({ length: blank }, (_, i) => <td key={`b${i}`} />)}
        </tr></tfoot>
      </table>
    </div>
  );
}
