'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Task, TaskDraft } from './types';

const BUCKET = 'task-images';

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await getSupabaseBrowserClient().from('tasks').select('*').order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

/** Slike, vstavljene kot data URL, naloži v vedro in jih v HTML zamenja z javnim URL-jem. */
async function uploadInlineImages(html: string | null): Promise<string | null> {
  if (!html || !html.includes('src="data:image/')) return html;
  const sb = getSupabaseBrowserClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Za shranjevanje slik se prijavite.');
  const found = Array.from(new Set(Array.from(html.matchAll(/src="(data:image\/(png|jpe?g|gif|webp);base64,[^"]+)"/g), m => m[1])));
  let out = html;
  for (const dataUrl of found) {
    const [, mime, b64] = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/)!;
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const ext = mime.split('/')[1].replace('jpeg', 'jpg');
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, cacheControl: '31536000' });
    if (error) throw new Error(`Slike ni bilo mogoče naložiti: ${error.message}`);
    const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    out = out.split(dataUrl).join(url);
  }
  return out;
}

export async function saveTask(draft: TaskDraft): Promise<Task> {
  const sb = getSupabaseBrowserClient();
  const row = {
    ...draft,
    body: (await uploadInlineImages(draft.body)) ?? '',
    answer: await uploadInlineImages(draft.answer),
    solution: await uploadInlineImages(draft.solution),
  };
  const run = (r: typeof row) => draft.id
    ? sb.from('tasks').update(r).eq('id', draft.id).select().single()
    : sb.from('tasks').insert(r).select().single();
  let { data, error } = await run(row);
  // izvirna naloga (parent_id) je bila medtem izbrisana → shrani kot samostojno nalogo
  if (error && (error.code === '23503' || error.message.includes('tasks_parent_id_fkey')) && row.parent_id) {
    ({ data, error } = await run({ ...row, parent_id: null }));
  }
  if (error) throw new Error(error.message);
  return data as Task;
}

export async function insertTasks(drafts: TaskDraft[]): Promise<Task[]> {
  const rows = await Promise.all(drafts.map(async d => ({
    ...d,
    body: (await uploadInlineImages(d.body)) ?? '',
    answer: await uploadInlineImages(d.answer),
    solution: await uploadInlineImages(d.solution),
  })));
  const { data, error } = await getSupabaseBrowserClient().from('tasks').insert(rows).select();
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().from('tasks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteTasks(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await getSupabaseBrowserClient().from('tasks').delete().in('id', ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
}

/** Ponovno vstavi izbrisane naloge z istimi id-ji in časi (razveljavitev brisanja). */
export async function restoreTasksRaw(tasks: Task[]): Promise<Task[]> {
  const rows = tasks.map(({ id, created_at, updated_at, ...rest }) => ({ id, created_at, updated_at, ...rest }));
  const { data, error } = await getSupabaseBrowserClient().from('tasks').insert(rows).select();
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

/** Ponovno poveže generirane naloge z izvorno (po razveljavitvi brisanja izvorne). */
export async function relinkTasks(links: { id: string; parent_id: string }[]): Promise<void> {
  for (const l of links) {
    const { error } = await getSupabaseBrowserClient().from('tasks').update({ parent_id: l.parent_id }).eq('id', l.id);
    if (error) throw new Error(error.message);
  }
}

/**
 * Popravek pravilnega odgovora iz rezultatov kviza (napaka v ključu) → zapiše se tudi v nalogo v bazi.
 * Izbirna naloga: id(-ji) pravilnih možnosti (le če jih naloga ima); številska: vrednost in odstopanje.
 * Vrne true, če je bila naloga popravljena.
 */
export async function setTaskCorrect(taskId: string, fix: { correct: string; tolerance?: number; texts?: string[] }): Promise<boolean> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('tasks').select('answer_kind, options, correct, tolerance').eq('id', taskId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  const t = data as Pick<Task, 'answer_kind' | 'options' | 'correct' | 'tolerance'>;
  let patch: Partial<Task> | null = null;
  if (t.answer_kind === 'numeric') patch = { correct: fix.correct, tolerance: fix.tolerance ?? t.tolerance };
  else if (t.options?.length) {
    let ids = fix.correct.split(',').filter(Boolean);
    if (!ids.every(id => t.options!.some(o => o.id === id)) && fix.texts?.length) { // vprašanje iz kopije: po besedilu možnosti
      const norm = (x: string) => x.trim().toLowerCase();
      ids = fix.texts.map(x => t.options!.find(o => norm(o.text) === norm(x))?.id ?? '');
    }
    if (!ids.length || !ids.every(id => t.options!.some(o => o.id === id))) return false;
    if (t.answer_kind !== 'multi' && ids.length > 1) return false;
    patch = { correct: t.answer_kind === 'multi' ? [...ids].sort().join(',') : ids[0] };
  }
  if (!patch) return false;
  const { error: e } = await sb.from('tasks').update(patch).eq('id', taskId);
  if (e) throw new Error(e.message);
  return true;
}
