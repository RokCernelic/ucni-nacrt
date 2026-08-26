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
  subtitle: string;
  onSubtitleChange: (v: string) => void;
  enote: Enota[];
  onDelete?: () => void;
  onGripDragStart?: (e: React.DragEvent) => void;
  onGripDragEnd?: () => void;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"
      style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>
      <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 10 14" fill="none" style={{ flexShrink: 0 }}>
      {[3, 7, 11].flatMap((cy) => [3, 7].map((cx) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.2" fill="currentColor" />
      )))}
    </svg>
  );
}

export default function SubjectCard({ href, naslov, subtitle, onSubtitleChange, enote, onDelete, onGripDragStart, onGripDragEnd }: Props) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <div style={{
      background: 'var(--canvas)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--r-lg)',
      padding: '28px 28px 24px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
        {onGripDragStart && (
          <span
            draggable
            onDragStart={onGripDragStart}
            onDragEnd={onGripDragEnd}
            title="Povleci za preureditev"
            style={{ cursor: 'grab', color: 'var(--muted)', flexShrink: 0, alignSelf: 'center', marginRight: '2px', display: 'flex', alignItems: 'center' }}
          >
            <GripIcon />
          </span>
        )}
        <h2 style={{ flex: 1, fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 400, lineHeight: 1, margin: 0 }}>
          <Link href={href} style={{ color: 'var(--ink)', textDecoration: 'none' }}>{naslov}</Link>
        </h2>
        {onDelete && (
          <button
            onClick={onDelete}
            title="Odstrani predmet"
            style={{ flexShrink: 0, background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', color: 'var(--muted)', width: '26px', height: '26px', cursor: 'pointer', fontSize: '15px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ×
          </button>
        )}
      </div>

      <input
        value={subtitle}
        onChange={(e) => onSubtitleChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Dodaj podnaslov (npr. OŠ Cerklje ob Krki)"
        style={{
          width: '100%', boxSizing: 'border-box',
          fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--body)',
          background: 'transparent', border: 'none', outline: 'none',
          borderBottom: `1px solid ${focused ? 'var(--forest)' : 'transparent'}`,
          padding: '2px 0', marginBottom: enote.length > 0 ? '16px' : 0,
          transition: 'border-color 0.15s',
        }}
      />

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
