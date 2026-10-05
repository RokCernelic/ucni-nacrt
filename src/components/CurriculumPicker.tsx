'use client';

import { useState } from 'react';
import { CURRICULA } from '@/data/registry';

/** Okno za izbiro učnega načrta (+ neobvezna šola) pri dodajanju novega predmeta. */
export default function CurriculumPicker({ schools, onPick, onClose }: {
  schools: string[];
  onPick: (curriculumId: string, school: string) => void;
  onClose: () => void;
}) {
  const [school, setSchool] = useState('');

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,20,12,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 16px' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '440px', background: 'var(--canvas)', borderRadius: 'var(--r-md)', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--forest)' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '19px', fontWeight: 400, color: '#fff' }}>Izberi učni načrt</h3>
          <button onClick={onClose} title="Zapri" style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '22px', lineHeight: 1, cursor: 'pointer', padding: '2px 6px' }}>×</button>
        </div>
        <div style={{ padding: '14px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              Šola (neobvezno)
            </span>
            <input
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              list="curriculum-picker-schools"
              placeholder="npr. OŠ Brežice"
              autoFocus
              style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--ink)', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '8px 10px', outline: 'none' }}
            />
            <datalist id="curriculum-picker-schools">
              {schools.map((s) => <option key={s} value={s} />)}
            </datalist>
          </label>
          {CURRICULA.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c.id, school.trim())}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', width: '100%', textAlign: 'left', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '14px 16px', marginBottom: '8px', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--forest)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hairline)'; }}
            >
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', color: 'var(--ink)' }}>{c.predmet.naslov}</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)' }}>{c.predmet.opis}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
