'use client';

import { useState } from 'react';
import type { TaskDraft } from '@/lib/tasks/types';
import { GEN_GROUPS } from '@/lib/tasks/genOptions';
import TaskEditor from './TaskEditor';
import { Rich, Chip, btn, tinyLabel, input } from './ui';

export type GenMode = 'similar' | 'variant' | 'complete';

/**
 * Okno »✨ Generiraj iz naloge« (v stranskem oknu): izbira možnosti, klic Claude, nato urejevalnik osnutka.
 * Skupno za bazo nalog in za vprašanja v kvizu; kam se shrani, določi `onSave`.
 */
export default function GeneratePanel({ source, onSave, onCancel, onBusy }: {
  /** izhodiščna naloga (iz baze ali iz vprašanja kviza) */
  source: TaskDraft;
  onSave: (d: TaskDraft, mode: GenMode) => Promise<void>;
  onCancel: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [mods, setMods] = useState<Record<string, string>>({});   // skupina → izbrana možnost
  const [kindMode, setKindMode] = useState<GenMode>('similar');
  const variant = kindMode === 'variant';
  const complete = kindMode === 'complete';
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** generiran osnutek, preden ga shraniš */
  const [gen, setGen] = useState<{ draft: TaskDraft; note: string; mode: GenMode; seq: number } | null>(null);

  const generate = async () => {
    setBusy(true); onBusy?.(true); setError(null);
    try {
      const { id: _id, created_at: _c, updated_at: _u, ...task } = source as TaskDraft & { created_at?: string; updated_at?: string }; // eslint-disable-line @typescript-eslint/no-unused-vars
      const res = await fetch('/api/tasks/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, mode: kindMode, mods: Object.values(mods), extra }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Napaka ${res.status}`);
      setGen(g => ({ draft: data.draft, note: data.note ?? '', mode: kindMode, seq: (g?.seq ?? 0) + 1 }));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); onBusy?.(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontFamily: 'var(--font-sans)' }}>
      <div style={{ fontSize: '12px', color: 'var(--muted)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '8px 10px', background: 'var(--canvas)', maxHeight: '160px', overflow: 'auto' }}>
        <div style={{ ...tinyLabel, marginBottom: '4px' }}>Izhodiščna naloga</div>
        <Rich html={source.body} />
      </div>
      {error && <p style={{ fontSize: '12px', color: '#c0392b', margin: 0 }}>{error}</p>}
      {gen ? (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '12px', color: '#1f4f8a', fontWeight: 600, marginBottom: '6px' }}>{gen.mode === 'complete' ? '✨ Dopolnjena naloga (preveri in shrani — prepiše to nalogo)' : '✨ Predlagana naloga (osnutek — preveri, popravi in shrani)'}</div>
          {gen.note && <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>{gen.note}</div>}
          <TaskEditor key={`gen-${gen.seq}`} initial={gen.draft} onCancel={onCancel} onSave={d => onSave(d, gen.mode)} />
        </div>
      ) : (
        <div style={{ marginTop: '10px', border: '2px solid #6f9bd1', borderRadius: 'var(--r-md)', padding: '14px 16px', background: '#e9f1fb', boxShadow: '0 4px 18px rgba(31,79,138,0.14)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1f4f8a' }}>✨ Generiraj iz te naloge</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ ...tinyLabel, minWidth: '120px' }}>Osnova</span>
            <Chip active={kindMode === 'similar'} onClick={() => setKindMode('similar')} title="Nova, podobna naloga (druga situacija, podatki, izid)">podobna naloga</Chip>
            <Chip active={variant} onClick={() => setKindMode('variant')} title="Minimalna sprememba: zamenja številke (po potrebi kakšno besedo)">le zamenjaj številke</Chip>
            <Chip active={complete} onClick={() => setKindMode('complete')} title="Ista naloga: dopolni manjkajoče (rešitev, pojasnilo, težavnost, Bloom, oblika odgovora, poglavje, standardi) in uredi obliko">dopolni to nalogo</Chip>
          </div>
          {kindMode === 'similar' && GEN_GROUPS.map(g => (
            <div key={g.id} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ ...tinyLabel, minWidth: '120px' }}>{g.label}</span>
              {g.options.map(o => (
                <Chip key={o.id} active={mods[g.id] === o.id} title={o.instruction}
                  onClick={() => setMods(m => { const n = { ...m }; if (n[g.id] === o.id) delete n[g.id]; else n[g.id] = o.id; return n; })}>
                  {o.label}
                </Chip>
              ))}
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={tinyLabel}>Pojasnila in opombe (neobvezno)</span>
            <textarea value={extra} onChange={e => setExtra(e.target.value)} maxLength={1500} rows={3}
              placeholder={complete
                ? 'npr. »pravilni odgovor je 450 J«, »rešitev naj bo po korakih z obrazcem«, »spada v 6.3 Delo z orodji«, »težavnost srednja«'
                : variant ? 'npr. »rezultat naj bo celo število«, »uporabi maso v gramih«'
                : 'npr. »naj gre za dvigalo na gradbišču«, »brez pretvarjanja enot«, »za učence z učnimi težavami«'}
              style={{ ...input, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--font-sans)', lineHeight: 1.5 }} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => void generate()} disabled={busy} style={{ ...btn(true), padding: '5px 14px', opacity: busy ? 0.6 : 1 }}>
              {busy ? '… generiram' : complete ? 'Dopolni' : 'Generiraj'}
            </button>
            <button onClick={onCancel} disabled={busy} style={{ ...btn(), padding: '5px 12px' }}>Prekliči</button>
          </div>
        </div>
      )}
    </div>
  );
}
