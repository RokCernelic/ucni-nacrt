'use client';

/** Kratkotrajno obvestilo »Razveljavi« (npr. po brisanju naloge) — prikaže ga <UndoToast /> v postavitvi. */
export interface UndoItem { id: number; label: string; undo: () => Promise<void> }
let current: UndoItem | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const subscribeUndo = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getUndo = () => current;
export function offerUndo(label: string, undo: () => Promise<void>) { current = { id: ++seq, label, undo }; emit(); }
export function dismissUndo(id?: number) { if (current && (id === undefined || current.id === id)) { current = null; emit(); } }

/**
 * Posnetek ključev v localStorage (npr. pred brisanjem): vrne funkcijo, ki jih povrne in obvesti hooke
 * (dogodek 'storage' za vsak ključ) ter sinhronizacijo z oblakom.
 */
export function snapshotStorage(match: ((key: string) => boolean) | string[]): () => Promise<void> {
  const snap: [string, string | null][] = [];
  if (Array.isArray(match)) {
    // izrecni ključi: zapomni si tudi, da ključa ni bilo (razveljavitev ga odstrani → privzete vrednosti)
    for (const k of match) snap.push([k, localStorage.getItem(k)]);
  } else {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && match(k)) snap.push([k, localStorage.getItem(k)!]);
    }
  }
  return async () => {
    for (const [k, v] of snap) {
      if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v);
      window.dispatchEvent(new StorageEvent('storage', { key: k, newValue: v, storageArea: localStorage }));
    }
    window.dispatchEvent(new Event('ucni-nacrt-changed'));
  };
}

/** Potrdi brisanje, ga izvede in za nekaj sekund ponudi »Razveljavi«. `run` izbriše in vrne funkcijo za razveljavitev. */
export async function confirmAndUndo(question: string, label: string, run: () => (() => Promise<void> | void) | Promise<() => Promise<void> | void>): Promise<boolean> {
  if (!confirm(question)) return false;
  const undo = await run();
  offerUndo(label, async () => { await undo(); });
  return true;
}

/**
 * »Razveljavi«, ki preživi ponovno nalaganje strani (npr. brisanje izvedbe, po katerem se stran osveži):
 * podatki za obnovo se za kratek čas shranijo v sessionStorage, <UndoToast /> jih ob nalaganju ponudi znova.
 */
const PENDING = 'ucni-undo-pending';
export interface PendingUndo { kind: 'session'; label: string; payload: unknown; at: number }
export function offerPersistentUndo(kind: PendingUndo['kind'], label: string, payload: unknown, undo: () => Promise<void>) {
  try { sessionStorage.setItem(PENDING, JSON.stringify({ kind, label, payload, at: Date.now() } satisfies PendingUndo)); } catch { /* prevelik posnetek: razveljavi le na tej strani */ }
  offerUndo(label, async () => { clearPendingUndo(); await undo(); });
}
export function takePendingUndo(maxAgeMs = 15000): PendingUndo | null {
  try {
    const raw = sessionStorage.getItem(PENDING);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingUndo;
    if (Date.now() - p.at > maxAgeMs) { sessionStorage.removeItem(PENDING); return null; }
    return p;
  } catch { return null; }
}
export function clearPendingUndo() { try { sessionStorage.removeItem(PENDING); } catch { /* ignore */ } }
