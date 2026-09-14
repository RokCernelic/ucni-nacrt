'use client';

import { useState } from 'react';
import { useRooms, DEFAULT_ROOM_PLAN, type RoomPlan } from '@/hooks/useRooms';
import { ALL_ROOMS } from '@/data/timetable';

export default function RoomPlansSection() {
  const { plans, getPlan, setPlan, removePlan } = useRooms();
  const [room, setRoom] = useState<string>(ALL_ROOMS[0] ?? '');

  const plan: RoomPlan = getPlan(room) ?? DEFAULT_ROOM_PLAN;
  const disabled = new Set(plan.disabled);
  const hasPlan = !!plans[room];
  let seatCount = 0;
  for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) if (!disabled.has(`${r}-${c}`)) seatCount++;

  const update = (next: RoomPlan) => setPlan(room, next);
  const toggleSeat = (k: string) => {
    const dis = new Set(plan.disabled);
    if (dis.has(k)) dis.delete(k); else dis.add(k);
    update({ ...plan, disabled: [...dis] });
  };
  const setGrid = (rows: number, cols: number) => {
    const inGrid = (k: string) => { const [r, c] = k.split('-').map(Number); return r < rows && c < cols; };
    update({ rows, cols, disabled: plan.disabled.filter(inGrid) });
  };

  if (ALL_ROOMS.length === 0) {
    return <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Ni učilnic v urniku.</p>;
  }

  return (
    <>
      <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px', lineHeight: 1.5 }}>
        Za vsako učilnico določi tloris klopi (velikost mreže in kje so sedeži). Ta razpored velja povsod, kjer je učilnica na urniku. Klik na celico vključi/izključi klop. Spremembe za posamezen dan narediš na strani <b>Sedežni red</b> (veljajo le za tisti dan).
      </p>

      {/* izbira učilnice */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {ALL_ROOMS.map(rm => {
          const active = rm === room;
          const custom = !!plans[rm];
          return (
            <button key={rm} onClick={() => setRoom(rm)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: active ? 600 : 500, color: active ? '#fff' : 'var(--forest)', background: active ? 'var(--forest)' : 'transparent', border: `1px solid ${active ? 'var(--forest)' : 'var(--hairline)'}`, borderRadius: 'var(--r-sm)', padding: '6px 12px', cursor: 'pointer' }}>
              {rm}
              {custom && <span title="Tloris je nastavljen" style={{ width: '6px', height: '6px', borderRadius: '50%', background: active ? '#fff' : 'var(--green-ok)' }} />}
            </button>
          );
        })}
      </div>

      {/* orodja */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
          vrste
          <input type="number" min={1} max={12} value={plan.rows} onChange={e => setGrid(Math.max(1, Math.min(12, +e.target.value || 1)), plan.cols)}
            style={{ width: '48px', fontSize: '13px', padding: '5px 8px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', background: 'var(--canvas)' }} />
          stolpci
          <input type="number" min={1} max={12} value={plan.cols} onChange={e => setGrid(plan.rows, Math.max(1, Math.min(12, +e.target.value || 1)))}
            style={{ width: '48px', fontSize: '13px', padding: '5px 8px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', background: 'var(--canvas)' }} />
        </span>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{seatCount} sedežev</span>
        {hasPlan && (
          <button onClick={() => removePlan(room)} style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, color: 'var(--forest)', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '6px 12px', cursor: 'pointer', marginLeft: 'auto' }}>
            Ponastavi na privzeto
          </button>
        )}
      </div>

      {/* mreža (prva vrsta spodaj, ob tabli) */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${plan.cols}, minmax(40px, 1fr))`, gap: '6px', minWidth: `${plan.cols * 46}px`, maxWidth: '520px' }}>
          {Array.from({ length: plan.rows }).flatMap((_, ri) => {
            const r = plan.rows - 1 - ri;
            return Array.from({ length: plan.cols }).map((_, c) => {
              const k = `${r}-${c}`;
              const isSeat = !disabled.has(k);
              return (
                <button key={k} onClick={() => toggleSeat(k)} title={isSeat ? 'Klop — klik odstrani' : 'Prazno — klik doda klop'}
                  style={{ height: '40px', borderRadius: '6px', cursor: 'pointer',
                    border: isSeat ? '1px solid var(--hairline)' : '1px dashed var(--hairline)',
                    background: isSeat ? 'var(--canvas)' : 'transparent',
                    color: isSeat ? 'var(--ink)' : 'var(--muted)', fontSize: '12px' }}>
                  {isSeat ? '' : '+'}
                </button>
              );
            });
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: '8px', maxWidth: '520px', background: 'var(--forest)', color: '#fff', borderRadius: 'var(--r-sm)', padding: '6px', fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          Tabla
        </div>
      </div>
    </>
  );
}
