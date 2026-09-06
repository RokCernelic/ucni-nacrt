'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAllClasses } from '@/hooks/useAllClasses';
import { useSelectedClass } from '@/hooks/useSelectedClass';
import SeatingChart from '@/components/SeatingChart';

export default function SedezniRedPage() {
  const { user, loading } = useAuth();
  const isAnon = !loading && !user;
  const classes = useAllClasses();
  const [selected, setSelected] = useSelectedClass();

  useEffect(() => {
    if (classes.length && !classes.find(c => c.classId === selected)) setSelected(classes[0].classId);
  }, [classes, selected, setSelected]);

  return (
    <div>
      <div style={{ background: 'var(--forest)', padding: '32px 32px 28px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>← Nazaj</Link>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px,4vw,48px)', fontWeight: 300, color: '#fff', lineHeight: 1, margin: '10px 0 0' }}>
            Sedežni red
          </h1>

          {!isAnon && classes.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '18px' }}>
              {classes.map(c => {
                const active = c.classId === selected;
                return (
                  <button
                    key={c.classId}
                    onClick={() => setSelected(c.classId)}
                    title={c.label}
                    style={{
                      display: 'inline-flex', alignItems: 'baseline', gap: '6px',
                      fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: active ? 700 : 500,
                      padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
                      background: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)',
                      border: `1px solid ${active ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)'}`,
                      color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.className}
                    <span style={{ fontSize: '11px', opacity: 0.55, fontWeight: 400 }}>{[c.subjectName, c.subtitle].filter(Boolean).join(' · ')}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', padding: '32px' }}>
        {isAnon ? (
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>
            Za sedežni red se <Link href="/login" style={{ color: 'var(--forest)', fontWeight: 500 }}>prijavite</Link>.
          </p>
        ) : (
          <SeatingChart />
        )}
      </div>
    </div>
  );
}
