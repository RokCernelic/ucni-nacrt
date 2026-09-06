'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSubjects } from '@/hooks/useSubjects';
import { getCurriculum } from '@/data/registry';
import { useClasses } from '@/hooks/useClasses';
import ClassTabs from '@/components/ClassTabs';
import SeatingChart from '@/components/SeatingChart';

export default function SedezniRedSubjectPage() {
  const params = useParams();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const { user, loading } = useAuth();
  const { subjects, loaded } = useSubjects();
  const { classes, activeId, activeClass, addClass, renameClass, removeClass, selectClass, reorderClasses } = useClasses(id);

  if (loading || !loaded) return null;

  const subject = subjects.find(s => s.id === id);
  const entry = subject ? getCurriculum(subject.curriculum) : null;

  const context = entry ? [entry.predmet.naslov, subject!.subtitle].filter(Boolean).join(' · ') : '';

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
          {!user ? null : !subject || !entry ? null : (
            <ClassTabs
              classes={classes}
              activeId={activeId}
              onSelect={selectClass}
              onAdd={addClass}
              onRename={renameClass}
              onDelete={removeClass}
              onReorder={reorderClasses}
              isAnonymous={false}
            />
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
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>Dodaj razred zgoraj (gumb +), da začneš s sedežnim redom.</p>
        ) : (
          <SeatingChart classId={activeId!} className={activeClass.name} contextLabel={context} />
        )}
      </div>
    </div>
  );
}
