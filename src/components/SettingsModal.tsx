'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSchedule, DEFAULT_SCHEDULE, type Lesson } from '@/hooks/useSchedule';

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { user, updateEmail } = useAuth();
  const { schedule, setSchedule } = useSchedule();

  const [email, setEmail] = useState(user?.email ?? '');
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [rows, setRows] = useState<Lesson[]>(schedule.length ? schedule : DEFAULT_SCHEDULE);
  const [savedMsg, setSavedMsg] = useState(false);

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

  const updateRow = (i: number, field: keyof Lesson, value: string) => {
    setRows(prev => prev.map((r, j) => j === i ? { ...r, [field]: value } : r));
    setSavedMsg(false);
  };
  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows(prev => [...prev, { start: last?.end ?? '08:00', end: '' }]);
    setSavedMsg(false);
  };
  const removeRow = (i: number) => { setRows(prev => prev.filter((_, j) => j !== i)); setSavedMsg(false); };
  const saveSchedule = () => {
    const clean = rows.filter(r => r.start && r.end);
    setSchedule(clean);
    setRows(clean);
    setSavedMsg(true);
  };

  const label = { fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--muted)' };
  const inputStyle = { fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '7px 10px', outline: 'none' };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,20,12,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '520px', background: 'var(--canvas)', borderRadius: 'var(--r-md)', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', background: 'var(--forest)' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '22px', fontWeight: 400, color: '#fff' }}>Nastavitve</h2>
          <button onClick={onClose} title="Zapri" style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '22px', lineHeight: 1, cursor: 'pointer', padding: '2px 6px' }}>×</button>
        </div>

        <div style={{ padding: '22px' }}>
          {/* E-naslov */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ ...label, marginBottom: '10px' }}>E-naslov</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailMsg(null); }}
                placeholder="ime@primer.si"
                style={{ ...inputStyle, flex: '1 1 220px' }}
              />
              <button onClick={handleEmail} disabled={emailBusy}
                style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '8px 16px', cursor: emailBusy ? 'default' : 'pointer', opacity: emailBusy ? 0.6 : 1 }}>
                {emailBusy ? 'Pošiljam …' : 'Posodobi'}
              </button>
            </div>
            {emailMsg && (
              <p style={{ marginTop: '8px', fontSize: '12px', color: emailMsg.ok ? 'var(--green-ok)' : '#c0392b' }}>{emailMsg.text}</p>
            )}
          </div>

          {/* Urnik ur */}
          <div>
            <div style={{ ...label, marginBottom: '4px' }}>Urnik šolskih ur</div>
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px', lineHeight: 1.5 }}>
              Začetek in konec vsake ure. To poganja odštevalnik do konca / začetka ure.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', width: '44px', flexShrink: 0 }}>{i + 1}. ura</span>
                  <input type="time" value={r.start} onChange={(e) => updateRow(i, 'start', e.target.value)} style={{ ...inputStyle }} />
                  <span style={{ color: 'var(--muted)' }}>–</span>
                  <input type="time" value={r.end} onChange={(e) => updateRow(i, 'end', e.target.value)} style={{ ...inputStyle }} />
                  <button onClick={() => removeRow(i)} title="Odstrani uro" style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', color: 'var(--muted)', width: '28px', height: '28px', cursor: 'pointer', fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
              <button onClick={addRow}
                style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, color: 'var(--forest)', background: 'transparent', border: '1px dashed var(--hairline)', borderRadius: 'var(--r-sm)', padding: '7px 14px', cursor: 'pointer' }}>
                + Dodaj uro
              </button>
              <button onClick={saveSchedule}
                style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '8px 16px', cursor: 'pointer' }}>
                Shrani urnik
              </button>
              {savedMsg && <span style={{ fontSize: '12px', color: 'var(--green-ok)' }}>Shranjeno ✓</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
