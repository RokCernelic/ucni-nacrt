'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRoster, parseRoster, rosterToText } from '@/hooks/useRoster';
import StudentHistoryDialog from '@/components/quiz/StudentHistoryDialog';

export default function RosterEditor({ classId, className }: { classId: string; className: string }) {
  const { students, save } = useRoster(classId);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { setText(rosterToText(students)); }, [students]);

  const parsed = parseRoster(text);
  const m = parsed.filter(s => s.gender === 'M').length;
  const z = parsed.filter(s => s.gender === 'Ž').length;

  // Ob shranjevanju iz besedila ohrani vse podatke obstoječih učencev (id, PIN, oznake)
  // — ujemanje po imenu; spremenita se le ime in spol. Tako ostanejo razporedi in PIN-i.
  const handleSave = () => {
    const prevByName = new Map(students.map(s => [s.name.trim().toLowerCase(), s]));
    const merged = parseRoster(text).map(p => {
      const prev = prevByName.get(p.name.trim().toLowerCase());
      return prev ? { ...prev, name: p.name, gender: p.gender } : p;
    });
    save(merged);
    setSaved(true);
  };

  const missingPins = students.some(s => !s.pin);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);

  // Popravek imena na mestu: ohrani id, PIN in vse oznake (besedilno polje bi ga obravnavalo kot novega učenca).
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renameStudent = (id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    save(students.map(s => (s.id === id ? { ...s, name: clean } : s)));
  };

  // Listki s PIN-i se natisnejo neposredno s te strani (brez pojavnega okna, ki ga brskalniki radi blokirajo):
  // med tiskom je viden le ta element, vse ostalo je skrito (globals.css, html.printing-pins).
  const printPins = () => {
    const root = document.documentElement;
    const done = () => { root.classList.remove('printing-pins'); window.removeEventListener('afterprint', done); };
    root.classList.add('printing-pins');
    window.addEventListener('afterprint', done);
    window.print();
  };

  const toggleFront = (id: string) =>
    save(students.map(s => (s.id === id ? { ...s, frontRow: !s.frontRow } : s)));
  const toggleNextToBoy = (id: string) =>
    save(students.map(s => (s.id === id ? { ...s, nextToBoy: !s.nextToBoy } : s)));

  return (
    <div>
      <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '14px 0 8px', lineHeight: 1.5 }}>
        Učenci — vsaka vrstica: <b>Ime Priimek, Ž/M</b>. Nato Shrani.
      </p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        placeholder={'Ana Novak, Ž\nJan Kos, M\nEva Horvat, Ž'}
        rows={9}
        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-sans)', fontSize: '13px', lineHeight: 1.6, color: 'var(--ink)', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '10px 12px', outline: 'none', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
        <button
          onClick={handleSave}
          style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '8px 16px', cursor: 'pointer' }}>
          Shrani učence
        </button>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          {parsed.length} učencev{parsed.length ? ` · ${z} Ž / ${m} M` : ''}
        </span>
        {saved && <span style={{ fontSize: '12px', color: 'var(--green-ok)' }}>Shranjeno ✓</span>}
      </div>

      {/* Seznam shranjenih učencev z oznako »prva vrsta« */}
      {students.length > 0 && (
        <div style={{ marginTop: '18px', borderTop: '1px solid var(--hairline)', paddingTop: '14px' }}>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
            <b>1↓ Prva vrsta</b> — učenec vedno sedi v prvi vrsti (pri tabli), a naključno premešan znotraj nje.
            <br /><b>👦 Ob fantu</b> — učenec ima vedno vsaj enega soseda fanta.
            <br /><b>PIN</b> — 4-mestna številka, s katero se učenec prijavi v kviz na iPadu. Dodeli se enkrat in se ne spreminja.
            <br /><b>✎</b> — tipkarske napake v imenu popravi tukaj, ne v besedilnem polju zgoraj (tam bi učenec dobil nov PIN).
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
            {missingPins ? (
              <button onClick={() => save(students)}
                style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '7px 14px', cursor: 'pointer' }}>
                Dodeli PIN-e za kvize
              </button>
            ) : (
              <button onClick={printPins}
                style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, color: 'var(--forest)', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '7px 14px', cursor: 'pointer' }}>
                🖨 Natisni PIN-e (listki)
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {students.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
                {renamingId === s.id ? (
                  <input autoFocus defaultValue={s.name}
                    onBlur={e => { renameStudent(s.id, e.currentTarget.value); setRenamingId(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenamingId(null); }}
                    style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)', border: '1px solid var(--forest)', borderRadius: 'var(--r-sm)', padding: '4px 8px' }} />
                ) : (
                  <span style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)' }}>
                    {s.name}
                    {s.gender && <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px' }}>{s.gender}</span>}
                    <button onClick={() => setRenamingId(s.id)} title="Popravi ime (PIN, sedežni red in napredek ostanejo)"
                      style={{ marginLeft: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px', padding: '0 2px' }}>✎</button>
                  </span>
                )}
                <span title="PIN za kviz" style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em', color: s.pin ? 'var(--ink)' : 'var(--muted)', minWidth: '44px', textAlign: 'right' }}>
                  {s.pin ?? '—'}
                </span>
                {s.pin && (
                  <button onClick={() => setHistoryFor({ id: s.id, name: s.name })} title="Zgodovina kvizov"
                    style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: 'var(--forest)', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '5px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    📊
                  </button>
                )}
                <button
                  onClick={() => toggleNextToBoy(s.id)}
                  title="Vedno sedi ob fantu"
                  style={{
                    fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600,
                    color: s.nextToBoy ? '#fff' : 'var(--forest)',
                    background: s.nextToBoy ? 'var(--forest)' : 'transparent',
                    border: `1px solid ${s.nextToBoy ? 'var(--forest)' : 'var(--hairline)'}`,
                    borderRadius: 'var(--r-sm)', padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                  👦 Ob fantu
                </button>
                <button
                  onClick={() => toggleFront(s.id)}
                  title="Vedno v prvi vrsti (pri tabli)"
                  style={{
                    fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600,
                    color: s.frontRow ? '#fff' : 'var(--forest)',
                    background: s.frontRow ? 'var(--forest)' : 'transparent',
                    border: `1px solid ${s.frontRow ? 'var(--forest)' : 'var(--hairline)'}`,
                    borderRadius: 'var(--r-sm)', padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                  1↓ Prva vrsta
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {historyFor && <StudentHistoryDialog studentId={historyFor.id} studentName={historyFor.name} onClose={() => setHistoryFor(null)} />}
      {typeof document !== 'undefined' && createPortal(
        <div className="print-pins" aria-hidden>
          <div className="print-pins-grid">
            {students.map(st => (
              <div key={st.id} className="print-pins-slip">
                <div className="cls">{className}</div>
                <div className="name">{st.name}</div>
                <div className="pin">{st.pin ?? '—'}</div>
                <div className="hint">PIN za kviz</div>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
