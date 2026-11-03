'use client';

import { useEffect, useSyncExternalStore, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { listTasks, saveTask, deleteTasks, insertTasks, restoreTasksRaw, relinkTasks } from '@/lib/tasks/api';
import { emptyTask, type Task, type TaskDraft, type BloomLevel } from '@/lib/tasks/types';

/*
 * Ena skupna zaloga nalog za celo aplikacijo (baza nalog, učni načrt, kvizi):
 * naloži se enkrat po prijavi, spremembe se takoj vidijo povsod.
 */
export type Snapshot = { tasks: Task[]; links: { id: string; parent_id: string }[] };
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
  const { user, loading } = useAuth();
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);

  useEffect(() => {
    // Vsaka komponenta ima svoj useAuth, ki ob nastanku za trenutek še nima uporabnika (loading).
    // Zalogo izpraznimo le ob pravi odjavi, sicer bi vsaka nova komponenta pobrisala seznam.
    if (loading) return;
    if (!user) { if (state.userId) set({ tasks: [], loaded: false, userId: null }); return; }
    if (state.userId !== user.id) void load(user.id);
  }, [user, loading]);

  const save = useCallback(async (draft: TaskDraft) => {
    const saved = await saveTask(draft);
    set({ tasks: draft.id ? state.tasks.map(t => (t.id === saved.id ? saved : t)) : [saved, ...state.tasks] });
    return saved;
  }, []);

  /** Izbriše naloge; vrne posnetek, s katerim jih `restore` povrne (z vezmi na generirane naloge). */
  const removeMany = useCallback(async (ids: string[]): Promise<Snapshot> => {
    const gone = new Set(ids);
    const snap: Snapshot = {
      tasks: state.tasks.filter(t => gone.has(t.id)),
      links: state.tasks.filter(t => !gone.has(t.id) && t.parent_id && gone.has(t.parent_id)).map(t => ({ id: t.id, parent_id: t.parent_id! })),
    };
    await deleteTasks(ids);
    set({ tasks: state.tasks.filter(t => !gone.has(t.id)) });
    return snap;
  }, []);

  const remove = useCallback(async (id: string) => removeMany([id]), [removeMany]);

  const restore = useCallback(async (snap: Snapshot) => {
    const back = await restoreTasksRaw(snap.tasks);
    if (snap.links.length) await relinkTasks(snap.links);
    const linked = new Map(snap.links.map(l => [l.id, l.parent_id]));
    set({ tasks: [...back, ...state.tasks.map(t => (linked.has(t.id) ? { ...t, parent_id: linked.get(t.id)! } : t))] });
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

  return { tasks: s.tasks, loaded: s.loaded, error: s.error, save, remove, reload, importMany, removeMany, restore };
}
