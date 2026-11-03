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
