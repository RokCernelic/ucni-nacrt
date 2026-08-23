'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const subjects: { href: string; label: string; disabled?: boolean }[] = [
  { href: '/fizika', label: 'Fizika' },
  { href: '/tehnika', label: 'Tehnika in tehnologija' },
];

export default function Nav() {
  const path = usePathname();
  const { user, loading, signOut } = useAuth();

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'var(--forest)',
      height: '56px', display: 'flex', alignItems: 'center',
      boxShadow: '0 1px 8px rgba(0,0,0,0.18)',
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 32px', display: 'flex', alignItems: 'center', gap: '32px', width: '100%' }}>
        <Link href="/" style={{
          fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 400,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: '#fff', textDecoration: 'none', flexShrink: 0,
        }}>
          Učni načrt
        </Link>

        <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
          {subjects.map((s) => {
            const active = path.startsWith(s.href);
            return (
              <Link
                key={s.href}
                href={s.disabled ? '#' : s.href}
                style={{
                  fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500,
                  padding: '5px 14px', borderRadius: 'var(--r-sm)',
                  textDecoration: 'none',
                  background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: s.disabled ? 'rgba(255,255,255,0.3)' : active ? '#fff' : 'rgba(255,255,255,0.65)',
                  cursor: s.disabled ? 'default' : 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                  pointerEvents: s.disabled ? 'none' : 'auto',
                }}
              >
                {s.label}
                {s.disabled && (
                  <span style={{ marginLeft: '6px', fontSize: '10px', opacity: 0.5 }}>kmalu</span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Auth controls */}
        {!loading && (
          user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
                {user.email}
              </span>
              <button
                onClick={signOut}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 'var(--r-sm)',
                  color: 'rgba(255,255,255,0.7)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '4px 12px',
                  cursor: 'pointer',
                }}
              >
                Odjava
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 'var(--r-sm)',
                color: 'rgba(255,255,255,0.7)',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 500,
                padding: '4px 12px',
                textDecoration: 'none',
                marginLeft: 'auto',
                flexShrink: 0,
              }}
            >
              Prijava
            </Link>
          )
        )}
      </div>
    </nav>
  );
}
