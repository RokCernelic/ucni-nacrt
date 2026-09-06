'use client';

import { useState, useEffect } from 'react';
import { useAllClasses } from '@/hooks/useAllClasses';
import { useRoster, parseRoster, rosterToText } from '@/hooks/useRoster';

function RosterEditor({ classId }: { classId: string }) {
  const { students, save } = useRoster(classId);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { setText(rosterToText(students)); }, [students]);

  const parsed = parseRoster(text);
  const m = parsed.filter(s => s.gender === 'M').length;
  const z = parsed.filter(s => s.gender === 'Ž').length;

  return (
    <div>
      <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', lineHeight: 1.5 }}>
        Prilepi učence — vsaka vrstica: <b>Ime Priimek, Ž/M</b>. Nato Shrani.
      </p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        placeholder={'Ana Novak, Ž\nJan Kos, M\nEva Horvat, Ž'}
        rows={10}
        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-sans)', fontSize: '13px', lineHeight: 1.6, color: 'var(--ink)', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '10px 12px', outline: 'none', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
        <button
          onClick={() => { save(parseRoster(text)); setSaved(true); }}
          style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '8px 16px', cursor: 'pointer' }}>
          Shrani učence
        </button>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          {parsed.length} učencev{parsed.length ? ` · ${z} Ž / ${m} M` : ''}
        </span>
        {saved && <span style={{ fontSize: '12px', color: 'var(--green-ok)' }}>Shranjeno ✓</span>}
      </div>
    </div>
  );
}

export default function GradebookSection() {
  const classes = useAllClasses();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (classes.length && !classes.find(c => c.classId === selected)) setSelected(classes[0].classId);
  }, [classes, selected]);

  if (classes.length === 0) {
    return (
      <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
        Najprej ustvari razrede pri predmetih (vrstica z <b>+</b> nad učnim načrtom). Nato jih boš tu napolnil z učenci.
      </p>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {classes.map(c => {
          const active = c.classId === selected;
          return (
            <button
              key={c.classId}
              onClick={() => setSelected(c.classId)}
              title={c.label}
              style={{
                fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: active ? 600 : 500,
                color: active ? '#fff' : 'var(--forest)',
                background: active ? 'var(--forest)' : 'transparent',
                border: `1px solid ${active ? 'var(--forest)' : 'var(--hairline)'}`,
                borderRadius: 'var(--r-sm)', padding: '6px 12px', cursor: 'pointer',
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {selected && <RosterEditor key={selected} classId={selected} />}
    </>
  );
}
