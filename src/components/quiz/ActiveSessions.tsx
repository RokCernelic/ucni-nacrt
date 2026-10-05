'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { loadActiveSessions, updateSession, type ActiveSession } from '@/lib/quiz/sessionApi';
import { studentsLabel } from '@/lib/quiz/format';

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const t = d.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
  return today ? `danes ob ${t}` : `${d.toLocaleDateString('sl-SI')} ob ${t}`;
};

/** Kvizi → seje, ki trenutno tečejo (vse, ne glede na kviz). */
export default function ActiveSessions() {
  const [items, setItems] = useState<ActiveSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    loadActiveSessions().then(r => { setItems(r); setError(null); })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => { if (!document.hidden) refresh(); }, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const end = async (a: ActiveSession) => {
    if (!confirm(`Končam sejo »${a.session.quiz_title}« (${a.session.class_name})? Učenci ne bodo mogli več odgovarjati.`)) return;
    try {
      await updateSession(a.session.id, { status: 'ended', ended_at: new Date().toISOString() });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const label: React.CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 10px' };

  return (
    <section style={{ marginBottom: '28px', fontFamily: 'var(--font-sans)' }}>
      <h2 style={label}>Aktivne seje</h2>
      {error && <p style={{ fontSize: '13px', color: '#c0392b', margin: '0 0 8px' }}>{error}</p>}
      {items === null ? (
        <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>Nalagam …</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>Trenutno ne teče nobena seja.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {items.map(a => (
            <div key={a.session.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--green-ok)', borderRadius: 'var(--r-md)', padding: '12px 16px' }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green-ok)', marginRight: '8px' }}>● V TEKU</span>
                  {a.session.quiz_title}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                  {a.session.class_name} · {a.session.mode === 'teacher' ? 'vodi učitelj' : 'vsak sam'} · {fmtTime(a.session.created_at)}
                </div>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                koda <b style={{ color: 'var(--ink)', letterSpacing: '0.08em' }}>{a.session.code}</b> · {studentsLabel(a.joined)} od {a.total}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <Link href={`/kvizi/seja/${a.session.id}`}
                  style={{ fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--forest)', borderRadius: 'var(--r-sm)', padding: '7px 12px', textDecoration: 'none' }}>
                  Odpri
                </Link>
                <button onClick={() => void end(a)}
                  style={{ fontSize: '12px', fontWeight: 500, color: '#c0392b', background: 'transparent', border: '1px solid #e0b4ae', borderRadius: 'var(--r-sm)', padding: '6px 12px', cursor: 'pointer' }}>
                  Končaj
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
