'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSubjects } from '@/hooks/useSubjects';
import { useAllClasses } from '@/hooks/useAllClasses';
import { useSelectedClass } from '@/hooks/useSelectedClass';
import { getCurriculum } from '@/data/registry';
import type { CSSProperties } from 'react';

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const sectionTitle = (active: boolean): CSSProperties => ({
  fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 400,
  letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
  color: active ? '#fff' : 'rgba(255,255,255,0.45)',
  textDecoration: 'none', flexShrink: 0, transition: 'color 0.15s',
});

const pill = (active: boolean): CSSProperties => ({
  display: 'inline-flex', alignItems: 'baseline', gap: '6px',
  fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500,
  padding: '4px 12px', borderRadius: 'var(--r-sm)',
  textDecoration: 'none', whiteSpace: 'nowrap', cursor: 'pointer',
  background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
  color: active ? '#fff' : 'rgba(255,255,255,0.6)',
  border: 'none',
  transition: 'background 0.15s, color 0.15s',
});

const ctrl: CSSProperties = {
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 'var(--r-sm)', color: 'rgba(255,255,255,0.7)',
  fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500,
  padding: '4px 12px', textDecoration: 'none', cursor: 'pointer',
};

export default function Nav() {
  const path = usePathname();
  const { user, loading, signOut } = useAuth();
  const { subjects } = useSubjects();
  const classes = useAllClasses();
  const [selectedClass, setSelectedClass] = useSelectedClass();

  const onSeating = path.startsWith('/sedezni-red');
  const ucniActive = !onSeating;

  const subjectItems = subjects
    .map((s) => {
      const entry = getCurriculum(s.curriculum);
      return entry ? { href: `/predmet/${s.id}`, label: entry.predmet.naslov, subtitle: s.subtitle } : null;
    })
    .filter((x): x is { href: string; label: string; subtitle: string } => x !== null);

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'var(--forest)', boxShadow: '0 1px 8px rgba(0,0,0,0.18)',
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', width: '100%' }}>

        {/* Levo: dvovrstični meni */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
          {/* Vrsta 1: Učni načrt + predmeti */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <Link href="/" style={sectionTitle(ucniActive)}>Učni načrt</Link>
            {ucniActive && subjectItems.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
                {subjectItems.map((s) => (
                  <Link key={s.href} href={s.href} title={s.subtitle || s.label} style={pill(path === s.href)}>
                    {s.label}
                    {s.subtitle && <span style={{ fontSize: '11px', opacity: 0.55, fontWeight: 400 }}>{s.subtitle}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Vrsta 2: Sedežni red + učilnice (samo prijavljeni) */}
          {!loading && user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
              <Link href="/sedezni-red" style={sectionTitle(onSeating)}>Sedežni red</Link>
              {onSeating && classes.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
                  {classes.map((c) => (
                    <Link
                      key={c.classId}
                      href="/sedezni-red"
                      onClick={() => setSelectedClass(c.classId)}
                      title={c.label}
                      style={pill(selectedClass === c.classId)}
                    >
                      {c.className}
                      <span style={{ fontSize: '11px', opacity: 0.55, fontWeight: 400 }}>{[c.subjectName, c.subtitle].filter(Boolean).join(' · ')}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desno: račun + nastavitve */}
        {!loading && (
          user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>
                {user.email}
              </span>
              <Link href="/nastavitve" title="Nastavitve" style={{ ...ctrl, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '28px', padding: 0 }}>
                <GearIcon />
              </Link>
              <button onClick={signOut} style={ctrl}>Odjava</button>
            </div>
          ) : (
            <Link href="/login" style={{ ...ctrl, flexShrink: 0 }}>Prijava</Link>
          )
        )}
      </div>
    </nav>
  );
}
