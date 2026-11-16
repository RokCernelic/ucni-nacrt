'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRoster, parseRoster, rosterToText } from '@/hooks/useRoster';
import StudentHistoryDialog from '@/components/quiz/StudentHistoryDialog';
import { sortByLastName } from '@/lib/names';
import { genderStyle } from '@/lib/genderColors';
import { useQuizLibrary } from '@/hooks/useQuizLibrary';
import { loadClassHistory, participated, type QuizSession } from '@/lib/quiz/sessionApi';
import { scoreAnswers } from '@/lib/quiz/scoring';
import { ceilPct, gradeColor, formatNumber } from '@/lib/quiz/format';

export default function RosterEditor({ classId, className }: { classId: string; className: string }) {
  const { students, save } = useRoster(classId);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { setText(rosterToText(students)); }, [students]);

  const parsed = parseRoster(text);
  const m = parsed.filter(s => s.gender === 'M').length;
  const z = parsed.filter(s => s.gender === 'Ž').length;

  // Ob shranjevanju iz besedila ohrani vse podatke obstoječih učencev (id, PIN, oznake)
  // — ujemanje po imenu; spremenita se le ime in spol. Tako ostanejo razporedi in PIN-i.
  const handleSave = () => {
    const prevByName = new Map(students.map(s => [s.name.trim().toLowerCase(), s]));
    const merged = parseRoster(text).map(p => {
      const prev = prevByName.get(p.name.trim().toLowerCase());
      return prev ? { ...prev, name: p.name, gender: p.gender } : p;
    });
    save(merged);
    setSaved(true);
  };

  const missingPins = students.some(s => !s.pin);
  // pravila sedežnega reda za enega učenca se urejajo v oknu (gumb 🪑)
  const [seatFor, setSeatFor] = useState<string | null>(null);
  const seatRulesText = (st: (typeof students)[number]) => [
    st.frontRow && 'prva vrsta', st.nextToBoy && 'ob fantu', st.apartFrom?.length && `ne ob: ${students.find(x => x.id === st.apartFrom![0])?.name ?? '?'}`,
  ].filter(Boolean).join(' · ');

  // rezultati kvizov/testov tega razreda: en stolpec na izvedbo (z vsaj enim sodelujočim), od najstarejše
  const lib = useQuizLibrary();
  const [history, setHistory] = useState<Awaited<ReturnType<typeof loadClassHistory>> | null>(null);
  useEffect(() => {
    let alive = true;
    loadClassHistory(classId).then(h => { if (alive) setHistory(h); }).catch(() => { /* brez prijave / brez povezave: brez stolpcev */ });
    return () => { alive = false; };
  }, [classId]);
  const quizCols = (() => {
    if (!history) return [] as { s: QuizSession; title: string; res: Map<string, { pct: number; pts: number; max: number }> }[];
    return history.sessions.map(s => {
      const by = new Map<string, Record<string, string>>();
      for (const a of history.answersBySession.get(s.id) ?? []) by.set(a.student_id, { ...(by.get(a.student_id) ?? {}), [a.question_id]: a.value });
      const res = new Map<string, { pct: number; pts: number; max: number }>();
      for (const st of (history.studentsBySession.get(s.id) ?? []).filter(participated)) {
        const sc = scoreAnswers(s.quiz, by.get(st.student_id) ?? {});
        res.set(st.student_id, { pct: ceilPct(sc.percent), pts: sc.points, max: sc.maxPoints });
      }
      return { s, title: lib.quizzes.find(q => q.id === s.quiz_id)?.title || s.quiz_title, res };
    }).filter(c => c.res.size > 0);
  })();

  // razvrščanje seznama s klikom na ime stolpca (ponovni klik obrne smer)
  type SortKey = 'name' | 'gender' | 'pin' | 'seat' | `q:${string}`;
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const clickSort = (key: SortKey) => setSort(p => (p.key === key ? { key, dir: (p.dir === 1 ? -1 : 1) } : { key, dir: 1 }));
  const nameOf = (id?: string) => students.find(x => x.id === id)?.name ?? '';
  const sortedStudents = (() => {
    const base = sortByLastName(students); // pri enakih vrednostih po priimku
    const val = (st: (typeof students)[number]): string | number => {
      switch (sort.key) {
        case 'gender': return st.gender ?? '~';
        case 'pin': return st.pin ?? '~';
        case 'seat': return -((st.frontRow ? 4 : 0) + (st.nextToBoy ? 2 : 0) + (st.apartFrom?.length ? 1 : 0));
        default: {
          const r = quizCols.find(c => `q:${c.s.id}` === sort.key)?.res.get(st.id);
          return r ? -r.pct : 1; // najboljši najprej, brez rezultata na konec
        }
      }
    };
    if (sort.key === 'name') return sort.dir === 1 ? base : [...base].reverse();
    return base.map((st, i) => ({ st, i })).sort((a, b) => {
      const va = val(a.st), vb = val(b.st);
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'sl');
      return c * sort.dir || a.i - b.i;
    }).map(x => x.st);
  })();
  const W = { gender: 44, pin: 52, hist: 38, seat: 96, quiz: 72 };
  const TH: React.CSSProperties = { position: 'sticky', top: 0, background: '#eef1ec', borderBottom: '2px solid #b9c4ba', borderRight: '1px solid #d6ddd6', padding: '7px 8px',
    fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#5f6b63', whiteSpace: 'nowrap', textAlign: 'center', userSelect: 'none' };
  const TD: React.CSSProperties = { borderBottom: '1px solid', borderRight: '1px solid', padding: '5px 8px', verticalAlign: 'middle' };
  const th = (k: SortKey, label: string, width?: number, align?: 'left' | 'center' | 'right', title?: string) => (
    <th key={k} onClick={() => clickSort(k)} title={title ?? `Razvrsti po stolpcu »${label}«`}
      style={{ ...TH, width, textAlign: align ?? 'left', cursor: 'pointer', color: sort.key === k ? 'var(--forest)' : '#5f6b63' }}>
      {label}{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  // tisk seznama: izbor stolpcev; med tiskom je viden le .print-roster (globals.css, html.printing-roster)
  const [printSel, setPrintSel] = useState({ pin: false, rules: false, quizzes: true, blank: 0 });
  const [printOpts, setPrintOpts] = useState<typeof printSel | null>(null);
  const printRoster = () => {
    setPrintOpts(printSel);
    const root = document.documentElement;
    const done = () => { root.classList.remove('printing-roster'); window.removeEventListener('afterprint', done); setPrintOpts(null); };
    setTimeout(() => {
      root.classList.add('printing-roster');
      window.addEventListener('afterprint', done);
      window.print();
    }, 60);
  };
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);

  // Popravek imena na mestu: ohrani id, PIN in vse oznake (besedilno polje bi ga obravnavalo kot novega učenca).
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renameStudent = (id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    save(students.map(s => (s.id === id ? { ...s, name: clean } : s)));
  };

  // Listki s PIN-i se natisnejo neposredno s te strani (brez pojavnega okna, ki ga brskalniki radi blokirajo):
  // med tiskom je viden le ta element, vse ostalo je skrito (globals.css, html.printing-pins).
  const printPins = () => {
    const root = document.documentElement;
    const done = () => { root.classList.remove('printing-pins'); window.removeEventListener('afterprint', done); };
    root.classList.add('printing-pins');
    window.addEventListener('afterprint', done);
    window.print();
  };

  const toggleFront = (id: string) =>
    save(students.map(s => (s.id === id ? { ...s, frontRow: !s.frontRow } : s)));
  const toggleNextToBoy = (id: string) =>
    save(students.map(s => (s.id === id ? { ...s, nextToBoy: !s.nextToBoy } : s)));

  // Pravilo »ne ob …«: simetrično (nastavitev pri enem učencu velja tudi za drugega); en partner na učenca.
  const setApart = (id: string, otherId: string) =>
    save(students.map(s => {
      const had = students.find(x => x.id === id)?.apartFrom ?? [];
      if (s.id === id) return { ...s, apartFrom: otherId ? [otherId] : [] };
      if (had.includes(s.id)) return { ...s, apartFrom: (s.apartFrom ?? []).filter(x => x !== id) };
      if (s.id === otherId) return { ...s, apartFrom: [...new Set([...(s.apartFrom ?? []), id])] };
      return s;
    }));

  return (
    <div>
      {/* Seznam shranjenih učencev z oznako »prva vrsta« */}
      {students.length > 0 && (
        <div style={{ marginTop: '14px' }}>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
            <b>🪑 Sedež</b> — pravila sedežnega reda (1↓ prva vrsta, 👦 ob fantu, ↔ ne ob …); klik odpre urejanje. Zelen gumb = učenec ima pravila.
            <br /><b>PIN</b> — 4-mestna številka, s katero se učenec prijavi v kviz na iPadu. Dodeli se enkrat in se ne spreminja.
            <br /><b>✎</b> — tipkarske napake v imenu popravi tukaj, ne v besedilnem polju zgoraj (tam bi učenec dobil nov PIN).
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
            <button onClick={printRoster}
              style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '7px 14px', cursor: 'pointer' }}>
              🖨 Natisni seznam
            </button>
            <span style={{ display: 'inline-flex', gap: '10px', alignItems: 'center', fontSize: '12px', color: 'var(--muted)', flexWrap: 'wrap' }}>
              {([['pin', 'PIN'], ['rules', 'pravila sedenja'], ['quizzes', 'rezultati kvizov']] as const).map(([k, label]) => (
                <label key={k} style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={printSel[k]} onChange={e => setPrintSel(p => ({ ...p, [k]: e.target.checked }))} />{label}
                </label>
              ))}
              <label style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }} title="Prazni stolpci za ročne zapiske (npr. ocene, prisotnost)">
                prazni stolpci
                <input type="number" min={0} max={20} value={printSel.blank} onChange={e => setPrintSel(p => ({ ...p, blank: Math.max(0, Math.min(20, Number(e.target.value) || 0)) }))}
                  style={{ width: '46px', fontSize: '12px', padding: '2px 4px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)' }} />
              </label>
            </span>
            <span style={{ flex: 1 }} />
            {missingPins ? (
              <button onClick={() => save(students)}
                style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '7px 14px', cursor: 'pointer' }}>
                Dodeli PIN-e za kvize
              </button>
            ) : (
              <button onClick={printPins}
                style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, color: 'var(--forest)', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '7px 14px', cursor: 'pointer' }}>
                🖨 Natisni PIN-e (listki)
              </button>
            )}
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #cfd6cf', borderRadius: 'var(--r-md)', background: '#fff' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={TH}>#</th>
                {th('name', 'Učenec', undefined, 'left', 'Razvrsti po priimku')}
                {th('gender', 'Spol', W.gender, 'center')}
                {th('pin', 'PIN', W.pin, 'center')}
                <th style={{ ...TH, width: W.hist }} title="Zgodovina kvizov">📊</th>
                {th('seat', 'Sedež', W.seat, 'center', 'Pravila sedežnega reda — klik razvrsti (učenci s pravili na vrh)')}
                {quizCols.map(c => (
                  <th key={c.s.id} onClick={() => clickSort(`q:${c.s.id}`)}
                    title={`${c.title}\n${new Date(c.s.created_at).toLocaleString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${c.s.paper ? 'natisnjeno' : 'v živo'}\nKlik: razvrsti po rezultatu`}
                    style={{ ...TH, width: W.quiz, maxWidth: W.quiz, textAlign: 'center', cursor: 'pointer', fontSize: '10px', textTransform: 'none', letterSpacing: 0, lineHeight: 1.2,
                      color: sort.key === `q:${c.s.id}` ? 'var(--forest)' : '#5f6b63' }}>
                    <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{c.title}</span>
                    <span style={{ fontWeight: 500 }}>{new Date(c.s.created_at).toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric' })}{sort.key === `q:${c.s.id}` ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
            {sortedStudents.map((s, idx) => { const gs = genderStyle(s.gender); const td: React.CSSProperties = { ...TD, background: gs.bg, borderColor: gs.border }; return (
              <tr key={s.id}>
                <td style={{ ...td, width: 30, textAlign: 'right', color: gs.color, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</td>
                <td style={{ ...td, minWidth: 180 }}>
                {renamingId === s.id ? (
                  <input autoFocus defaultValue={s.name}
                    onBlur={e => { renameStudent(s.id, e.currentTarget.value); setRenamingId(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenamingId(null); }}
                    style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)', border: '1px solid var(--forest)', borderRadius: 'var(--r-sm)', padding: '3px 6px' }} />
                ) : (
                  <span style={{ fontWeight: 600, color: gs.color, whiteSpace: 'nowrap' }}>
                    {s.name}
                    <button onClick={() => setRenamingId(s.id)} title="Popravi ime (PIN, sedežni red in napredek ostanejo)"
                      style={{ marginLeft: '6px', background: 'none', border: 'none', cursor: 'pointer', color: gs.color, opacity: 0.6, fontSize: '12px', padding: '0 2px' }}>✎</button>
                  </span>
                )}
                </td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: gs.color }}>{s.gender || '—'}</td>
                <td title="PIN za kviz" style={{ ...td, textAlign: 'center', fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em', color: s.pin ? 'var(--ink)' : 'var(--muted)' }}>{s.pin ?? '—'}</td>
                <td style={{ ...td, textAlign: 'center', padding: '2px 4px' }}>
                  {s.pin && (
                    <button onClick={() => setHistoryFor({ id: s.id, name: s.name })} title="Zgodovina kvizov"
                      style={{ fontSize: '12px', background: 'rgba(255,255,255,0.7)', border: `1px solid ${gs.border}`, borderRadius: 'var(--r-sm)', padding: '2px 6px', cursor: 'pointer' }}>📊</button>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'center', padding: '2px 4px', whiteSpace: 'nowrap' }}>
                  {(() => { const n = (s.frontRow ? 1 : 0) + (s.nextToBoy ? 1 : 0) + (s.apartFrom?.length ? 1 : 0); const tip = seatRulesText(s) || 'Brez pravil — klik za urejanje'; return (
                    <button onClick={() => setSeatFor(s.id)} title={tip}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: 'var(--r-sm)', padding: '2px 8px',
                        color: n ? '#fff' : gs.color, background: n ? 'var(--forest)' : 'rgba(255,255,255,0.6)', border: `1px solid ${n ? 'var(--forest)' : gs.border}` }}>
                      <span style={{ fontSize: '14px' }}>🪑</span>
                      {s.frontRow && <span title="Prva vrsta">1↓</span>}
                      {s.nextToBoy && <span title="Ob fantu">👦</span>}
                      {!!s.apartFrom?.length && <span title={`Ne ob: ${nameOf(s.apartFrom[0])}`}>↔</span>}
                    </button>
                  ); })()}
                </td>
                {quizCols.map(c => { const r = c.res.get(s.id); return (
                  <td key={c.s.id} style={{ ...td, textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {r ? (
                      <a href={`/kvizi/statistika?s=${c.s.id}`} title={`${c.title}: ${formatNumber(r.pts)} / ${formatNumber(r.max)} točk`} style={{ color: gradeColor(r.pct), textDecoration: 'none' }}>{r.pct} %</a>
                    ) : <span title={`${c.title}: ni sodeloval`} style={{ color: 'var(--muted)', fontWeight: 400 }}>–</span>}
                  </td>
                ); })}
              </tr>
            ); })}
            </tbody>
          </table>
          </div>
        </div>
      )}
      {/* Seznam za tisk (Natisni seznam): na zaslonu skrit, ob tisku edini viden */}
      {printOpts && typeof document !== 'undefined' && createPortal(
        <div className="print-roster" aria-hidden>
          {(printOpts.quizzes && quizCols.length > 2) || (printOpts.rules && printOpts.quizzes && quizCols.length) ? <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style> : <style>{'@page { size: A4 portrait; margin: 12mm; }'}</style>}
          <div className="pr-head">
            <div><div className="pr-cls">{className}</div><div className="pr-title">Seznam učencev</div></div>
            <div className="pr-meta">{students.length} učencev · {students.filter(x => x.gender === 'Ž').length} Ž / {students.filter(x => x.gender === 'M').length} M<br />{new Date().toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <table className="pr-table">
            <thead>
              <tr>
                <th className="num">#</th><th className="left">Učenec</th><th>Spol</th>
                {printOpts.pin && <th>PIN</th>}
                {printOpts.rules && <th className="left">Sedežni red</th>}
                {printOpts.quizzes && quizCols.map(c => <th key={c.s.id} className="quiz">{c.title}<br /><span>{new Date(c.s.created_at).toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric', year: '2-digit' })}</span></th>)}
                {printOpts.blank > 0 && Array.from({ length: printOpts.blank }, (_, i) => <th key={`b${i}`} className="blank" />)}
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map((s, idx) => { const gs = genderStyle(s.gender); return (
                <tr key={s.id} style={{ background: gs.bg }}>
                  <td className="num" style={{ color: gs.color }}>{idx + 1}</td>
                  <td className="left name" style={{ color: gs.color }}>{s.name}</td>
                  <td style={{ color: gs.color }}>{s.gender || '—'}</td>
                  {printOpts.pin && <td className="pin">{s.pin ?? '—'}</td>}
                  {printOpts.rules && <td className="left" style={{ fontSize: '8.5pt' }}>{seatRulesText(s)}</td>}
                  {printOpts.quizzes && quizCols.map(c => { const r = c.res.get(s.id); return <td key={c.s.id} className="res" style={{ color: r ? gradeColor(r.pct) : '#999' }}>{r ? `${r.pct} %` : '–'}</td>; })}
                  {printOpts.blank > 0 && Array.from({ length: printOpts.blank }, (_, i) => <td key={`b${i}`} />)}
                </tr>
              ); })}
            </tbody>
          </table>
        </div>,
        document.body,
      )}
      {/* Vnos / urejanje seznama učencev (pod seznamom) */}
      <div style={{ marginTop: students.length > 0 ? '22px' : 0, borderTop: students.length > 0 ? '1px solid var(--hairline)' : 'none' }}>
      <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '14px 0 8px', lineHeight: 1.5 }}>
        Učenci — vsaka vrstica: <b>Ime Priimek, Ž/M</b>. Nato Shrani.
      </p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        placeholder={'Ana Novak, Ž\nJan Kos, M\nEva Horvat, Ž'}
        rows={9}
        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-sans)', fontSize: '13px', lineHeight: 1.6, color: 'var(--ink)', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '10px 12px', outline: 'none', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
        <button
          onClick={handleSave}
          style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '8px 16px', cursor: 'pointer' }}>
          Shrani učence
        </button>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          {parsed.length} učencev{parsed.length ? ` · ${z} Ž / ${m} M` : ''}
        </span>
        {saved && <span style={{ fontSize: '12px', color: 'var(--green-ok)' }}>Shranjeno ✓</span>}
      </div>
      </div>

      {seatFor && (() => { const st = students.find(x => x.id === seatFor); if (!st) return null; const gs = genderStyle(st.gender); return (
        <div onClick={() => setSeatFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,25,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 'var(--r-md)', boxShadow: '0 12px 40px rgba(0,0,0,0.2)', width: '100%', maxWidth: '420px', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>
            <div style={{ background: gs.bg, borderBottom: `1px solid ${gs.border}`, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '22px' }}>🪑</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Sedežni red</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: gs.color }}>{st.name}</div>
              </div>
              <button onClick={() => setSeatFor(null)} title="Zapri" style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)' }}>×</button>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!st.frontRow} onChange={() => toggleFront(st.id)} style={{ marginTop: '3px' }} />
                <span><b>1↓ Prva vrsta</b><br /><span style={{ color: 'var(--muted)', fontSize: '12px' }}>Vedno sedi v prvi vrsti (pri tabli), znotraj nje naključno.</span></span>
              </label>
              <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!st.nextToBoy} onChange={() => toggleNextToBoy(st.id)} style={{ marginTop: '3px' }} />
                <span><b>👦 Ob fantu</b><br /><span style={{ color: 'var(--muted)', fontSize: '12px' }}>Ima vedno vsaj enega soseda fanta.</span></span>
              </label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ width: '13px' }} />
                <span style={{ flex: 1 }}><b>↔ Ne sme sedeti ob</b><br /><span style={{ color: 'var(--muted)', fontSize: '12px' }}>V isti vrsti vsaj 3 sedeži razmaka, sicer vsaj ena prazna vrsta vmes. Velja za oba.</span>
                  <select value={st.apartFrom?.[0] ?? ''} onChange={e => setApart(st.id, e.target.value)}
                    style={{ display: 'block', marginTop: '6px', width: '100%', fontFamily: 'var(--font-sans)', fontSize: '13px', padding: '5px 6px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)' }}>
                    <option value="">— nihče —</option>
                    {sortByLastName(students).filter(o => o.id !== st.id).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </span>
              </div>
            </div>
            <div style={{ padding: '10px 18px 16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setSeatFor(null)} style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '8px 18px', cursor: 'pointer' }}>Končano</button>
            </div>
          </div>
        </div>
      ); })()}
      {historyFor && <StudentHistoryDialog studentId={historyFor.id} studentName={historyFor.name} onClose={() => setHistoryFor(null)} />}
      {typeof document !== 'undefined' && createPortal(
        <div className="print-pins" aria-hidden>
          <div className="print-pins-grid">
            {sortByLastName(students).map(st => (
              <div key={st.id} className="print-pins-slip">
                <div className="cls">{className}</div>
                <div className="name">{st.name}</div>
                <div className="pin">{st.pin ?? '—'}</div>
                <div className="hint">PIN za kviz</div>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
