'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SubjectCard from '@/components/SubjectCard';
import { useSubjects } from '@/hooks/useSubjects';
import { CURRICULA, getCurriculum } from '@/data/registry';
import type { Predmet } from '@/types/curriculum';

function podpoglavjaOf(predmet: Predmet) {
  return predmet.poglavja.flatMap((p, pi) =>
    p.podpoglavja.map((pp, ppi) => ({ number: `${pi + 1}.${ppi + 1}`, naslov: pp.naslov }))
  );
}

export default function HomeSubjects() {
  const { subjects, loaded, addSubject, updateSubtitle, removeSubject } = useSubjects();
  const [picker, setPicker] = useState(false);
  const router = useRouter();

  if (!loaded) return null;

  const pick = (curriculumId: string) => {
    const id = addSubject(curriculumId);
    setPicker(false);
    router.push(`/predmet/${id}`);
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 32px 80px' }}>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '20px' }}>
        Moji predmeti
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {subjects.map((s) => {
          const entry = getCurriculum(s.curriculum);
          if (!entry) return null;
          return (
            <SubjectCard
              key={s.id}
              href={`/predmet/${s.id}`}
              naslov={entry.predmet.naslov}
              subtitle={s.subtitle}
              onSubtitleChange={(v) => updateSubtitle(s.id, v)}
              enote={podpoglavjaOf(entry.predmet)}
              onDelete={() => {
                if (confirm(`Odstranim predmet »${entry.predmet.naslov}«${s.subtitle ? ` (${s.subtitle})` : ''} in vse njegove oddelke?`)) {
                  removeSubject(s.id);
                }
              }}
            />
          );
        })}

        {/* Kartica za dodajanje novega predmeta */}
        <button
          onClick={() => setPicker(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            background: 'transparent', border: '1.5px dashed var(--hairline)',
            borderRadius: 'var(--r-lg)', padding: '22px', cursor: 'pointer',
            color: 'var(--muted)', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 500,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--forest)'; e.currentTarget.style.color = 'var(--forest)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hairline)'; e.currentTarget.style.color = 'var(--muted)'; }}
        >
          <span style={{ fontSize: '20px', lineHeight: 1 }}>+</span>
          Dodaj predmet
        </button>
      </div>

      {picker && (
        <div
          onClick={() => setPicker(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,20,12,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 16px' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '440px', background: 'var(--canvas)', borderRadius: 'var(--r-md)', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--forest)' }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '19px', fontWeight: 400, color: '#fff' }}>Izberi učni načrt</h3>
              <button onClick={() => setPicker(false)} title="Zapri" style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '22px', lineHeight: 1, cursor: 'pointer', padding: '2px 6px' }}>×</button>
            </div>
            <div style={{ padding: '14px' }}>
              {CURRICULA.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pick(c.id)}
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
      )}
    </div>
  );
}
