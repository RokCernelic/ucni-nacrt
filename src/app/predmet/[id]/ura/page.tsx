'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSubjects } from '@/hooks/useSubjects';
import { getCurriculum } from '@/data/registry';
import FullscreenCountdown from '@/components/FullscreenCountdown';

export default function UraPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { subjects, loaded } = useSubjects();

  if (!loaded) return null;

  const subject = subjects.find(s => s.id === id);
  const entry = subject ? getCurriculum(subject.curriculum) : null;

  if (!subject || !entry) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '80px 32px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', color: 'var(--ink)', marginBottom: '12px' }}>
          Predmet ne obstaja
        </p>
        <Link href="/" style={{ color: 'var(--forest)', fontWeight: 500 }}>Nazaj na začetno stran</Link>
      </div>
    );
  }

  return (
    <FullscreenCountdown
      school={subject.subtitle || undefined}
      title={entry.predmet.naslov}
      subtitle={subject.subtitle || undefined}
      backHref={`/predmet/${subject.id}`}
    />
  );
}
