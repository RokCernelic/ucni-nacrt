'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSubjects } from '@/hooks/useSubjects';

export default function SedezniRedIndex() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { subjects, loaded } = useSubjects();

  useEffect(() => {
    if (loaded && user && subjects.length) router.replace(`/sedezni-red/${subjects[0].id}`);
  }, [loaded, user, subjects, router]);

  const isAnon = !loading && !user;

  return (
    <div>
      <div style={{ background: 'var(--forest)', padding: '32px 32px 28px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>← Nazaj</Link>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px,4vw,48px)', fontWeight: 300, color: '#fff', lineHeight: 1, margin: '10px 0 0' }}>
            Sedežni red
          </h1>
        </div>
      </div>
      <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', padding: '32px' }}>
        {isAnon ? (
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>
            Za sedežni red se <Link href="/login" style={{ color: 'var(--forest)', fontWeight: 500 }}>prijavite</Link>.
          </p>
        ) : loaded && subjects.length === 0 ? (
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>
            Najprej <Link href="/" style={{ color: 'var(--forest)', fontWeight: 500 }}>dodaj predmet</Link>, nato izberi razrede za sedežni red.
          </p>
        ) : null}
      </div>
    </div>
  );
}
