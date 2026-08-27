'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSchedules, schoolKey, toMinutes, type Lesson } from '@/hooks/useSchedule';
import { useSubjects } from '@/hooks/useSubjects';
import { CURRICULA } from '@/data/registry';
import { curriculumToText, downloadText } from '@/lib/exportCurriculum';

export default function SettingsPage() {
  const { user, loading, updateEmail, updatePassword } = useAuth();
  const { getSchedule, setSchedule } = useSchedules();
  const { subjects } = useSubjects();

  const isAnon = !loading && !user;

  // Šole = različni podnaslovi predmetov (brez privzetega)
  const schools = useMemo(() => {
    const set = new Set<string>();
    subjects.forEach(s => { const k = schoolKey(s.subtitle); if (k) set.add(k); });
    return Array.from(set);
  }, [subjects]);
  const [selectedSchool, setSelectedSchool] = useState('');

  // izberi prvo šolo, ko trenutna izbira ni več veljavna
  useEffect(() => {
    if (schools.length && !schools.includes(selectedSchool)) setSelectedSchool(schools[0]);
  }, [schools, selectedSchool]);

  const [email, setEmail] = useState(user?.email ?? '');
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [rows, setRows] = useState<Lesson[]>([]);
  const [savedMsg, setSavedMsg] = useState(false);

  // Naloži urnik izbrane šole (in ob nalaganju iz shrambe)
  useEffect(() => { setRows(getSchedule(selectedSchool)); }, [selectedSchool, getSchedule]);

  const handleEmail = async () => {
    setEmailMsg(null);
    const trimmed = email.trim();
    if (!trimmed || trimmed === user?.email) { setEmailMsg({ ok: false, text: 'Vpišite nov e-naslov.' }); return; }
    setEmailBusy(true);
    const error = await updateEmail(trimmed);
    setEmailBusy(false);
    setEmailMsg(error
      ? { ok: false, text: error.message }
      : { ok: true, text: 'Za potrditev preverite e-pošto na novem naslovu.' });
  };

  const handlePassword = async () => {
    setPwMsg(null);
    if (pw1.length < 6) { setPwMsg({ ok: false, text: 'Geslo mora imeti vsaj 6 znakov.' }); return; }
    if (pw1 !== pw2) { setPwMsg({ ok: false, text: 'Gesli se ne ujemata.' }); return; }
    setPwBusy(true);
    const error = await updatePassword(pw1);
    setPwBusy(false);
    if (error) { setPwMsg({ ok: false, text: error.message }); return; }
    setPw1(''); setPw2('');
    setPwMsg({ ok: true, text: 'Geslo je posodobljeno.' });
  };

  const updateRow = (i: number, field: keyof Lesson, value: string) => {
    setRows(prev => prev.map((r, j) => j === i ? { ...r, [field]: value } : r));
    setSavedMsg(false);
  };
  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows(prev => [...prev, { name: '', start: last?.end ?? '08:00', end: '' }]);
    setSavedMsg(false);
  };
  const removeRow = (i: number) => { setRows(prev => prev.filter((_, j) => j !== i)); setSavedMsg(false); };
  const byStart = (a: Lesson, b: Lesson) => (a.start ? toMinutes(a.start) : 1e9) - (b.start ? toMinutes(b.start) : 1e9);
  const sortRows = () => setRows(prev => [...prev].sort(byStart));
  const saveSchedule = () => {
    const clean = rows.filter(r => r.start && r.end).sort(byStart);
    setSchedule(selectedSchool, clean);
    setRows(clean);
    setSavedMsg(true);
  };

  const label: React.CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' };
  const inputStyle: React.CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '7px 10px', outline: 'none' };
  const primaryBtn: React.CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '8px 16px', cursor: 'pointer' };
  const card: React.CSSProperties = { background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-sm)', padding: '24px' };

  return (
    <div>
      {/* Hero */}
      <div style={{ background: 'var(--forest)', padding: '32px 32px 28px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', width: '100%' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>← Nazaj</Link>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px,4vw,44px)', fontWeight: 300, color: '#fff', lineHeight: 1, marginTop: '10px' }}>
            Nastavitve
          </h1>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '760px', margin: '0 auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Račun */}
        <div style={card}>
          <div style={{ ...label, marginBottom: '6px' }}>E-naslov</div>
          {isAnon ? (
            <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
              Za urejanje računa se <Link href="/login" style={{ color: 'var(--forest)', fontWeight: 500 }}>prijavite</Link>.
            </p>
          ) : (
            <>
              <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>
                Trenutni: <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{user?.email ?? '—'}</span>
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailMsg(null); }} placeholder="nov e-naslov" style={{ ...inputStyle, flex: '1 1 240px' }} />
                <button onClick={handleEmail} disabled={emailBusy} style={{ ...primaryBtn, cursor: emailBusy ? 'default' : 'pointer', opacity: emailBusy ? 0.6 : 1 }}>
                  {emailBusy ? 'Pošiljam …' : 'Posodobi'}
                </button>
              </div>
              {emailMsg && <p style={{ marginTop: '8px', fontSize: '12px', color: emailMsg.ok ? 'var(--green-ok)' : '#c0392b' }}>{emailMsg.text}</p>}

              <div style={{ ...label, margin: '22px 0 10px' }}>Sprememba gesla</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input type="password" value={pw1} onChange={(e) => { setPw1(e.target.value); setPwMsg(null); }} placeholder="novo geslo" autoComplete="new-password" style={{ ...inputStyle, flex: '1 1 160px' }} />
                <input type="password" value={pw2} onChange={(e) => { setPw2(e.target.value); setPwMsg(null); }} placeholder="ponovi geslo" autoComplete="new-password" style={{ ...inputStyle, flex: '1 1 160px' }} />
                <button onClick={handlePassword} disabled={pwBusy} style={{ ...primaryBtn, cursor: pwBusy ? 'default' : 'pointer', opacity: pwBusy ? 0.6 : 1 }}>
                  {pwBusy ? 'Shranjujem …' : 'Posodobi'}
                </button>
              </div>
              {pwMsg && <p style={{ marginTop: '8px', fontSize: '12px', color: pwMsg.ok ? 'var(--green-ok)' : '#c0392b' }}>{pwMsg.text}</p>}
            </>
          )}
        </div>

        {/* Urnik ur */}
        <div style={card}>
          <div style={{ ...label, marginBottom: '4px' }}>Urnik šolskih ur</div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '14px', lineHeight: 1.5 }}>
            Ime, začetek in konec vsake ure. To poganja odštevalnik do konca / začetka ure.
            {schools.length > 0 && ' Vsaka šola (podnaslov predmeta) ima svoj urnik.'}
          </p>

          {schools.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
              Dodaj predmet in mu vpiši <b>podnaslov (šolo)</b>, da nastaviš njen urnik.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {schools.map(s => {
                  const active = s === selectedSchool;
                  return (
                    <button
                      key={s}
                      onClick={() => { setSelectedSchool(s); setSavedMsg(false); }}
                      style={{
                        fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: active ? 600 : 500,
                        color: active ? '#fff' : 'var(--forest)',
                        background: active ? 'var(--forest)' : 'transparent',
                        border: `1px solid ${active ? 'var(--forest)' : 'var(--hairline)'}`,
                        borderRadius: 'var(--r-sm)', padding: '6px 14px', cursor: 'pointer',
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rows.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <input type="text" value={r.name ?? ''} placeholder="ime ure" onChange={(e) => updateRow(i, 'name', e.target.value)} style={{ ...inputStyle, flex: '1 1 120px', minWidth: '90px' }} />
                    <input type="time" value={r.start} onChange={(e) => updateRow(i, 'start', e.target.value)} onBlur={sortRows} style={inputStyle} />
                    <span style={{ color: 'var(--muted)' }}>–</span>
                    <input type="time" value={r.end} onChange={(e) => updateRow(i, 'end', e.target.value)} style={inputStyle} />
                    <button onClick={() => removeRow(i)} title="Odstrani uro" style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', color: 'var(--muted)', width: '28px', height: '28px', cursor: 'pointer', fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
                <button onClick={addRow} style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, color: 'var(--forest)', background: 'transparent', border: '1px dashed var(--hairline)', borderRadius: 'var(--r-sm)', padding: '7px 14px', cursor: 'pointer' }}>
                  + Dodaj uro
                </button>
                <button onClick={saveSchedule} style={primaryBtn}>Shrani urnik</button>
                {savedMsg && <span style={{ fontSize: '12px', color: 'var(--green-ok)' }}>Shranjeno ✓</span>}
              </div>
            </>
          )}
        </div>

        {/* Izvoz učnega načrta */}
        <div style={card}>
          <div style={{ ...label, marginBottom: '4px' }}>Izvoz učnega načrta</div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '14px', lineHeight: 1.5 }}>
            Prenesi celoten učni načrt predmeta kot besedilno datoteko (poglavja, cilji, standardi, novi pojmi, predvidene ure).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {CURRICULA.map((c) => (
              <button
                key={c.id}
                onClick={() => downloadText(`ucni-nacrt-${c.id}.txt`, curriculumToText(c.predmet))}
                style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: 'var(--forest)', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '8px 14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px' }}
              >
                <span style={{ fontSize: '14px' }}>↓</span> {c.predmet.naslov}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
