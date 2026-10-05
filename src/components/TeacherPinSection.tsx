'use client';

import { useState, useEffect } from 'react';
import { getTeacherPin, TEACHER_PIN_KEY } from '@/lib/quiz/sessionApi';

/** Nastavitve → PIN učitelja: skriti udeleženec vsakega kviza (testna oseba). */
export default function TeacherPinSection() {
  const [pin, setPin] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const load = () => { const p = getTeacherPin(); setSaved(p); setPin(p ?? ''); };
    load();
    const onStorage = (e: StorageEvent) => { if (e.key === TEACHER_PIN_KEY) load(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const valid = /^\d{4}$/.test(pin);
  const save = () => {
    if (!valid) return;
    localStorage.setItem(TEACHER_PIN_KEY, JSON.stringify(pin));
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
    setSaved(pin);
  };
  const remove = () => {
    localStorage.removeItem(TEACHER_PIN_KEY);
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
    setSaved(null); setPin('');
  };

  return (
    <>
      <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px', lineHeight: 1.5 }}>
        S tem PIN-om se v vsak kviz prijaviš kot skriti udeleženec (testna oseba). Nisi na seznamih učencev,
        na koncu pa vidiš svoje točke pod rezultati razreda (ne štejejo v povprečje).
      </p>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
          inputMode="numeric"
          placeholder="••••" aria-label="PIN (4 števke)"
          style={{ fontFamily: 'var(--font-sans)', fontSize: '18px', fontWeight: 600, letterSpacing: '0.15em', width: '110px', color: 'var(--ink)', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '7px 10px', outline: 'none' }}
        />
        <button onClick={save} disabled={!valid || pin === saved}
          style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 14px', cursor: valid && pin !== saved ? 'pointer' : 'not-allowed', opacity: valid && pin !== saved ? 1 : 0.5 }}>
          Shrani PIN
        </button>
        {saved && (
          <button onClick={remove}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '8px 12px', cursor: 'pointer' }}>
            Odstrani
          </button>
        )}
        {saved && pin === saved && <span style={{ fontSize: '12px', color: 'var(--green-ok)' }}>Shranjeno ✓ — PIN {saved}</span>}
      </div>
    </>
  );
}
