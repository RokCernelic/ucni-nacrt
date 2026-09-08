'use client';

import { useState, useEffect } from 'react';
import { useMasterClasses } from '@/hooks/useMasterClasses';
import { useRoster, parseRoster, rosterToText } from '@/hooks/useRoster';

function RosterEditor({ classId }: { classId: string }) {
  const { students, save } = useRoster(classId);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { setText(rosterToText(students)); }, [students]);

  const parsed = parseRoster(text);
  const m = parsed.filter(s => s.gender === 'M').length;
  const z = parsed.filter(s => s.gender === 'Ž').length;

  // Ob shranjevanju iz besedila ohrani id in oznako »prva vrsta« za učence,
  // ki že obstajajo (ujemanje po imenu) — tako ostanejo tudi razporedi sedežev.
  const handleSave = () => {
    const prevByName = new Map(students.map(s => [s.name.trim().toLowerCase(), s]));
    const merged = parseRoster(text).map(p => {
      const prev = prevByName.get(p.name.trim().toLowerCase());
      return prev ? { ...p, id: prev.id, frontRow: prev.frontRow } : p;
    });
    save(merged);
    setSaved(true);
  };

  const toggleFront = (id: string) =>
    save(students.map(s => (s.id === id ? { ...s, frontRow: !s.frontRow } : s)));

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
            Klikni <b>1↓ Prva vrsta</b>, da učenca vedno postaviš v prvo vrsto (pri tabli). Sedežni red ga bo še vedno naključno premešal — a le znotraj prve vrste.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {students.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
                <span style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)' }}>
                  {s.name}
                  {s.gender && <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px' }}>{s.gender}</span>}
                </span>
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
    </div>
  );
}

export default function GradebookSection() {
  const { classes, addClass, updateClass, removeClass } = useMasterClasses();
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newSchool, setNewSchool] = useState('');

  useEffect(() => {
    if (classes.length && !classes.find(c => c.id === selected)) setSelected(classes[0].id);
  }, [classes, selected]);

  const cur = classes.find(c => c.id === selected) ?? null;
  const input: React.CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '7px 10px', outline: 'none' };

  return (
    <>
      <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px', lineHeight: 1.5 }}>
        Tu ustvariš svoje razrede (deljene med predmeti) in vpišeš učence. V menijih (Učni načrt / Sedežni red) jih nato le dodaš.
      </p>

      {/* zavihki razredov */}
      {classes.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {classes.map(c => {
            const active = c.id === selected;
            return (
              <button key={c.id} onClick={() => setSelected(c.id)} title={[c.name, c.school].filter(Boolean).join(' · ')}
                style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: active ? 600 : 500, color: active ? '#fff' : 'var(--forest)', background: active ? 'var(--forest)' : 'transparent', border: `1px solid ${active ? 'var(--forest)' : 'var(--hairline)'}`, borderRadius: 'var(--r-sm)', padding: '6px 12px', cursor: 'pointer' }}>
                {c.name}{c.school ? ` · ${c.school}` : ''}
              </button>
            );
          })}
        </div>
      )}

      {/* dodaj nov razred */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '20px' }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="razred (npr. 8A)" style={{ ...input, width: '130px' }} />
        <input value={newSchool} onChange={e => setNewSchool(e.target.value)} placeholder="šola (npr. OŠ Cerklje)" style={{ ...input, flex: '1 1 180px' }} />
        <button
          onClick={() => { if (newName.trim()) { const id = addClass(newName, newSchool); setSelected(id); setNewName(''); setNewSchool(''); } }}
          style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: 'var(--forest)', background: 'transparent', border: '1px dashed var(--hairline)', borderRadius: 'var(--r-sm)', padding: '8px 14px', cursor: 'pointer' }}>
          + Dodaj razred
        </button>
      </div>

      {/* urejanje izbranega razreda */}
      {cur && (
        <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: '18px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={cur.name} onChange={e => updateClass(cur.id, { name: e.target.value })} placeholder="razred" style={{ ...input, width: '120px' }} />
            <input value={cur.school} onChange={e => updateClass(cur.id, { school: e.target.value })} placeholder="šola" style={{ ...input, flex: '1 1 180px' }} />
            <button
              onClick={() => { if (confirm(`Izbrišem razred »${cur.name}${cur.school ? ' · ' + cur.school : ''}« in vse njegove učence in sedežni red? Odstrani se tudi iz vseh menijev.`)) removeClass(cur.id); }}
              style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, color: '#c0392b', background: 'transparent', border: '1px solid #e0b4ae', borderRadius: 'var(--r-sm)', padding: '8px 14px', cursor: 'pointer' }}>
              Izbriši razred
            </button>
          </div>
          <RosterEditor key={cur.id} classId={cur.id} />
        </div>
      )}
    </>
  );
}
