'use client';

import { useState, useEffect, useRef } from 'react';
import { useAllClasses } from '@/hooks/useAllClasses';
import { useSelectedClass } from '@/hooks/useSelectedClass';
import { useRoster, type Student } from '@/hooks/useRoster';
import { useSeating, cellKey, activeSeats, shuffleInto, type Seating } from '@/hooks/useSeating';

function genderStyle(g: string) {
  if (g === 'Ž') return { bg: '#fbe7ef', border: '#e589ac', color: '#a61e4d' };
  if (g === 'M') return { bg: '#e6f0f8', border: '#8fbfe0', color: '#1c5a86' };
  return { bg: 'var(--canvas)', border: 'var(--hairline)', color: 'var(--ink)' };
}

type Drag = { from: 'seat'; cell: string } | { from: 'pool'; studentId: string } | null;

export default function SeatingChart() {
  const classes = useAllClasses();
  const [classId, setClassId] = useSelectedClass();
  useEffect(() => {
    if (classes.length && !classes.find(c => c.classId === classId)) setClassId(classes[0].classId);
  }, [classes, classId, setClassId]);

  const { students } = useRoster(classId || undefined);
  const { seating, setSeating } = useSeating(classId || undefined);
  const currentClass = classes.find(c => c.classId === classId);
  const [editSeats, setEditSeats] = useState(false);
  const dragRef = useRef<Drag>(null);

  const studentById = new Map(students.map(s => [s.id, s]));
  const disabled = new Set(seating.disabled);
  const seatedIds = new Set(Object.values(seating.assign));
  const pool = students.filter(s => !seatedIds.has(s.id));
  const seatCount = activeSeats(seating).length;

  if (classes.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Najprej ustvari razrede pri predmetih in dodaj učence v Nastavitvah → Učenci.</p>;
  }

  const update = (patch: Partial<Seating>) => setSeating({ ...seating, ...patch });

  const toggleSeat = (k: string) => {
    if (disabled.has(k)) { update({ disabled: seating.disabled.filter(x => x !== k) }); }
    else {
      const assign = { ...seating.assign }; delete assign[k];
      update({ disabled: [...seating.disabled, k], assign });
    }
  };

  const setGrid = (rows: number, cols: number) => {
    // odstrani razporede/onemogočene izven nove mreže
    const inGrid = (k: string) => { const [r, c] = k.split('-').map(Number); return r < rows && c < cols; };
    const assign: Record<string, string> = {};
    for (const [k, v] of Object.entries(seating.assign)) if (inGrid(k)) assign[k] = v;
    update({ rows, cols, disabled: seating.disabled.filter(inGrid), assign });
  };

  const shuffle = () => update({ assign: shuffleInto(seating, students.map(s => s.id)) });
  const clearAssign = () => update({ assign: {} });

  const dropOnSeat = (target: string) => {
    const d = dragRef.current; dragRef.current = null;
    if (!d || disabled.has(target)) return;
    const assign = { ...seating.assign };
    if (d.from === 'seat') {
      const a = assign[d.cell], b = assign[target];
      if (b) assign[d.cell] = b; else delete assign[d.cell];
      if (a) assign[target] = a; else delete assign[target];
    } else {
      // iz bazena na sedež (če je zaseden, prejšnji gre v bazen)
      assign[target] = d.studentId;
    }
    update({ assign });
  };
  const dropOnPool = () => {
    const d = dragRef.current; dragRef.current = null;
    if (!d || d.from !== 'seat') return;
    const assign = { ...seating.assign }; delete assign[d.cell];
    update({ assign });
  };

  const btn = (active: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: active ? 600 : 500,
    color: active ? '#fff' : 'var(--forest)', background: active ? 'var(--forest)' : 'transparent',
    border: `1px solid ${active ? 'var(--forest)' : 'var(--hairline)'}`, borderRadius: 'var(--r-sm)',
    padding: '7px 14px', cursor: 'pointer',
  });

  return (
    <div>
      {/* Izbrana učilnica (izbira je v zgornjem meniju) */}
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: '22px', color: 'var(--ink)', marginBottom: '4px' }}>
        {currentClass ? currentClass.className : ''}
        {currentClass && (currentClass.subjectName || currentClass.subtitle) && (
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--muted)', marginLeft: '10px' }}>
            {[currentClass.subjectName, currentClass.subtitle].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
      <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>Učilnico izbereš v zgornjem meniju (Sedežni red).</p>

      {/* Orodja */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '18px' }}>
        <button onClick={shuffle} style={{ ...btn(false), fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none' }}>Premešaj</button>
        <button onClick={() => setEditSeats(v => !v)} style={btn(editSeats)}>{editSeats ? 'Končaj urejanje klopi' : 'Uredi klopi'}</button>
        <button onClick={clearAssign} style={btn(false)}>Počisti razpored</button>
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
        <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>
          Klikni celico, da vključiš/izključiš klop (sedež). Izključene celice ostanejo prazne.
        </p>
      )}

      {/* Tabla */}
      <div style={{ textAlign: 'center', margin: '0 auto 14px', maxWidth: '640px', background: 'var(--forest)', color: '#fff', borderRadius: 'var(--r-sm)', padding: '8px', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
        Tabla
      </div>

      {/* Mreža klopi */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${seating.cols}, minmax(84px, 1fr))`, gap: '10px', minWidth: `${seating.cols * 94}px`, maxWidth: '760px', margin: '0 auto' }}>
          {Array.from({ length: seating.rows }).flatMap((_, r) =>
            Array.from({ length: seating.cols }).map((_, c) => {
              const k = cellKey(r, c);
              const isSeat = !disabled.has(k);
              const stud: Student | undefined = isSeat ? studentById.get(seating.assign[k]) : undefined;

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
                  style={{ height: '58px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '4px 6px',
                    border: `1.5px solid ${gs.border}`, background: gs.bg, color: gs.color,
                    fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, lineHeight: 1.2,
                    cursor: stud ? 'grab' : 'default', boxSizing: 'border-box' }}>
                  {stud ? stud.name : ''}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Nerazporejeni učenci */}
      {pool.length > 0 && (
        <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); dropOnPool(); }}
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
