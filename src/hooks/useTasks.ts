'use client';

import { useEffect, useSyncExternalStore, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { listTasks, saveTask, deleteTask, insertTasks } from '@/lib/tasks/api';
import { emptyTask, type Task, type TaskDraft, type BloomLevel } from '@/lib/tasks/types';

/*
 * Ena skupna zaloga nalog za celo aplikacijo (baza nalog, učni načrt, kvizi):
 * naloži se enkrat po prijavi, spremembe se takoj vidijo povsod.
 */
type State = { tasks: Task[]; loaded: boolean; error: string | null; userId: string | null };
let state: State = { tasks: [], loaded: false, error: null, userId: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const SERVER_STATE: State = { tasks: [], loaded: false, error: null, userId: null };

// Prejšnja hramba v brskalniku (Učni načrt → Vprašanja in naloge) — enkrat se prenese v bazo.
const LEGACY_KEY = 'ucni-nacrt-topic-questions';
async function migrateLegacy(): Promise<Task[]> {
  let legacy: Record<string, { text: string; answer?: string; bloom?: BloomLevel }[]> = {};
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}'); } catch { return []; }
  const drafts: TaskDraft[] = Object.entries(legacy).flatMap(([topic, list]) => (list ?? []).map(q => emptyTask({
    body: q.text, answer: q.answer ?? null, bloom: q.bloom ?? null,
    answer_kind: q.answer ? 'short' : 'open', curriculum: topic.split(':')[0] || null, topics: [topic],
  })));
  if (!drafts.length) { localStorage.removeItem(LEGACY_KEY); return []; }
  const inserted = await insertTasks(drafts);
  localStorage.removeItem(LEGACY_KEY);
  window.dispatchEvent(new Event('ucni-nacrt-changed'));
  return inserted;
}

async function load(userId: string) {
  set({ userId, loaded: false, error: null });
  try {
    const tasks = await listTasks();
    let migrated: Task[] = [];
    try { migrated = await migrateLegacy(); } catch (e) { console.error('Prenos vprašanj iz učnega načrta ni uspel', e); }
    if (state.userId === userId) set({ tasks: [...migrated, ...tasks], loaded: true });
  } catch (e) {
    if (state.userId === userId) set({ error: e instanceof Error ? e.message : String(e), loaded: true });
  }
}

export function useTasks() {
  const { user } = useAuth();
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);

  useEffect(() => {
    if (!user) { if (state.userId) set({ tasks: [], loaded: false, userId: null }); return; }
    if (state.userId !== user.id) void load(user.id);
  }, [user]);

  const save = useCallback(async (draft: TaskDraft) => {
    const saved = await saveTask(draft);
    set({ tasks: draft.id ? state.tasks.map(t => (t.id === saved.id ? saved : t)) : [saved, ...state.tasks] });
    return saved;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteTask(id);
    set({ tasks: state.tasks.filter(t => t.id !== id) });
  }, []);

  const importMany = useCallback(async (drafts: TaskDraft[], onProgress?: (done: number) => void) => {
    const inserted: Task[] = [];
    for (let i = 0; i < drafts.length; i += 25) {
      inserted.push(...await insertTasks(drafts.slice(i, i + 25)));
      onProgress?.(inserted.length);
    }
    set({ tasks: [...inserted, ...state.tasks] });
    return inserted;
  }, []);

  const reload = useCallback(() => { if (state.userId) void load(state.userId); }, []);

  return { tasks: s.tasks, loaded: s.loaded, error: s.error, save, remove, reload, importMany };
}
