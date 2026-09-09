'use client';

import { useState, useRef, useEffect } from 'react';
import { useRoster, type Student } from '@/hooks/useRoster';
import { useSeating, cellKey, activeSeats, shuffleInto, makeRng, type Seating } from '@/hooks/useSeating';
import { formatLessonDate, type Lesson } from '@/data/timetable';

function genderStyle(g: string) {
  if (g === 'Ž') return { bg: '#fbe7ef', border: '#e589ac', color: '#a61e4d' };
  if (g === 'M') return { bg: '#e6f0f8', border: '#8fbfe0', color: '#1c5a86' };
  return { bg: 'var(--canvas)', border: 'var(--hairline)', color: 'var(--ink)' };
}

type Drag = { from: 'seat'; cell: string } | { from: 'pool'; studentId: string } | null;
type DayMap = Record<string, Record<string, string>>;

/** Ročni razporedi po dnevih (prepiši samodejnega); shranjeno ločeno od postavitve klopi. */
function useDayOverrides(classId?: string) {
  const key = classId ? `ucni-nacrt-seatdays-${classId}` : undefined;
  const [map, setMap] = useState<DayMap>({});

  useEffect(() => {
    if (!key) { setMap({}); return; }
    try { const r = localStorage.getItem(key); setMap(r ? JSON.parse(r) : {}); }
    catch { setMap({}); }
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
  const { map: dayMap, setDay } = useDayOverrides(classId || undefined);
  const [editSeats, setEditSeats] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const dragRef = useRef<Drag>(null);

  const hasDays = lessons.length > 0;

  // Ob menjavi razreda/urnika skoči na današnjo (ali najbližjo prihodnjo) uro.
  useEffect(() => {
    if (!hasDays) return;
    const today = new Date().toISOString().slice(0, 10);
    let idx = lessons.findIndex(l => l.d >= today);
    if (idx < 0) idx = lessons.length - 1;
    setDayIndex(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, hasDays, lessons.length]);

  const lesson = hasDays ? lessons[Math.min(dayIndex, lessons.length - 1)] : null;

  // Tipki levo/desno premikata med dnevi.
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
  const disabled = new Set(seating.disabled);
  const allIds = students.map(s => s.id);
  const frontIds = students.filter(s => s.frontRow).map(s => s.id);
  const seatCount = activeSeats(seating).length;

  // Razpored za trenutni pogled: dan (ročni prepis ali samodejni seed) ali klasični enkratni razpored.
  const hasOverride = !!(lesson && dayMap[lesson.d]);
  const assign: Record<string, string> = hasDays
    ? (lesson && dayMap[lesson.d]
        ? dayMap[lesson.d]
        : shuffleInto(seating, allIds, frontIds, makeRng(`${classId}|${lesson?.d ?? ''}`)))
    : seating.assign;

  const seatedIds = new Set(Object.values(assign));
  const pool = students.filter(s => !seatedIds.has(s.id));

  const updateLayout = (patch: Partial<Seating>) => setSeating({ ...seating, ...patch });
  // Zapiši razpored: v dnevnem načinu kot ročni prepis dneva, sicer v postavitev.
  const commitAssign = (next: Record<string, string>) => {
    if (hasDays && lesson) setDay(lesson.d, next);
    else updateLayout({ assign: next });
  };

  const toggleSeat = (k: string) => {
    if (disabled.has(k)) { updateLayout({ disabled: seating.disabled.filter(x => x !== k) }); }
    else {
      updateLayout({ disabled: [...seating.disabled, k] });
      if (assign[k]) { const a = { ...assign }; delete a[k]; commitAssign(a); }
    }
  };

  const setGrid = (rows: number, cols: number) => {
    const inGrid = (k: string) => { const [r, c] = k.split('-').map(Number); return r < rows && c < cols; };
    updateLayout({ rows, cols, disabled: seating.disabled.filter(inGrid) });
    if (!hasDays) {
      const a: Record<string, string> = {};
      for (const [k, v] of Object.entries(seating.assign)) if (inGrid(k)) a[k] = v;
      updateLayout({ rows, cols, disabled: seating.disabled.filter(inGrid), assign: a });
    }
  };

  const shuffle = () => commitAssign(shuffleInto(seating, allIds, frontIds));
  const clearAssign = () => commitAssign({});
  const resetToAuto = () => { if (lesson) setDay(lesson.d, null); };

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
              {totalHours ? `${dayIndex + 1}/${totalHours}` : `${dayIndex + 1}. ura`} · učilnica {lesson.r}
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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)', marginLeft: '4px' }}>
          vrste
          <input type="number" min={1} max={12} value={seating.rows} onChange={e => setGrid(Math.max(1, Math.min(12, +e.target.value || 1)), seating.cols)}
            style={{ width: '48px', fontSize: '13px', padding: '5px 8px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', background: 'var(--canvas)' }} />
          stolpci
          <input type="number" min={1} max={12} value={seating.cols} onChange={e => setGrid(seating.rows, Math.max(1, Math.min(12, +e.target.value || 1)))}
            style={{ width: '48px', fontSize: '13px', padding: '5px 8px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', background: 'var(--canvas)' }} />
        </span>
        <span style={{ fontSize: '12px', color: seatCount < students.length ? '#c0392b' : 'var(--muted)', marginLeft: 'auto' }}>
          {students.length} učencev · {seatCount} sedežev{seatCount < students.length ? ' (premalo!)' : ''}
        </span>
      </div>

      {editSeats && (
        <p className="no-print" style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>
          Klikni celico, da vključiš/izključiš klop (sedež). Izključene celice ostanejo prazne.
        </p>
      )}

      {/* Tiskalno območje: samo sedežni red (Ctrl+P) */}
      <div className="print-seating">
        {/* Ime razreda + metapodatki (za natis) */}
        <div style={{ marginBottom: '12px' }}>
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
              <span style={{ textTransform: 'capitalize' }}>{formatLessonDate(lesson.d)}</span> · {totalHours ? `${dayIndex + 1}/${totalHours}` : `${dayIndex + 1}. ura`} · učilnica {lesson.r}
            </div>
          )}
        </div>

        {/* Mreža klopi (prva vrsta spodaj, bližje tabli) */}
        <div className="seating-scroll" style={{ overflowX: 'auto' }}>
          <div className="seating-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${seating.cols}, minmax(84px, 1fr))`, gap: '10px', minWidth: `${seating.cols * 94}px`, maxWidth: '760px', margin: '0 auto' }}>
          {Array.from({ length: seating.rows }).flatMap((_, ri) => {
            const r = seating.rows - 1 - ri; // obrni: zadnja vrsta zgoraj, prva spodaj
            return Array.from({ length: seating.cols }).map((_, c) => {
              const k = cellKey(r, c);
              const isSeat = !disabled.has(k);
              const stud: Student | undefined = isSeat ? studentById.get(assign[k]) : undefined;

              if (editSeats) {
                return (
                  <button key={k} onClick={() => toggleSeat(k)}
                    style={{ height: '58px', borderRadius: '8px', cursor: 'pointer',
                      border: isSeat ? '1px solid var(--hairline)' : '1px dashed var(--hairline)',
                      background: isSeat ? 'var(--canvas)' : 'transparent',
                      color: isSeat ? 'var(--ink)' : 'var(--muted)', fontSize: '13px' }}>
                    {isSeat ? 'klop' : '+'}
                  </button>
                );
              }
              if (!isSeat) return <div key={k} style={{ height: '58px' }} />;

              const gs = stud ? genderStyle(stud.gender) : { bg: 'var(--canvas)', border: 'var(--hairline)', color: 'var(--muted)' };
              return (
                <div key={k}
                  draggable={!!stud}
                  onDragStart={() => { if (stud) dragRef.current = { from: 'seat', cell: k }; }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); dropOnSeat(k); }}
                  style={{ position: 'relative', height: '58px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '4px 6px',
                    border: `1.5px solid ${gs.border}`, background: gs.bg, color: gs.color,
                    fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, lineHeight: 1.2,
                    cursor: stud ? 'grab' : 'default', boxSizing: 'border-box' }}>
                  {stud?.frontRow && (
                    <span title="Vedno v prvi vrsti" style={{ position: 'absolute', top: '3px', left: '4px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.03em', color: gs.color, opacity: 0.6 }}>1↓</span>
                  )}
                  {stud ? stud.name : ''}
                </div>
              );
            });
          })}
          </div>
        </div>

        {/* Tabla spodaj (spredaj v učilnici) */}
        <div style={{ textAlign: 'center', margin: '14px auto 0', maxWidth: '640px', background: 'var(--forest)', color: '#fff', borderRadius: 'var(--r-sm)', padding: '8px', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          Tabla
        </div>
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
