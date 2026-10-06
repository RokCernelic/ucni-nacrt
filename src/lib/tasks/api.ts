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
  const q = draft.id
    ? sb.from('tasks').update(row).eq('id', draft.id).select().single()
    : sb.from('tasks').insert(row).select().single();
  const { data, error } = await q;
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
