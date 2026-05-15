'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Enota {
  number: string;
  naslov: string;
}

interface Props {
  href: string;
  naslov: string;
  opis: string;
  enote: Enota[];
  disabled?: boolean;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"
      style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>
      <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SubjectCard({ href, naslov, opis, enote, disabled }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      background: 'var(--canvas)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--r-lg)',
      padding: '28px 28px 24px',
      opacity: disabled ? 0.45 : 1,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 400, lineHeight: 1, margin: 0 }}>
          {disabled ? (
            <span style={{ color: 'var(--ink)' }}>{naslov}</span>
          ) : (
            <Link href={href} style={{ color: 'var(--ink)', textDecoration: 'none' }}>{naslov}</Link>
          )}
        </h2>
        {disabled && (
          <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--hairline)', borderRadius: '4px', padding: '3px 8px' }}>
            Kmalu
          </span>
        )}
      </div>
      <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.55, marginBottom: enote.length > 0 ? '16px' : 0 }}>
        {opis}
      </p>

      {enote.length > 0 && (
        <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: '12px' }}>
          <button
            onClick={() => setOpen(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: open ? 'var(--forest)' : 'var(--muted)',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            }}
          >
            <ChevronIcon open={open} />
            Podpoglavja
          </button>

          {open && (
            <ol style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
              {enote.map((e, i) => (
                <li key={i} style={{
                  display: 'flex', alignItems: 'baseline', gap: '10px',
                  padding: '5px 0',
                  borderBottom: i < enote.length - 1 ? '1px solid var(--hairline)' : 'none',
                }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)', fontWeight: 500, minWidth: '28px', flexShrink: 0 }}>
                    {e.number}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--body)' }}>{e.naslov}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
