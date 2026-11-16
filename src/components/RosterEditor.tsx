'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRoster, parseRoster, rosterToText } from '@/hooks/useRoster';
import { sortByLastName } from '@/lib/names';
import { genderStyle as baseGenderStyle } from '@/lib/genderColors';
import { seatColors } from '@/lib/schoolColor';
import { useQuizLibrary } from '@/hooks/useQuizLibrary';
import { loadClassHistory, participated, type QuizSession } from '@/lib/quiz/sessionApi';
import { scoreAnswers } from '@/lib/quiz/scoring';
import { ceilPct, gradeColor, formatNumber } from '@/lib/quiz/format';

export default function RosterEditor({ classId, className, shade }: { classId: string; className: string; /** odtenek šole (kot pri sedežnem redu) */ shade?: number }) {
  // barve vrstic kot sedeži v sedežnem redu tega razreda (vsaka šola svoj par barv)
  const genderStyle = (g: string | null | undefined) => seatColors(g ?? '', shade) ?? baseGenderStyle(g);
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
      if (!prev) return p;
      const { no: _old, ...rest } = prev; // eslint-disable-line @typescript-eslint/no-unused-vars
      return { ...rest, name: p.name, gender: p.gender, ...(p.no != null ? { no: p.no } : {}) };
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
  type R = { pct: number; pts: number; max: number; sid: string };
  const normName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
  // rezultat učenca v izvedbi: po id-ju iz seznama, sicer po imenu (npr. če je bil seznam ponovno vnesen in so id-ji novi)
  const resOf = (c: { res: Map<string, R>; byName: Map<string, R> }, st: { id: string; name: string }) => c.res.get(st.id) ?? c.byName.get(normName(st.name));
  const quizCols = (() => {
    if (!history) return [] as { s: QuizSession; title: string; res: Map<string, R>; byName: Map<string, R> }[];
    return history.sessions.map(s => {
      const by = new Map<string, Record<string, string>>();
      for (const a of history.answersBySession.get(s.id) ?? []) by.set(a.student_id, { ...(by.get(a.student_id) ?? {}), [a.question_id]: a.value });
      const res = new Map<string, R>();
      const byName = new Map<string, R>();
      for (const st of (history.studentsBySession.get(s.id) ?? []).filter(participated)) {
        const sc = scoreAnswers(s.quiz, by.get(st.student_id) ?? {});
        const r: R = { pct: ceilPct(sc.percent), pts: sc.points, max: sc.maxPoints, sid: st.student_id };
        res.set(st.student_id, r);
        byName.set(normName(st.name), r);
      }
      return { s, title: lib.quizzes.find(q => q.id === s.quiz_id)?.title || s.quiz_title, res, byName };
    }).filter(c => c.res.size > 0);
  })();

  // zaporedna številka: podana v seznamu (»Ime Priimek, M, 12«), sicer mesto po priimku
  const byLast = sortByLastName(students);
  const numberOf = (st: (typeof students)[number]) => st.no ?? byLast.findIndex(x => x.id === st.id) + 1;
  const nameOf = (id?: string) => students.find(x => x.id === id)?.name ?? '';

  // ročni stolpci (poimenuje jih učitelj, vrednosti vpisuje sam) in lasten vrstni red stolpcev — za vsak razred posebej
  type ManualCol = { id: string; name: string; values: Record<string, string> };
  type ColCfg = { manual: ManualCol[]; order: string[]; hidden?: string[] };
  const cfgKey = `ucni-nacrt-rostercols-${classId}`;
  const [cfg, setCfg] = useState<ColCfg>(() => {
    try { const r = typeof window !== 'undefined' ? localStorage.getItem(cfgKey) : null; const v = r ? JSON.parse(r) : null; return { manual: v?.manual ?? [], order: v?.order ?? [], hidden: v?.hidden ?? [] }; }
    catch { return { manual: [], order: [] }; }
  });
  const saveCfg = (next: ColCfg) => {
    setCfg(next);
    try { localStorage.setItem(cfgKey, JSON.stringify(next)); window.dispatchEvent(new Event('ucni-nacrt-changed')); } catch { /* ignore */ }
  };
  const addManual = () => {
    const name = prompt('Ime novega stolpca (npr. Ocena 1, Domača naloga, Prisotnost):')?.trim();
    if (!name) return;
    saveCfg({ ...cfg, manual: [...cfg.manual, { id: crypto.randomUUID().slice(0, 8), name, values: {} }] });
  };
  const renameManual = (id: string) => {
    const m = cfg.manual.find(x => x.id === id); if (!m) return;
    const name = prompt('Novo ime stolpca:', m.name)?.trim();
    if (!name || name === m.name) return;
    saveCfg({ ...cfg, manual: cfg.manual.map(x => (x.id === id ? { ...x, name } : x)) });
  };
  const removeManual = (id: string) => {
    const m = cfg.manual.find(x => x.id === id); if (!m) return;
    const n = Object.values(m.values).filter(v => v.trim()).length;
    if (!confirm(`Izbrišem stolpec »${m.name}«${n ? ` z ${n} vpisanimi vrednostmi` : ''}?\n\nTega ni mogoče razveljaviti.`)) return;
    saveCfg({ ...cfg, manual: cfg.manual.filter(x => x.id !== id), order: cfg.order.filter(k => k !== `m:${id}`), hidden: (cfg.hidden ?? []).filter(k => k !== `m:${id}`) });
  };
  const setManualValue = (id: string, studentId: string, value: string) => {
    const m = cfg.manual.find(x => x.id === id); if (!m || (m.values[studentId] ?? '') === value) return;
    const values = { ...m.values }; if (value.trim()) values[studentId] = value; else delete values[studentId];
    saveCfg({ ...cfg, manual: cfg.manual.map(x => (x.id === id ? { ...x, values } : x)) });
  };
  const numVal = (v: string | undefined) => { if (!v) return null; const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) && /^\s*[-+]?\d+([.,]\d+)?\s*$/.test(v) ? n : null; };

  // vrstni red stolpcev: shranjeni vrstni red, novi stolpci (nov kviz, nov ročni stolpec) na konec
  const defaultKeys = ['gender', 'pin', 'seat', ...quizCols.map(c => `q:${c.s.id}`), ...cfg.manual.map(m => `m:${m.id}`)];
  const colKeys = [...cfg.order.filter(k => defaultKeys.includes(k)), ...defaultKeys.filter(k => !cfg.order.includes(k))];
  const hidden = new Set(cfg.hidden ?? []);
  const visibleKeys = colKeys.filter(k => !hidden.has(k));
  const toggleHidden = (k: string) => saveCfg({ ...cfg, hidden: hidden.has(k) ? [...hidden].filter(x => x !== k) : [...hidden, k] });
  const colLabel = (k: string) => k === 'gender' ? 'Spol' : k === 'pin' ? 'PIN' : k === 'seat' ? 'Sedež (pravila)'
    : k.startsWith('q:') ? (() => { const c = quizCols.find(c => `q:${c.s.id}` === k); return c ? `${c.title} (${dateShort(c.s.created_at)})` : k; })()
    : cfg.manual.find(m => `m:${m.id}` === k)?.name ?? k;
  const [colsMenu, setColsMenu] = useState(false);
  // »oko«: poudari enega učenca, ostali so zamegljeni (npr. ko učencu na projekciji pokažeš njegove podatke)
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocusId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusId]);
  const customOrder = cfg.order.length > 0 && colKeys.some((k, i) => k !== defaultKeys[i]);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const moveCol = (from: string, to: string) => {
    if (from === to) return;
    const list = colKeys.filter(k => k !== from);
    const fromI = colKeys.indexOf(from), toI = colKeys.indexOf(to);
    const at = list.indexOf(to) + (fromI < toI ? 1 : 0);
    list.splice(at, 0, from);
    saveCfg({ ...cfg, order: list });
  };

  // razvrščanje seznama s klikom na ime stolpca (ponovni klik obrne smer)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const clickSort = (key: string) => setSort(p => (p.key === key ? { key, dir: (p.dir === 1 ? -1 : 1) } : { key, dir: 1 }));
  const sortValue = (key: string, st: (typeof students)[number]): string | number => {
    if (key === 'gender') return st.gender || '~';
    if (key === 'pin') return st.pin ?? '~';
    if (key === 'seat') return -((st.frontRow ? 4 : 0) + (st.nextToBoy ? 2 : 0) + (st.apartFrom?.length ? 1 : 0));
    if (key.startsWith('q:')) { const c = quizCols.find(c => `q:${c.s.id}` === key); const r = c ? resOf(c, st) : undefined; return r ? -r.pct : 1; } // najboljši najprej
    if (key.startsWith('m:')) {
      const v = cfg.manual.find(m => `m:${m.id}` === key)?.values[st.id] ?? '';
      const n = numVal(v);
      return n != null ? `0${String(1e6 - n * 100).padStart(12, '0')}` : v ? `1${v.toLowerCase()}` : '~'; // števila (večja najprej), nato besedilo, prazno na konec
    }
    return 0;
  };
  const sortedStudents = (() => {
    const base = sortByLastName(students); // pri enakih vrednostih po priimku
    if (sort.key === 'name') return sort.dir === 1 ? base : [...base].reverse();
    if (!colKeys.includes(sort.key)) return base;
    return base.map((st, i) => ({ st, i })).sort((a, b) => {
      const va = sortValue(sort.key, a.st), vb = sortValue(sort.key, b.st);
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'sl');
      return c * sort.dir || a.i - b.i;
    }).map(x => x.st);
  })();
  const W = { gender: 44, pin: 52, seat: 96, quiz: 72, manual: 96 };
  // oblika kot tabela »Učenec × vprašanje« v Rezultatih; vrstice v barvah sedežnega reda
  const TH: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 2, background: 'var(--canvas)', borderBottom: '1px solid var(--hairline)', padding: '8px 12px',
    fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, color: 'var(--muted)', whiteSpace: 'nowrap', textAlign: 'center', userSelect: 'none' };
  const TD: React.CSSProperties = { borderBottom: '1px solid var(--hairline)', padding: '7px 12px', verticalAlign: 'middle' };
  const DIV = '2px solid var(--hairline)';
  const arrow = (k: string) => (sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const dateShort = (iso: string) => new Date(iso).toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric' });

  /** Glava premakljivega stolpca: klik = razvrsti, povleci = premakni. */
  const headCell = (k: string) => {
    const active = sort.key === k;
    const base: React.CSSProperties = { ...TH, cursor: 'grab', fontWeight: active ? 700 : 500, color: active ? 'var(--forest)' : 'var(--muted)',
      boxShadow: overKey === k && dragKey && dragKey !== k ? `inset ${colKeys.indexOf(dragKey) < colKeys.indexOf(k) ? '-3px' : '3px'} 0 0 var(--forest)` : undefined,
      opacity: dragKey === k ? 0.4 : 1 };
    const dnd = {
      draggable: true,
      onDragStart: (e: React.DragEvent) => { setDragKey(k); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k); },
      onDragOver: (e: React.DragEvent) => { if (!dragKey) return; e.preventDefault(); if (overKey !== k) setOverKey(k); },
      onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragKey) moveCol(dragKey, k); setDragKey(null); setOverKey(null); },
      onDragEnd: () => { setDragKey(null); setOverKey(null); },
    };
    if (k === 'gender') return <th key={k} {...dnd} onClick={() => clickSort(k)} title="Razvrsti po spolu · povleci za premik" style={{ ...base, width: W.gender }}>Spol{arrow(k)}</th>;
    if (k === 'pin') return <th key={k} {...dnd} onClick={() => clickSort(k)} title="Razvrsti po PIN-u · povleci za premik" style={{ ...base, width: W.pin }}>PIN{arrow(k)}</th>;
    if (k === 'seat') return <th key={k} {...dnd} onClick={() => clickSort(k)} title="Pravila sedežnega reda — klik razvrsti (učenci s pravili na vrh) · povleci za premik" style={{ ...base, width: W.seat }}>Sedež{arrow(k)}</th>;
    if (k.startsWith('q:')) {
      const c = quizCols.find(c => `q:${c.s.id}` === k)!;
      return (
        <th key={k} {...dnd} onClick={() => clickSort(k)}
          title={`${c.title}\n${new Date(c.s.created_at).toLocaleString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${c.s.paper ? 'natisnjeno' : 'v živo'}\nKlik: razvrsti po rezultatu · povleci za premik`}
          style={{ ...base, width: W.quiz, maxWidth: W.quiz, minWidth: W.quiz, padding: '8px 6px', fontSize: '11px', lineHeight: 1.25, whiteSpace: 'normal', fontWeight: active ? 700 : 600 }}>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{c.title}</span>
          <span style={{ fontWeight: 500 }}>{dateShort(c.s.created_at)}{arrow(k)}</span>
        </th>
      );
    }
    const m = cfg.manual.find(m => `m:${m.id}` === k)!;
    return (
      <th key={k} {...dnd} onClick={() => clickSort(k)} title={`Ročni stolpec »${m.name}« — klik: razvrsti · povleci za premik`}
        style={{ ...base, minWidth: W.manual, padding: '8px 6px', fontSize: '11px', lineHeight: 1.25, whiteSpace: 'normal', fontWeight: active ? 700 : 600, background: '#f3f1ea' }}>
        <span style={{ display: 'block', wordBreak: 'break-word' }}>{m.name}{arrow(k)}</span>
        <span style={{ display: 'inline-flex', gap: '2px', marginTop: '2px' }}>
          <button onClick={e => { e.stopPropagation(); renameManual(m.id); }} title="Preimenuj stolpec" style={miniBtn}>✎</button>
          <button onClick={e => { e.stopPropagation(); removeManual(m.id); }} title="Izbriši stolpec" style={{ ...miniBtn, color: '#c0392b' }}>×</button>
        </span>
      </th>
    );
  };
  const miniBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--hairline)', borderRadius: '50%', width: '20px', height: '20px', fontSize: '11px', lineHeight: 1, cursor: 'pointer', color: 'var(--muted)', padding: 0 };

  /** Celica premakljivega stolpca za učenca. */
  const bodyCell = (k: string, s: (typeof students)[number], gs: ReturnType<typeof baseGenderStyle>, td: React.CSSProperties) => {
    if (k === 'gender') return <td key={k} style={{ ...td, textAlign: 'center', fontWeight: 600, color: gs.color }}>{s.gender || '—'}</td>;
    if (k === 'pin') return <td key={k} title="PIN za kviz" style={{ ...td, textAlign: 'center', fontWeight: 600, fontSize: '14px', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em', color: s.pin ? 'var(--ink)' : 'var(--muted)' }}>{s.pin ?? '—'}</td>;
    if (k === 'seat') {
      const n = (s.frontRow ? 1 : 0) + (s.nextToBoy ? 1 : 0) + (s.apartFrom?.length ? 1 : 0);
      return (
        <td key={k} style={{ ...td, textAlign: 'center', padding: '4px 8px', whiteSpace: 'nowrap' }}>
          <button onClick={() => setSeatFor(s.id)} title={seatRulesText(s) || 'Brez pravil — klik za urejanje'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: 'var(--r-sm)', padding: '2px 8px',
              color: n ? '#fff' : gs.color, background: n ? 'var(--forest)' : 'rgba(255,255,255,0.6)', border: `1px solid ${n ? 'var(--forest)' : gs.border}` }}>
            <span style={{ fontSize: '14px' }}>🪑</span>
            {s.frontRow && <span title="Prva vrsta">1↓</span>}
            {s.nextToBoy && <span title="Ob fantu">👦</span>}
            {!!s.apartFrom?.length && <span title={`Ne ob: ${nameOf(s.apartFrom[0])}`}>↔</span>}
          </button>
        </td>
      );
    }
    if (k.startsWith('q:')) {
      const c = quizCols.find(c => `q:${c.s.id}` === k)!;
      const r = resOf(c, s);
      return (
        <td key={k} style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: '15px', fontVariantNumeric: 'tabular-nums', padding: '7px 6px' }}>
          {r ? (
            <a href={c.s.paper ? `/r/${c.s.id}/${encodeURIComponent(r.sid)}` : `/kvizi/statistika?s=${c.s.id}`} target={c.s.paper ? '_blank' : undefined} rel="noopener"
              title={`${c.title}: ${formatNumber(r.pts)} / ${formatNumber(r.max)} točk — klik: ${c.s.paper ? 'rezultat učenca (kot pri QR kodi)' : 'rezultati izvedbe'}`} style={{ color: gradeColor(r.pct), textDecoration: 'none' }}>{r.pct} %</a>
          ) : <span title={`${c.title}: ni sodeloval`} style={{ color: 'var(--muted)', fontWeight: 400 }}>–</span>}
        </td>
      );
    }
    const m = cfg.manual.find(m => `m:${m.id}` === k)!;
    const v = m.values[s.id] ?? '';
    return (
      <td key={k} style={{ ...td, padding: '3px 4px', textAlign: 'center' }}>
        <input key={v} defaultValue={v} aria-label={`${m.name} — ${s.name}`}
          onBlur={e => setManualValue(m.id, s.id, e.currentTarget.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = v; e.currentTarget.blur(); } }}
          style={{ width: '100%', minWidth: '60px', boxSizing: 'border-box', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: '15px', fontWeight: 600, color: 'var(--ink)',
            background: 'rgba(255,255,255,0.55)', border: `1px solid ${gs.border}`, borderRadius: 'var(--r-sm)', padding: '4px 6px', outline: 'none' }} />
      </td>
    );
  };

  /** Celica v vrstici povprečja. */
  const footCell = (k: string) => {
    const st: React.CSSProperties = { textAlign: 'center', padding: '7px 6px', borderTop: DIV, background: '#f7f6f3', fontWeight: 700, fontSize: '13px' };
    if (k.startsWith('q:')) {
      const c = quizCols.find(c => `q:${c.s.id}` === k)!;
      const v = [...c.res.values()]; const p = v.length ? ceilPct(v.reduce((t, r) => t + r.pct, 0) / v.length) : null;
      return <td key={k} title={`${v.length} učencev`} style={{ ...st, color: p == null ? 'var(--muted)' : gradeColor(p) }}>{p == null ? '–' : `${p} %`}</td>;
    }
    if (k.startsWith('m:')) {
      const m = cfg.manual.find(m => `m:${m.id}` === k)!;
      const nums = students.map(x => numVal(m.values[x.id])).filter((n): n is number => n != null);
      return <td key={k} title={nums.length ? `povprečje ${nums.length} vpisanih števil` : undefined} style={{ ...st, color: 'var(--ink)' }}>{nums.length ? formatNumber(Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100) : ''}</td>;
    }
    return <td key={k} style={st} />;
  };

  // tisk seznama: izbor stolpcev; med tiskom je viden le .print-roster (globals.css, html.printing-roster)
  const [printSel, setPrintSel] = useState({ pin: false, rules: false, quizzes: true, manual: true, blank: 0 });
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

  // stolpci za tisk: isti vrstni red kot na zaslonu, le izbrane vrste
  const printKeys = printOpts ? visibleKeys.filter(k => k === 'gender' || (k === 'pin' && printOpts.pin) || (k === 'seat' && printOpts.rules)
    || (k.startsWith('q:') && printOpts.quizzes) || (k.startsWith('m:') && printOpts.manual)) : [];

  return (
    <div>
      {/* Seznam shranjenih učencev z oznako »prva vrsta« */}
      {students.length > 0 && (
        <div style={{ marginTop: '14px' }}>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
            <b>🪑 Sedež</b> — pravila sedežnega reda (1↓ prva vrsta, 👦 ob fantu, ↔ ne ob …); klik odpre urejanje. Zelen gumb = učenec ima pravila.
            <br /><b>PIN</b> — 4-mestna številka, s katero se učenec prijavi v kviz na iPadu. Dodeli se enkrat in se ne spreminja.
            <br /><b>Stolpci</b> — klik na ime stolpca razvrsti seznam; stolpec premakneš tako, da njegovo ime povlečeš levo ali desno; v meniju <b>Stolpci ▾</b> izbereš, kateri so vidni. <b>+ Ročni stolpec</b> doda stolpec za lastne vpise.
            <br /><b>👁</b> — pokaže samo izbranega učenca, ostali se zameglijo (npr. za pogovor z učencem ob projekciji); ponoven klik ali Esc vse spet pokaže.
            <br /><b>✎</b> — tipkarske napake v imenu popravi tukaj, ne v besedilnem polju zgoraj (tam bi učenec dobil nov PIN).
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
            <button onClick={printRoster}
              style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '7px 14px', cursor: 'pointer' }}>
              🖨 Natisni seznam
            </button>
            <span style={{ display: 'inline-flex', gap: '10px', alignItems: 'center', fontSize: '12px', color: 'var(--muted)', flexWrap: 'wrap' }}>
              {([['pin', 'PIN'], ['rules', 'pravila sedenja'], ['quizzes', 'rezultati kvizov'], ['manual', 'ročni stolpci']] as const).map(([k, label]) => (
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
            <span style={{ position: 'relative' }}>
              <button onClick={() => setColsMenu(o => !o)} title="Izberi, kateri stolpci so vidni"
                style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: 'var(--forest)', background: colsMenu ? 'var(--surface)' : 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '7px 12px', cursor: 'pointer' }}>
                Stolpci{hidden.size ? ` (${visibleKeys.length}/${colKeys.length})` : ''} ▾
              </button>
              {colsMenu && (<>
                <div onClick={() => setColsMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 21, background: '#fff', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  padding: '8px 0', minWidth: '240px', maxHeight: '60vh', overflowY: 'auto', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>
                  <div style={{ padding: '2px 14px 6px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Vidni stolpci</div>
                  {colKeys.map(k => (
                    <label key={k} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '5px 14px', cursor: 'pointer', color: 'var(--ink)' }}>
                      <input type="checkbox" checked={!hidden.has(k)} onChange={() => toggleHidden(k)} />
                      <span style={{ flex: 1 }}>{colLabel(k)}</span>
                    </label>
                  ))}
                  <div style={{ display: 'flex', gap: '6px', padding: '8px 14px 2px', borderTop: '1px solid var(--hairline)', marginTop: '6px' }}>
                    <button onClick={() => saveCfg({ ...cfg, hidden: [] })} style={{ fontSize: '12px', background: 'none', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '4px 10px', cursor: 'pointer', color: 'var(--forest)' }}>Pokaži vse</button>
                    <button onClick={() => saveCfg({ ...cfg, hidden: [...colKeys] })} style={{ fontSize: '12px', background: 'none', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '4px 10px', cursor: 'pointer', color: 'var(--muted)' }}>Skrij vse</button>
                  </div>
                </div>
              </>)}
            </span>
            <button onClick={addManual} title="Doda stolpec, ki ga poimenuješ sam in vanj vpisuješ (npr. ocene, domače naloge, prisotnost)"
              style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: 'var(--forest)', background: 'transparent', border: '1px solid var(--forest)', borderRadius: 'var(--r-sm)', padding: '7px 14px', cursor: 'pointer' }}>
              + Ročni stolpec
            </button>
            {customOrder && (
              <button onClick={() => saveCfg({ ...cfg, order: [] })} title="Stolpci spet v privzetem vrstnem redu"
                style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, color: 'var(--muted)', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '7px 12px', cursor: 'pointer' }}>
                ↺ Privzeti vrstni red
              </button>
            )}
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
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 140px)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', background: '#fff' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontFamily: 'var(--font-sans)', fontSize: '15px' }}>
            <thead>
              <tr>
                <th onClick={() => clickSort('name')} title="Razvrsti po priimku"
                  style={{ ...TH, textAlign: 'left', cursor: 'pointer', position: 'sticky', left: 0, zIndex: 3, borderRight: DIV, fontWeight: sort.key === 'name' ? 700 : 500, color: sort.key === 'name' ? 'var(--forest)' : 'var(--muted)' }}>
                  Učenec{arrow('name')}
                </th>
                {visibleKeys.map(headCell)}
              </tr>
            </thead>
            <tbody>
            {sortedStudents.map(s => { const gs = genderStyle(s.gender); const dim = !!focusId && focusId !== s.id;
              const td: React.CSSProperties = { ...TD, background: gs.bg, ...(dim ? { filter: 'blur(5px)', opacity: 0.45, pointerEvents: 'none', userSelect: 'none' } : {}), transition: 'filter .2s, opacity .2s' }; return (
              <tr key={s.id} aria-hidden={dim || undefined}>
                <td style={{ ...td, minWidth: 200, position: 'sticky', left: 0, zIndex: 1, whiteSpace: 'nowrap', borderRight: DIV }}>
                <button onClick={() => setFocusId(f => (f === s.id ? null : s.id))} title={focusId === s.id ? 'Prikaži vse učence (Esc)' : 'Prikaži samo tega učenca — ostali se zameglijo'}
                  style={{ pointerEvents: 'auto', marginRight: '6px', width: '26px', height: '26px', borderRadius: '50%', verticalAlign: 'middle', cursor: 'pointer', lineHeight: 1, padding: 0,
                    border: `1px solid ${focusId === s.id ? 'var(--forest)' : gs.border}`, background: focusId === s.id ? 'var(--forest)' : 'rgba(255,255,255,0.6)', color: focusId === s.id ? '#fff' : gs.color }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>
                </button>
                <span style={{ display: 'inline-block', width: '22px', fontSize: '12px', color: gs.color, opacity: 0.6, fontVariantNumeric: 'tabular-nums' }} title={s.no != null ? 'Zaporedna številka v razredu' : 'Zaporedna številka po priimku'}>{numberOf(s)}</span>
                {renamingId === s.id ? (
                  <input autoFocus defaultValue={s.name}
                    onBlur={e => { renameStudent(s.id, e.currentTarget.value); setRenamingId(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenamingId(null); }}
                    style={{ width: 'calc(100% - 22px)', boxSizing: 'border-box', fontFamily: 'var(--font-sans)', fontSize: '15px', color: 'var(--ink)', border: '1px solid var(--forest)', borderRadius: 'var(--r-sm)', padding: '3px 6px' }} />
                ) : (
                  <span style={{ fontWeight: 500, color: gs.color }}>
                    {s.name}
                    <button onClick={() => setRenamingId(s.id)} title="Popravi ime (PIN, sedežni red in napredek ostanejo)"
                      style={{ marginLeft: '8px', width: '24px', height: '24px', borderRadius: '50%', border: `1px solid ${gs.border}`, background: 'rgba(255,255,255,0.6)', color: gs.color, fontSize: '12px', lineHeight: 1, cursor: 'pointer', verticalAlign: 'middle' }}>✎</button>
                  </span>
                )}
                </td>
                {visibleKeys.map(k => bodyCell(k, s, gs, td))}
              </tr>
            ); })}
            {/* povprečje razreda po kvizih (le učenci, ki so sodelovali) in po ročnih stolpcih s števili */}
            {(quizCols.length > 0 || cfg.manual.length > 0) && (
              <tr style={focusId ? { filter: 'blur(5px)', opacity: 0.45 } : undefined}>
                <td style={{ position: 'sticky', left: 0, zIndex: 1, background: '#f7f6f3', padding: '7px 12px', borderTop: DIV, borderRight: DIV, whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--ink)' }}>Povprečje razreda</td>
                {visibleKeys.map(footCell)}
              </tr>
            )}
            </tbody>
          </table>
          </div>
        </div>
      )}
      {/* Seznam za tisk (Natisni seznam): na zaslonu skrit, ob tisku edini viden */}
      {printOpts && typeof document !== 'undefined' && createPortal(
        <div className="print-roster" aria-hidden>
          {printKeys.length + printOpts.blank > 7 ? <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style> : <style>{'@page { size: A4 portrait; margin: 12mm; }'}</style>}
          <div className="pr-head">
            <div><div className="pr-cls">{className}</div><div className="pr-title">Seznam učencev</div></div>
            <div className="pr-meta">{students.length} učencev · {students.filter(x => x.gender === 'Ž').length} Ž / {students.filter(x => x.gender === 'M').length} M<br />{new Date().toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <table className="pr-table">
            <thead>
              <tr>
                <th className="num">#</th><th className="left">Učenec</th>
                {printKeys.map(k => {
                  if (k === 'gender') return <th key={k}>Spol</th>;
                  if (k === 'pin') return <th key={k}>PIN</th>;
                  if (k === 'seat') return <th key={k} className="left">Sedežni red</th>;
                  if (k.startsWith('q:')) { const c = quizCols.find(c => `q:${c.s.id}` === k)!; return <th key={k} className="quiz">{c.title}<br /><span>{new Date(c.s.created_at).toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric', year: '2-digit' })}</span></th>; }
                  const m = cfg.manual.find(m => `m:${m.id}` === k)!; return <th key={k} className="quiz">{m.name}</th>;
                })}
                {printOpts.blank > 0 && Array.from({ length: printOpts.blank }, (_, i) => <th key={`b${i}`} className="blank" />)}
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map(s => { const gs = genderStyle(s.gender); return (
                <tr key={s.id} style={{ background: gs.bg }}>
                  <td className="num" style={{ color: gs.color }}>{numberOf(s)}</td>
                  <td className="left name" style={{ color: gs.color }}>{s.name}</td>
                  {printKeys.map(k => {
                    if (k === 'gender') return <td key={k} style={{ color: gs.color }}>{s.gender || '—'}</td>;
                    if (k === 'pin') return <td key={k} className="pin">{s.pin ?? '—'}</td>;
                    if (k === 'seat') return <td key={k} className="left" style={{ fontSize: '8.5pt' }}>{seatRulesText(s)}</td>;
                    if (k.startsWith('q:')) { const c = quizCols.find(c => `q:${c.s.id}` === k)!; const r = resOf(c, s); return <td key={k} className="res" style={{ color: r ? gradeColor(r.pct) : '#999' }}>{r ? `${r.pct} %` : '–'}</td>; }
                    const m = cfg.manual.find(m => `m:${m.id}` === k)!; return <td key={k} className="res">{m.values[s.id] ?? ''}</td>;
                  })}
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
        Učenci — vsaka vrstica: <b>Ime Priimek, Ž/M</b> ali z zaporedno številko <b>Ime Priimek, Ž/M, 12</b>. Nato Shrani.
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
