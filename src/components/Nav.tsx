'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import SettingsModal from '@/components/SettingsModal';

const subjects: { href: string; label: string; disabled?: boolean }[] = [
  { href: '/fizika', label: 'Fizika' },
  { href: '/tehnika', label: 'Tehnika in tehnologija' },
];

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function Nav() {
  const path = usePathname();
  const { user, loading, signOut } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

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
                onClick={() => setSettingsOpen(true)}
                title="Nastavitve"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 'var(--r-sm)',
                  color: 'rgba(255,255,255,0.7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '30px', height: '28px',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                <GearIcon />
              </button>
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
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </nav>
  );
}
