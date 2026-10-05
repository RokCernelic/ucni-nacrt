'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useMasterClasses } from '@/hooks/useMasterClasses';
import RosterEditor from '@/components/RosterEditor';

const input: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--ink)', background: 'var(--canvas)',
  border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '8px 10px', outline: 'none',
};
const label: React.CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)',
};

export default function UcenciRazredPage() {
  const params = useParams();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const router = useRouter();
  const { user, loading } = useAuth();
  const { classes, loaded, addClass, updateClass, removeClass } = useMasterClasses();
  const [newName, setNewName] = useState('');
  const [newSchool, setNewSchool] = useState('');

  if (loading || !loaded) return null;

  const isNew = id === 'nov';
  const cur = classes.find(c => c.id === id) ?? null;
  const schools = Array.from(new Set(classes.map(c => c.school.trim()).filter(Boolean)));

  const create = () => {
    if (!newName.trim()) return;
    const nid = addClass(newName, newSchool);
    setNewName(''); setNewSchool('');
    router.push(`/ucenci/${nid}`);
  };

  return (
    <div>
      <div style={{ background: 'var(--forest)', padding: '28px 32px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 6px' }}>
            Učenci{cur?.school ? ` · ${cur.school}` : ''}
          </p>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px,4vw,48px)', fontWeight: 300, color: '#fff', lineHeight: 1 }}>
            {cur ? cur.name : 'Nov razred'}
          </h1>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', padding: '28px 32px 80px' }}>
        {!user ? (
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>
            Za urejanje razredov in učencev se <Link href="/login" style={{ color: 'var(--forest)', fontWeight: 500 }}>prijavite</Link>.
          </p>
        ) : isNew || !cur ? (
          <div style={{ maxWidth: '520px' }}>
            {!isNew && <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>Ta razred ne obstaja več. Dodaj novega:</p>}
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.5 }}>
              Razredi so skupni vsem predmetom. Ko ga ustvariš, ga pri učnem načrtu in sedežnem redu le dodaš z gumbom <b>+</b> v meniju razredov.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={label}>Razred</span>
                <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }}
                  placeholder="npr. 8A" autoFocus style={{ ...input, width: '120px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 200px' }}>
                <span style={label}>Šola</span>
                <input value={newSchool} onChange={e => setNewSchool(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }}
                  list="ucenci-schools" placeholder="npr. OŠ Brežice" style={input} />
                <datalist id="ucenci-schools">{schools.map(s => <option key={s} value={s} />)}</datalist>
              </label>
              <button onClick={create} disabled={!newName.trim()}
                style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 16px', cursor: newName.trim() ? 'pointer' : 'not-allowed', opacity: newName.trim() ? 1 : 0.5 }}>
                Dodaj razred
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={label}>Razred</span>
                <input value={cur.name} onChange={e => updateClass(cur.id, { name: e.target.value })} style={{ ...input, width: '120px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 200px' }}>
                <span style={label}>Šola</span>
                <input value={cur.school} onChange={e => updateClass(cur.id, { school: e.target.value })} list="ucenci-schools" style={input} />
                <datalist id="ucenci-schools">{schools.map(s => <option key={s} value={s} />)}</datalist>
              </label>
              <button
                onClick={() => {
                  if (!confirm(`Izbrišem razred »${cur.name}${cur.school ? ' · ' + cur.school : ''}« in vse njegove učence in sedežni red? Odstrani se tudi iz vseh menijev.`)) return;
                  removeClass(cur.id);
                  router.replace('/ucenci');
                }}
                style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, color: '#c0392b', background: 'transparent', border: '1px solid #e0b4ae', borderRadius: 'var(--r-sm)', padding: '9px 14px', cursor: 'pointer' }}>
                Izbriši razred
              </button>
            </div>
            <div style={{ borderTop: '1px solid var(--hairline)', marginTop: '20px' }}>
              <RosterEditor key={cur.id} classId={cur.id} className={[cur.name, cur.school].filter(Boolean).join(' · ')} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
