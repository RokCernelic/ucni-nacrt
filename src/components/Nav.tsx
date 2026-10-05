'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import CurriculumPicker from '@/components/CurriculumPicker';
import { useAuth } from '@/hooks/useAuth';
import { useSubjects } from '@/hooks/useSubjects';
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

const item = (active: boolean): CSSProperties => ({
  fontFamily: 'var(--font-serif)', fontSize: 'clamp(15px, 1.7vw, 18px)', fontWeight: 400,
  letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
  color: active ? '#fff' : 'rgba(255,255,255,0.5)',
  textDecoration: 'none', flexShrink: 0, transition: 'color 0.15s',
  borderBottom: `2px solid ${active ? 'rgba(255,255,255,0.7)' : 'transparent'}`,
  paddingBottom: '2px',
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
  const { subjects, addSubject, updateSubtitle } = useSubjects();
  const [picker, setPicker] = useState(false);
  const router = useRouter();

  // učenčev iPad (/k, /k/KODA) — brez menija aplikacije
  if (path === '/k' || path.startsWith('/k/')) return null;

  const onSeating = path.startsWith('/sedezni-red');
  const onQuizzes = path.startsWith('/kvizi');
  const onSettings = path.startsWith('/nastavitve');
  const ucniActive = !onSeating && !onQuizzes && !onSettings && path !== '/login';

  const subjectItems = subjects
    .map((s) => {
      const entry = getCurriculum(s.curriculum);
      return entry ? { id: s.id, label: entry.predmet.naslov, subtitle: s.subtitle } : null;
    })
    .filter((x): x is { id: string; label: string; subtitle: string } => x !== null);

  const subjectBase = ucniActive ? '/predmet' : onSeating ? '/sedezni-red' : null;

  const pick = (curriculumId: string, school: string) => {
    const id = addSubject(curriculumId);
    if (school) updateSubtitle(id, school);
    setPicker(false);
    router.push(`${subjectBase ?? '/predmet'}/${id}`);
  };

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'var(--forest)', boxShadow: '0 1px 8px rgba(0,0,0,0.18)',
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '12px 32px 10px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 'clamp(16px, 2.5vw, 28px)', rowGap: '6px' }}>
          <Link href="/" style={item(ucniActive)}>Učni načrt</Link>
          {!loading && user && (
            <>
              <Link href="/sedezni-red" style={item(onSeating)}>Sedežni red</Link>
              <Link href="/kvizi" style={item(onQuizzes)}>Kvizi</Link>
              <span style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
                <Link href="/nastavitve" title="Nastavitve" aria-label="Nastavitve"
                  style={{ ...ctrl, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '28px', padding: 0,
                    ...(onSettings ? { background: 'rgba(255,255,255,0.2)', color: '#fff' } : {}) }}>
                  <GearIcon />
                </Link>
                <button onClick={signOut} style={ctrl}>Odjava</button>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>
                  {user.email}
                </span>
              </div>
            </>
          )}
          {!loading && !user && (
            <>
              <span style={{ flex: 1 }} />
              <Link href="/login" style={{ ...ctrl, flexShrink: 0 }}>Prijava</Link>
            </>
          )}
        </div>

        {subjectBase && !loading && user && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
            {subjectItems.map((s) => (
              <Link key={s.id} href={`${subjectBase}/${s.id}`} title={s.subtitle || s.label} style={pill(path === `${subjectBase}/${s.id}`)}>
                {s.label}
                {s.subtitle && <span style={{ fontSize: '11px', opacity: 0.55, fontWeight: 400 }}>{s.subtitle}</span>}
              </Link>
            ))}
            <button onClick={() => setPicker(true)} title="Dodaj predmet (učni načrt)" aria-label="Dodaj predmet"
              style={{ ...pill(false), border: '1px dashed rgba(255,255,255,0.3)', background: 'transparent', padding: '4px 10px', fontSize: '15px', lineHeight: 1 }}>
              +
            </button>
          </div>
        )}
        {picker && (
          <CurriculumPicker
            schools={Array.from(new Set(subjects.map(x => x.subtitle.trim()).filter(Boolean)))}
            onPick={pick}
            onClose={() => setPicker(false)}
          />
        )}
      </div>
    </nav>
  );
}
