'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import SubjectCard from '@/components/SubjectCard';
import { useSubjects } from '@/hooks/useSubjects';
import { useAuth } from '@/hooks/useAuth';
import { getCurriculum } from '@/data/registry';
import CurriculumPicker from '@/components/CurriculumPicker';
import type { Predmet } from '@/types/curriculum';

function podpoglavjaOf(predmet: Predmet) {
  return predmet.poglavja.flatMap((p, pi) =>
    p.podpoglavja.map((pp, ppi) => ({ number: `${pi + 1}.${ppi + 1}`, naslov: pp.naslov }))
  );
}

export default function HomeSubjects() {
  const { subjects, loaded, addSubject, updateSubtitle, removeSubject, reorderSubjects } = useSubjects();
  const { user, loading } = useAuth();
  const [picker, setPicker] = useState(false);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const fromRef = useRef<number | null>(null);
  const router = useRouter();

  const isAnonymous = !loading && !user;

  if (!loaded) return null;

  const pick = (curriculumId: string, school: string) => {
    const id = addSubject(curriculumId);
    if (school) updateSubtitle(id, school);
    setPicker(false);
    router.push(`/predmet/${id}`);
  };

  const onAddClick = () => {
    if (isAnonymous) { router.push('/login'); return; }
    setPicker(true);
  };

  const handleDrop = (to: number) => {
    if (fromRef.current !== null) reorderSubjects(fromRef.current, to);
    fromRef.current = null;
    setOverIdx(null);
  };

  return (
    <div style={{ width: '100%', maxWidth: '1100px', margin: '0 auto', padding: '40px 32px 80px' }}>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '20px' }}>
        Moji predmeti
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px', alignItems: 'start' }}>
        {subjects.map((s, i) => {
          const entry = getCurriculum(s.curriculum);
          if (!entry) return null;
          return (
            <div
              key={s.id}
              data-subject-card
              onDragOver={(e) => { if (fromRef.current !== null) { e.preventDefault(); setOverIdx(i); } }}
              onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
              style={{ borderRadius: 'var(--r-lg)', outline: overIdx === i && fromRef.current !== null ? '2px dashed var(--forest)' : 'none', outlineOffset: '3px', transition: 'outline-color 0.1s' }}
            >
              <SubjectCard
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
                onGripDragStart={(e) => {
                  fromRef.current = i;
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', 'subject');
                  const card = (e.currentTarget as HTMLElement).closest('[data-subject-card]');
                  if (card) e.dataTransfer.setDragImage(card as Element, 0, 20);
                }}
                onGripDragEnd={() => { fromRef.current = null; setOverIdx(null); }}
              />
            </div>
          );
        })}

        {/* Kartica za dodajanje novega predmeta – čez celotno širino */}
        <button
          onClick={onAddClick}
          style={{
            gridColumn: '1 / -1',
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

      {isAnonymous && subjects.length === 0 && (
        <p style={{ marginTop: '18px', fontSize: '13px', color: 'var(--muted)', textAlign: 'center' }}>
          Za dodajanje in shranjevanje predmetov se <a href="/login" style={{ color: 'var(--forest)', fontWeight: 500 }}>prijavite</a>. Vse se shrani na vaš profil.
        </p>
      )}

      {picker && (
        <CurriculumPicker
          schools={Array.from(new Set(subjects.map(x => x.subtitle.trim()).filter(Boolean)))}
          onPick={pick}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}
