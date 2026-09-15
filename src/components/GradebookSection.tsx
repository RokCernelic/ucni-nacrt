'use client';

import { useState, useEffect } from 'react';
import { useMasterClasses } from '@/hooks/useMasterClasses';
import { useRoster, parseRoster, rosterToText } from '@/hooks/useRoster';

function RosterEditor({ classId, className }: { classId: string; className: string }) {
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

  // Popravek imena na mestu: ohrani id, PIN in vse oznake (besedilno polje bi ga obravnavalo kot novega učenca).
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renameStudent = (id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    save(students.map(s => (s.id === id ? { ...s, name: clean } : s)));
  };

  // Natisni listke s PIN-i (ločeno okno, da ne vpliva na tisk sedežnega reda)
  const printPins = () => {
    const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const slips = students.map(s => `<div class="slip"><div class="cls">${esc(className)}</div><div class="name">${esc(s.name)}</div><div class="pin">${esc(s.pin ?? '—')}</div><div class="hint">PIN za kviz</div></div>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html lang="sl"><head><meta charset="utf-8"><title>PIN-i — ${esc(className)}</title><style>
      body{font-family:-apple-system,Inter,sans-serif;margin:12mm;color:#222}
      h1{font-size:16px;margin:0 0 8mm}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0}
      .slip{border:1px dashed #999;padding:5mm 4mm;text-align:center;break-inside:avoid}
      .cls{font-size:10px;color:#777;letter-spacing:.08em;text-transform:uppercase}
      .name{font-size:14px;font-weight:600;margin:2mm 0}
      .pin{font-size:30px;font-weight:700;letter-spacing:.12em;font-variant-numeric:tabular-nums}
      .hint{font-size:9px;color:#999;margin-top:1mm}
      @media print{h1{display:none}body{margin:8mm}}
    </style></head><body><h1>PIN-i za kvize — ${esc(className)} (izreži po črtkanih črtah)</h1><div class="grid">${slips}</div>
    <script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`);
    w.document.close();
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
          <RosterEditor key={cur.id} classId={cur.id} className={[cur.name, cur.school].filter(Boolean).join(' · ')} />
        </div>
      )}
    </>
  );
}
