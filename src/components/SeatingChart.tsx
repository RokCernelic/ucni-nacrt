'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRoster, type Student } from '@/hooks/useRoster';
import { useSeating, activeSeats, shuffleInto, makeRng, emptyHistory, bumpHistory, type Seating } from '@/hooks/useSeating';
import { useRooms, type RoomPlan } from '@/hooks/useRooms';
import { useFixedSeats, fixedMapForDate } from '@/hooks/useFixedSeats';
import { formatLessonDate, type Lesson } from '@/data/timetable';

function genderStyle(g: string) {
  if (g === 'Ž') return { bg: '#fbe7ef', border: '#e589ac', color: '#a61e4d' };
  if (g === 'M') return { bg: '#e6f0f8', border: '#8fbfe0', color: '#1c5a86' };
  return { bg: 'var(--canvas)', border: 'var(--hairline)', color: 'var(--ink)' };
}

type Drag = { from: 'seat'; cell: string } | { from: 'pool'; studentId: string } | null;

/** Ročni razporedi po dnevih (kdo sedi kje). */
function useDayOverrides(classId?: string) {
  const key = classId ? `ucni-nacrt-seatdays-${classId}` : undefined;
  const [map, setMap] = useState<Record<string, Record<string, string>>>({});
  useEffect(() => {
    if (!key) { setMap({}); return; }
    try { const r = localStorage.getItem(key); setMap(r ? JSON.parse(r) : {}); } catch { setMap({}); }
  }, [key]);
  const setDay = (date: string, assign: Record<string, string> | null) => {
    setMap(prev => {
      const next = { ...prev };
      if (assign === null) delete next[date]; else next[date] = assign;
      if (key) { localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event('ucni-nacrt-changed')); }
      return next;
    });
  };
  return { map, setDay };
}

/** Ročni tloris po dnevih (prepiše tloris učilnice samo za tisti dan). */
function useDayLayouts(classId?: string) {
  const key = classId ? `ucni-nacrt-daylayout-${classId}` : undefined;
  const [map, setMap] = useState<Record<string, RoomPlan>>({});
  useEffect(() => {
    if (!key) { setMap({}); return; }
    try { const r = localStorage.getItem(key); setMap(r ? JSON.parse(r) : {}); } catch { setMap({}); }
  }, [key]);
  const setDayLayout = (date: string, plan: RoomPlan | null) => {
    setMap(prev => {
      const next = { ...prev };
      if (plan === null) delete next[date]; else next[date] = plan;
      if (key) { localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event('ucni-nacrt-changed')); }
      return next;
    });
  };
  return { map, setDayLayout };
}

/** Bralni izris mreže (za tisk naslednjega dne). */
function StaticSeatingGrid({ wrapClass, heading, contextLabel, dateISO, metaLine, layout, assign, studentById }: {
  wrapClass: string; heading: string; contextLabel?: string; dateISO: string; metaLine: string;
  layout: RoomPlan; assign: Record<string, string>; studentById: Map<string, Student>;
}) {
  const disabled = new Set(layout.disabled);
  return (
    <div className={wrapClass}>
      <div className="seating-head" style={{ marginBottom: '12px' }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', color: 'var(--ink)' }}>
          {heading}
          {contextLabel && <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--muted)', marginLeft: '10px' }}>{contextLabel}</span>}
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
          <span style={{ textTransform: 'capitalize' }}>{formatLessonDate(dateISO)}</span> · {metaLine}
        </div>
      </div>
      <div className="seating-scroll" style={{ overflowX: 'auto' }}>
        <div className="seating-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${layout.cols}, minmax(var(--seat-min, 84px), 1fr))`, gap: 'var(--seat-gap, 10px)', minWidth: `${layout.cols * 94}px`, maxWidth: '760px', margin: '0 auto' }}>
          {Array.from({ length: layout.rows }).flatMap((_, ri) => {
            const r = layout.rows - 1 - ri;
            return Array.from({ length: layout.cols }).map((_, c) => {
              const k = `${r}-${c}`;
              if (disabled.has(k)) return <div key={k} className="seating-cell" style={{ height: '76px' }} />;
              const stud = studentById.get(assign[k]);
              const gs = stud ? genderStyle(stud.gender) : { bg: 'var(--canvas)', border: 'var(--hairline)', color: 'var(--muted)' };
              return (
                <div key={k} className="seating-cell" style={{ position: 'relative', height: '76px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '4px 6px', border: `1.5px solid ${gs.border}`, background: gs.bg, color: gs.color, fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, lineHeight: 1.2, boxSizing: 'border-box' }}>
                  {stud?.frontRow && <span style={{ position: 'absolute', top: '3px', left: '4px', fontSize: '9px', fontWeight: 700, color: gs.color, opacity: 0.6 }}>1↓</span>}
                  {stud ? stud.name : ''}
                </div>
              );
            });
          })}
        </div>
      </div>
      <div className="seating-board" style={{ textAlign: 'center', margin: '14px auto 0', maxWidth: '640px', background: 'var(--forest)', color: '#fff', borderRadius: 'var(--r-sm)', padding: '8px', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Tabla</div>
    </div>
  );
}

export default function SeatingChart({ classId, className, contextLabel, lessons = [], totalHours }: {
  classId: string;
  className: string;
  contextLabel?: string;
  lessons?: Lesson[];
  /** skupno število predvidenih ur za ta razred (iz učnega načrta) — za prikaz »N/skupaj« */
  totalHours?: number;
}) {
  const { students } = useRoster(classId || undefined);
  const { seating, setSeating } = useSeating(classId || undefined);
  const { getPlan } = useRooms();
  const { map: dayMap, setDay } = useDayOverrides(classId || undefined);
  const { map: dayLayoutMap, setDayLayout } = useDayLayouts(classId || undefined);
  const { fixed, setFix, unfix } = useFixedSeats(classId || undefined);
  const [editSeats, setEditSeats] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const dragRef = useRef<Drag>(null);

  const hasDays = lessons.length > 0;

  useEffect(() => {
    if (!hasDays) return;
    const today = new Date().toISOString().slice(0, 10);
    let idx = lessons.findIndex(l => l.d >= today);
    if (idx < 0) idx = lessons.length - 1;
    setDayIndex(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, hasDays, lessons.length]);

  const lesson = hasDays ? lessons[Math.min(dayIndex, lessons.length - 1)] : null;

  useEffect(() => {
    if (!hasDays) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (editSeats || tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setDayIndex(i => Math.max(0, i - 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setDayIndex(i => Math.min(lessons.length - 1, i + 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasDays, lessons.length, editSeats]);

  const studentById = new Map(students.map(s => [s.id, s]));
  const allIds = students.map(s => s.id);
  const frontIds = students.filter(s => s.frontRow).map(s => s.id);
  const boyIds = students.filter(s => s.gender === 'M').map(s => s.id);
  const pairIds = students.filter(s => s.nextToBoy).map(s => s.id);

  // Tloris za dan: ročni prepis dneva → tloris učilnice (nastavitve) → rezerva (razred/privzeto).
  const fallbackPlan: RoomPlan = { rows: seating.rows, cols: seating.cols, disabled: seating.disabled };
  const resolveLayout = (dateISO?: string, room?: string): RoomPlan => {
    if (dateISO && dayLayoutMap[dateISO]) return dayLayoutMap[dateISO];
    const rp = getPlan(room);
    return rp ?? fallbackPlan;
  };

  const layout = hasDays ? resolveLayout(lesson?.d, lesson?.r) : fallbackPlan;
  const layoutS: Seating = { rows: layout.rows, cols: layout.cols, disabled: layout.disabled, assign: {} };
  const disabled = new Set(layout.disabled);
  const seatCount = activeSeats(layoutS).length;

  const curDate = lesson?.d ?? new Date().toISOString().slice(0, 10);
  const fixedMap = fixedMapForDate(fixed, curDate);
  const shuffleOpts = { boyIds, pairIds, fixed: fixedMap };

  const hasOverride = !!(lesson && dayMap[lesson.d]);
  const hasLayoutOverride = !!(lesson && dayLayoutMap[lesson.d]);

  // Razporedi vseh ur po vrsti: vsak samodejni dan upošteva, kje in s kom je kdo sedel na vseh
  // prejšnjih urah (ročni razporedi štejejo kot dejanski), da se sedeži in sosedje čim manj ponavljajo.
  const lessonsKey = lessons.map(l => `${l.d}@${l.r}`).join('|');
  const dayAssigns = useMemo(() => {
    if (!hasDays) return [];
    const history = emptyHistory();
    return lessons.map(l => {
      const lp = dayLayoutMap[l.d] ?? getPlan(l.r) ?? { rows: seating.rows, cols: seating.cols, disabled: seating.disabled };
      const lS: Seating = { rows: lp.rows, cols: lp.cols, disabled: lp.disabled, assign: {} };
      const ids = students.map(s => s.id);
      const actual = dayMap[l.d] ?? shuffleInto(lS, ids, students.filter(s => s.frontRow).map(s => s.id), makeRng(`${classId}|${l.d}`), {
        boyIds: students.filter(s => s.gender === 'M').map(s => s.id),
        pairIds: students.filter(s => s.nextToBoy).map(s => s.id),
        fixed: fixedMapForDate(fixed, l.d),
        history,
      });
      bumpHistory(history, actual);
      return actual;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDays, lessonsKey, dayMap, dayLayoutMap, getPlan, seating.rows, seating.cols, seating.disabled, fixed, students, classId]);

  const assign: Record<string, string> = hasDays
    ? (dayAssigns[Math.min(dayIndex, lessons.length - 1)] ?? {})
    : seating.assign;

  const seatedIds = new Set(Object.values(assign));
  const pool = students.filter(s => !seatedIds.has(s.id));

  // Tisk naslednjega dne (druga stran).
  const nextLesson = hasDays && dayIndex < lessons.length - 1 ? lessons[dayIndex + 1] : null;
  const nextData = nextLesson
    ? { lesson: nextLesson, layout: resolveLayout(nextLesson.d, nextLesson.r), assign: dayAssigns[dayIndex + 1], index: dayIndex + 1 }
    : null;

  const metaLine = (idx: number, room: string) => `${totalHours ? `${idx + 1}/${totalHours}` : `${idx + 1}. ura`} · učilnica ${room}`;

  // Zapisovanje razporeda (kdo kje) — dnevno ali klasično.
  const commitAssign = (next: Record<string, string>) => {
    if (hasDays && lesson) setDay(lesson.d, next);
    else setSeating({ ...seating, assign: next });
  };
  // Zapisovanje tlorisa — v dnevnem načinu kot ročni prepis dneva, sicer v postavitev razreda.
  const commitLayout = (next: RoomPlan) => {
    if (hasDays && lesson) setDayLayout(lesson.d, next);
    else setSeating({ ...seating, rows: next.rows, cols: next.cols, disabled: next.disabled });
  };

  const toggleSeat = (k: string) => {
    const dis = new Set(layout.disabled);
    if (dis.has(k)) dis.delete(k);
    else {
      dis.add(k);
      if (assign[k]) { const a = { ...assign }; delete a[k]; commitAssign(a); }
    }
    commitLayout({ rows: layout.rows, cols: layout.cols, disabled: [...dis] });
  };

  const setGrid = (rows: number, cols: number) => {
    const inGrid = (k: string) => { const [r, c] = k.split('-').map(Number); return r < rows && c < cols; };
    commitLayout({ rows, cols, disabled: layout.disabled.filter(inGrid) });
    if (hasOverride || !hasDays) {
      const a: Record<string, string> = {};
      for (const [k, v] of Object.entries(assign)) if (inGrid(k)) a[k] = v;
      commitAssign(a);
    }
  };

  const shuffle = () => {
    const history = emptyHistory();
    if (hasDays) for (let i = 0; i < dayIndex; i++) bumpHistory(history, dayAssigns[i]);
    commitAssign(shuffleInto(layoutS, allIds, frontIds, Math.random, { ...shuffleOpts, history }));
  };
  const clearAssign = () => commitAssign({});
  const resetToAuto = () => { if (lesson) setDay(lesson.d, null); };
  const resetDayLayout = () => { if (lesson) setDayLayout(lesson.d, null); };

  const toggleFix = (studentId: string, cell: string) => {
    if (hasDays && lesson && !dayMap[lesson.d]) setDay(lesson.d, assign);
    if (fixedMap[cell] === studentId) unfix(studentId);
    else setFix(studentId, cell, curDate);
  };

  const dropOnSeat = (target: string) => {
    const d = dragRef.current; dragRef.current = null;
    if (!d || disabled.has(target)) return;
    const a = { ...assign };
    if (d.from === 'seat') {
      const x = a[d.cell], y = a[target];
      if (y) a[d.cell] = y; else delete a[d.cell];
      if (x) a[target] = x; else delete a[target];
    } else {
      a[target] = d.studentId;
    }
    commitAssign(a);
  };
  const dropOnPool = () => {
    const d = dragRef.current; dragRef.current = null;
    if (!d || d.from !== 'seat') return;
    const a = { ...assign }; delete a[d.cell];
    commitAssign(a);
  };

  const btn = (active: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: active ? 600 : 500,
    color: active ? '#fff' : 'var(--forest)', background: active ? 'var(--forest)' : 'transparent',
    border: `1px solid ${active ? 'var(--forest)' : 'var(--hairline)'}`, borderRadius: 'var(--r-sm)',
    padding: '7px 14px', cursor: 'pointer',
  });
  const navBtn = (disabledBtn: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-sans)', fontSize: '18px', lineHeight: 1, fontWeight: 600,
    color: disabledBtn ? 'var(--hairline)' : 'var(--forest)', background: 'transparent',
    border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', width: '34px', height: '34px',
    cursor: disabledBtn ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  });

  return (
    <div>
      {/* Pomikanje med dnevi */}
      {hasDays && lesson && (
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <button onClick={() => setDayIndex(i => Math.max(0, i - 1))} disabled={dayIndex === 0} style={navBtn(dayIndex === 0)} title="Prejšnja ura (←)">‹</button>
          <button onClick={() => setDayIndex(i => Math.min(lessons.length - 1, i + 1))} disabled={dayIndex === lessons.length - 1} style={navBtn(dayIndex === lessons.length - 1)} title="Naslednja ura (→)">›</button>
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>
              {formatLessonDate(lesson.d)}
            </div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)' }}>
              {metaLine(dayIndex, lesson.r)}
              {hasOverride && <span style={{ color: 'var(--forest)', fontWeight: 600 }}> · ročno</span>}
            </div>
          </div>
          <button onClick={() => {
            const today = new Date().toISOString().slice(0, 10);
            let idx = lessons.findIndex(l => l.d >= today);
            if (idx < 0) idx = lessons.length - 1;
            setDayIndex(idx);
          }} style={{ ...btn(false), marginLeft: '4px', fontSize: '11px', padding: '5px 10px' }}>Danes</button>
        </div>
      )}

      {/* Orodja */}
      <div className="no-print" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '18px' }}>
        <button onClick={shuffle} style={{ ...btn(false), fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none' }}>
          {hasDays ? 'Premešaj ta dan' : 'Premešaj'}
        </button>
        <button onClick={() => setEditSeats(v => !v)} style={btn(editSeats)}>{editSeats ? 'Končaj urejanje klopi' : 'Uredi klopi'}</button>
        {hasDays
          ? hasOverride && <button onClick={resetToAuto} style={btn(false)} title="Odstrani ročni razpored za ta dan (nazaj na samodejnega)">↩︎ Samodejno</button>
          : <button onClick={clearAssign} style={btn(false)}>Počisti razpored</button>}
        {hasLayoutOverride && <button onClick={resetDayLayout} style={btn(false)} title="Odstrani ročni tloris za ta dan (nazaj na tloris iz nastavitev)">↩︎ Tloris iz nastavitev</button>}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)', marginLeft: '4px' }}>
          vrste
          <input type="number" min={1} max={12} value={layout.rows} onChange={e => setGrid(Math.max(1, Math.min(12, +e.target.value || 1)), layout.cols)}
            style={{ width: '48px', fontSize: '13px', padding: '5px 8px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', background: 'var(--canvas)' }} />
          stolpci
          <input type="number" min={1} max={12} value={layout.cols} onChange={e => setGrid(layout.rows, Math.max(1, Math.min(12, +e.target.value || 1)))}
            style={{ width: '48px', fontSize: '13px', padding: '5px 8px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', background: 'var(--canvas)' }} />
        </span>
        <span style={{ fontSize: '12px', color: seatCount < students.length ? '#c0392b' : 'var(--muted)', marginLeft: 'auto' }}>
          {students.length} učencev · {seatCount} sedežev{seatCount < students.length ? ' (premalo!)' : ''}
        </span>
      </div>

      {editSeats && (
        <p className="no-print" style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>
          Klikni celico, da vključiš/izključiš klop. {hasDays ? 'Sprememba velja samo za ta dan — privzeti tloris učilnice nastaviš v Nastavitve → Tlorisi učilnic.' : 'Izključene celice ostanejo prazne.'}
        </p>
      )}
      {hasDays && !editSeats && (
        <p className="no-print" style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>
          Povleci učenca na želeni sedež, nato klikni krogec <span style={{ display: 'inline-flex', width: '13px', height: '13px', borderRadius: '50%', border: '1.5px solid var(--forest)', verticalAlign: 'middle' }} /> v kotu, da ga <b>pripneš</b> na ta sedež (velja za naprej). Tisk (Ctrl+P) natisne ta in naslednji dan (dve strani).
        </p>
      )}

      {/* Tiskalno območje: ta dan (str. 1) + naslednji dan (str. 2) */}
      <div className="print-root">
        <div className="print-seating">
          {/* Ime razreda + metapodatki */}
          <div className="seating-head" style={{ marginBottom: '12px' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', color: 'var(--ink)' }}>
              {className}
              {contextLabel && (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--muted)', marginLeft: '10px' }}>
                  {contextLabel}
                </span>
              )}
            </div>
            {hasDays && lesson && (
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                <span style={{ textTransform: 'capitalize' }}>{formatLessonDate(lesson.d)}</span> · {metaLine(dayIndex, lesson.r)}
              </div>
            )}
          </div>

          {/* Mreža klopi (prva vrsta spodaj, bližje tabli) */}
          <div className="seating-scroll" style={{ overflowX: 'auto' }}>
            <div className="seating-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${layout.cols}, minmax(var(--seat-min, 84px), 1fr))`, gap: 'var(--seat-gap, 10px)', minWidth: `${layout.cols * 94}px`, maxWidth: '760px', margin: '0 auto' }}>
            {Array.from({ length: layout.rows }).flatMap((_, ri) => {
              const r = layout.rows - 1 - ri;
              return Array.from({ length: layout.cols }).map((_, c) => {
                const k = `${r}-${c}`;
                const isSeat = !disabled.has(k);
                const stud: Student | undefined = isSeat ? studentById.get(assign[k]) : undefined;

                if (editSeats) {
                  return (
                    <button key={k} className="seating-cell" onClick={() => toggleSeat(k)}
                      style={{ height: '76px', borderRadius: '8px', cursor: 'pointer',
                        border: isSeat ? '1px solid var(--hairline)' : '1px dashed var(--hairline)',
                        background: isSeat ? 'var(--canvas)' : 'transparent',
                        color: isSeat ? 'var(--ink)' : 'var(--muted)', fontSize: '13px' }}>
                      {isSeat ? 'klop' : '+'}
                    </button>
                  );
                }
                if (!isSeat) return <div key={k} className="seating-cell" style={{ height: '76px' }} />;

                const gs = stud ? genderStyle(stud.gender) : { bg: 'var(--canvas)', border: 'var(--hairline)', color: 'var(--muted)' };
                return (
                  <div key={k}
                    className="seating-cell"
                    draggable={!!stud}
                    onDragStart={() => { if (stud) dragRef.current = { from: 'seat', cell: k }; }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); dropOnSeat(k); }}
                    style={{ position: 'relative', height: '76px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '4px 6px',
                      border: `1.5px solid ${gs.border}`, background: gs.bg, color: gs.color,
                      fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, lineHeight: 1.2,
                      cursor: stud ? 'grab' : 'default', boxSizing: 'border-box' }}>
                    {stud?.frontRow && (
                      <span title="Vedno v prvi vrsti" style={{ position: 'absolute', top: '3px', left: '4px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.03em', color: gs.color, opacity: 0.6 }}>1↓</span>
                    )}
                    {stud && hasDays && !editSeats && (
                      <button
                        className="no-print"
                        draggable={false}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); toggleFix(stud.id, k); }}
                        title={fixedMap[k] === stud.id ? 'Pripeto na ta sedež — klik odpne' : 'Pripni učenca na ta sedež (velja za naprej)'}
                        style={{ position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px', borderRadius: '50%', padding: 0, cursor: 'pointer',
                          border: `1.5px solid ${fixedMap[k] === stud.id ? 'var(--forest)' : gs.border}`,
                          background: fixedMap[k] === stud.id ? 'var(--forest)' : 'rgba(255,255,255,0.5)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '9px', lineHeight: 1, opacity: fixedMap[k] === stud.id ? 1 : 0.5 }}>
                        {fixedMap[k] === stud.id ? '📌' : ''}
                      </button>
                    )}
                    {stud ? stud.name : ''}
                  </div>
                );
              });
            })}
            </div>
          </div>

          {/* Tabla spodaj (spredaj v učilnici) */}
          <div className="seating-board" style={{ textAlign: 'center', margin: '14px auto 0', maxWidth: '640px', background: 'var(--forest)', color: '#fff', borderRadius: 'var(--r-sm)', padding: '8px', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Tabla
          </div>
        </div>

        {/* Naslednji dan — samo za tisk (druga stran) */}
        {nextData && (
          <StaticSeatingGrid
            wrapClass="print-seating print-next"
            heading={className}
            contextLabel={contextLabel}
            dateISO={nextData.lesson.d}
            metaLine={metaLine(nextData.index, nextData.lesson.r)}
            layout={nextData.layout}
            assign={nextData.assign}
            studentById={studentById}
          />
        )}
      </div>

      {/* Nerazporejeni učenci */}
      {pool.length > 0 && (
        <div className="no-print" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); dropOnPool(); }}
          style={{ marginTop: '24px', padding: '14px', border: '1px dashed var(--hairline)', borderRadius: 'var(--r-md)' }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '10px' }}>
            Nerazporejeni ({pool.length}) — povleci na sedež
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {pool.map(s => {
              const gs = genderStyle(s.gender);
              return (
                <div key={s.id} draggable onDragStart={() => { dragRef.current = { from: 'pool', studentId: s.id }; }}
                  style={{ padding: '6px 12px', borderRadius: '8px', border: `1.5px solid ${gs.border}`, background: gs.bg, color: gs.color, fontSize: '12px', fontWeight: 500, cursor: 'grab' }}>
                  {s.frontRow && <span title="Vedno v prvi vrsti" style={{ fontSize: '9px', fontWeight: 700, opacity: 0.6, marginRight: '4px' }}>1↓</span>}
                  {s.name}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
