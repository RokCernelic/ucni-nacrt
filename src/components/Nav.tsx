'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSubjects } from '@/hooks/useSubjects';
import { getCurriculum } from '@/data/registry';
import SettingsModal from '@/components/SettingsModal';

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
  const { subjects } = useSubjects();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const navItems = subjects
    .map((s) => {
      const entry = getCurriculum(s.curriculum);
      return entry ? { href: `/predmet/${s.id}`, label: entry.predmet.naslov, subtitle: s.subtitle } : null;
    })
    .filter((x): x is { href: string; label: string; subtitle: string } => x !== null);

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

        <div style={{ display: 'flex', gap: '4px', flex: 1, overflowX: 'auto' }}>
          {navItems.map((s) => {
            const active = path === s.href;
            return (
              <Link
                key={s.href}
                href={s.href}
                title={s.subtitle || s.label}
                style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: '6px',
                  fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500,
                  padding: '5px 14px', borderRadius: 'var(--r-sm)',
                  textDecoration: 'none', whiteSpace: 'nowrap',
                  background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {s.label}
                {s.subtitle && (
                  <span style={{ fontSize: '11px', opacity: 0.55, fontWeight: 400 }}>{s.subtitle}</span>
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
