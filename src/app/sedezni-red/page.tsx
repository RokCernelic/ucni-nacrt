'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import SeatingChart from '@/components/SeatingChart';

export default function SedezniRedPage() {
  const { user, loading } = useAuth();
  const isAnon = !loading && !user;

  return (
    <div>
      <div style={{ background: 'var(--forest)', padding: '32px 32px 28px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>← Nazaj</Link>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px,4vw,48px)', fontWeight: 300, color: '#fff', lineHeight: 1, marginTop: '10px' }}>
            Sedežni red
          </h1>
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
