'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { subscribeUndo, getUndo, dismissUndo } from '@/lib/undoStore';

const SHOW_MS = 8000;

export default function UndoToast() {
  const item = useSyncExternalStore(subscribeUndo, getUndo, () => null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ id: number; msg: string } | null>(null);

  useEffect(() => {
    if (!item) return;
    const id = item.id;
    const t = setTimeout(() => dismissUndo(id), SHOW_MS);
    return () => clearTimeout(t);
  }, [item]);

  if (!item) return null;
  const undo = async () => {
    setBusy(true); setErr(null);
    try { await item.undo(); dismissUndo(item.id); } catch (e) { setErr({ id: item.id, msg: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  };

  return (
    <div role="status" className="no-print" style={{
      position: 'fixed', left: '50%', bottom: '84px', transform: 'translateX(-50%)', zIndex: 1000,
      display: 'flex', alignItems: 'center', gap: '14px', background: '#1f2a24', color: '#fff', borderRadius: '10px',
      padding: '10px 14px', fontFamily: 'var(--font-sans)', fontSize: '13px', boxShadow: '0 6px 24px rgba(0,0,0,.25)',
    }}>
      <span>{err?.id === item.id ? err.msg : item.label}</span>
      <button onClick={() => void undo()} disabled={busy}
        style={{ background: 'transparent', color: '#9fe0b4', border: '1px solid #4d7a5c', borderRadius: '6px', padding: '3px 10px', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
        {busy ? '…' : '↶ Razveljavi'}
      </button>
    </div>
  );
}
