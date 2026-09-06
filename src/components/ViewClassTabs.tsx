'use client';

import { useState } from 'react';
import type { MasterClass } from '@/hooks/useMasterClasses';

export default function ViewClassTabs({ master, ids, activeId, onSelect, onAdd, onRemove }: {
  master: MasterClass[];
  ids: string[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const byId = new Map(master.map(m => [m.id, m]));
  const shown = ids.map(id => byId.get(id)).filter((m): m is MasterClass => !!m);
  const available = master.filter(m => !ids.includes(m.id));

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    background: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)',
    border: `1px solid ${active ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)'}`,
    borderRadius: '6px', padding: '5px 6px 5px 11px',
    color: active ? '#fff' : 'rgba(255,255,255,0.65)',
    fontFamily: 'var(--font-sans)', fontSize: '13px',
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '18px' }}>
      {shown.map(m => {
        const active = m.id === activeId;
        return (
          <div key={m.id} style={tabStyle(active)}>
            <button onClick={() => onSelect(m.id)} title={[m.name, m.school].filter(Boolean).join(' · ')}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontWeight: active ? 700 : 500, display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}>
              {m.name}
              {m.school && <span style={{ fontSize: '11px', opacity: 0.55, fontWeight: 400 }}>{m.school}</span>}
            </button>
            <button onClick={() => onRemove(m.id)} title="Odstrani iz tega pogleda (ne izbriše razreda)"
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '15px', lineHeight: 1, padding: '0 2px' }}>×</button>
          </div>
        );
      })}

      {/* Dodaj obstoječ razred */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setPicking(v => !v)} title="Dodaj razred iz nastavitev"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px dashed rgba(255,255,255,0.3)', borderRadius: '6px', color: 'rgba(255,255,255,0.6)', fontSize: '18px', fontWeight: 300, width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
        {picking && (
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, minWidth: '220px', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: '6px' }}>
            {available.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px 10px' }}>
                Ni razredov za dodati. Ustvari jih v <b>Nastavitve → Razredi</b>.
              </p>
            ) : available.map(m => (
              <button key={m.id} onClick={() => { onAdd(m.id); setPicking(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 'var(--r-sm)', padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2, #eee)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <b>{m.name}</b>{m.school ? ` · ${m.school}` : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
