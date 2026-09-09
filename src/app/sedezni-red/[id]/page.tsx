'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSubjects } from '@/hooks/useSubjects';
import { getCurriculum } from '@/data/registry';
import { useMasterClasses } from '@/hooks/useMasterClasses';
import { useViewClasses } from '@/hooks/useViewClasses';
import ViewClassTabs from '@/components/ViewClassTabs';
import SeatingChart from '@/components/SeatingChart';
import { lessonsFor, canonLabel } from '@/data/timetable';

export default function SedezniRedSubjectPage() {
  const params = useParams();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const { user, loading } = useAuth();
  const { subjects, loaded } = useSubjects();
  const { classes: master } = useMasterClasses();
  const { ids, activeId, setActive, addToView, removeFromView } = useViewClasses('sedez', id);

  if (loading || !loaded) return null;

  const subject = subjects.find(s => s.id === id);
  const entry = subject ? getCurriculum(subject.curriculum) : null;
  const activeClass = master.find(m => m.id === activeId) ?? null;
  const context = entry && activeClass ? [entry.predmet.naslov, activeClass.school].filter(Boolean).join(' · ') : entry?.predmet.naslov ?? '';
  const lessons = activeClass
    ? lessonsFor(canonLabel(activeClass.name), `${activeClass.name} ${activeClass.school}`)
    : [];
  const grade = activeClass ? Number((activeClass.name.match(/[6-9]/) ?? [])[0]) : NaN;
  const totalHours = entry && Number.isFinite(grade) ? entry.gradeTargets[grade] : undefined;

  return (
    <div>
      <div style={{ background: 'var(--forest)', padding: '32px 32px 28px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>← Nazaj</Link>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '12px 0 6px' }}>
            Sedežni red{subject?.subtitle ? ` · ${subject.subtitle}` : ''}
          </p>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px,4vw,48px)', fontWeight: 300, color: '#fff', lineHeight: 1 }}>
            {entry ? entry.predmet.naslov : 'Sedežni red'}
          </h1>
          {user && subject && entry && (
            <ViewClassTabs master={master} ids={ids} activeId={activeId} onSelect={setActive} onAdd={addToView} onRemove={removeFromView} />
          )}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', padding: '32px' }}>
        {!user ? (
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>
            Za sedežni red se <Link href="/login" style={{ color: 'var(--forest)', fontWeight: 500 }}>prijavite</Link>.
          </p>
        ) : !subject || !entry ? (
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>Predmet ne obstaja. <Link href="/" style={{ color: 'var(--forest)' }}>Nazaj</Link></p>
        ) : !activeClass ? (
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>
            Dodaj razred z gumbom <b>+</b> zgoraj (razrede ustvariš v <Link href="/nastavitve" style={{ color: 'var(--forest)' }}>Nastavitve → Razredi</Link>).
          </p>
        ) : (
          <SeatingChart classId={activeId!} className={activeClass.name} contextLabel={context} lessons={lessons} totalHours={totalHours} />
        )}
      </div>
    </div>
  );
}
