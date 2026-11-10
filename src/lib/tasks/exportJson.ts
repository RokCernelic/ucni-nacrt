import { sanitizeRichHtml } from '@/lib/richText';
import { makeZip, type ZipFile } from './zip';
import { readZip } from './unzip';
import { emptyTask, type Task, type TaskDraft, type AnswerKind, type TaskKind, type BloomLevel, type Difficulty } from './types';

/** Izvoz in uvoz nalog v JSON: ohrani VSE (besedilo z enačbami MathML, rešitve, možnosti, metapodatke, povezave med nalogami). */
export const JSON_FORMAT = 'ucni-nacrt-naloge';

export interface TasksJson {
  format: typeof JSON_FORMAT;
  version: 1;
  exportedAt: string;
  count: number;
  /** slike v nalogah so spletni naslovi (shranjene v bazi) ali vdelane (data URL) — izvozijo se skupaj z besedilom */
  tasks: Omit<Task, 'updated_at'>[];
}

export function tasksToJson(tasks: Task[]): string {
  const data: TasksJson = {
    format: JSON_FORMAT, version: 1, exportedAt: new Date().toISOString(), count: tasks.length,
    tasks: tasks.map(({ updated_at: _u, ...t }) => t), // eslint-disable-line @typescript-eslint/no-unused-vars
  };
  return JSON.stringify(data, null, 2);
}

const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const EXT_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const stamp = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()} ${p(d.getMonth() + 1)} ${p(d.getDate())}`; };

/**
 * Izvoz v .zip: »naloge.json« + mapa »slike/« s slikami nalog (besedilo, odgovor, rešitev). V JSON so slike
 * zapisane z relativno potjo (slike/slika-001.png), zato je JSON majhen in berljiv. Slike, ki jih ni bilo mogoče
 * prenesti, ostanejo kot spletna povezava. Vrne število nalog, slik in neprenesenih slik.
 */
export async function buildTasksZip(tasks: Task[]): Promise<{ zip: Uint8Array<ArrayBuffer>; images: number; missing: number }> {
  const srcs = new Set<string>();
  for (const t of tasks) for (const f of [t.body, t.answer, t.solution]) for (const m of (f ?? '').matchAll(/<img[^>]+src="([^"]+)"/gi)) srcs.add(m[1]);
  const files: ZipFile[] = [];
  const rename = new Map<string, string>();
  let i = 0, missing = 0;
  for (const src of srcs) {
    try {
      const blob = await (await fetch(src)).blob();
      const ext = MIME_EXT[blob.type] ?? (src.match(/\.(png|jpe?g|gif|webp)(\?|$)/i)?.[1].toLowerCase().replace('jpeg', 'jpg') ?? 'png');
      const name = `slike/slika-${String(++i).padStart(3, '0')}.${ext}`;
      files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
      rename.set(src, name);
    } catch { missing++; }
  }
  const swap = (h: string | null) => (h ? h.replace(/(<img[^>]+src=")([^"]+)(")/gi, (all, a, src, b) => (rename.has(src) ? a + rename.get(src) + b : all)) : h);
  const local = tasks.map(t => ({ ...t, body: swap(t.body) ?? '', answer: swap(t.answer), solution: swap(t.solution) }));
  files.unshift({ name: 'naloge.json', data: new TextEncoder().encode(tasksToJson(local)) });
  return { zip: makeZip(files), images: files.length - 1, missing };
}

export async function downloadTasksZip(tasks: Task[]): Promise<{ count: number; images: number; missing: number }> {
  const { zip, images, missing } = await buildTasksZip(tasks);
  const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${stamp()} Naloge (${tasks.length}).zip`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { count: tasks.length, images, missing };
}

/**
 * Prebere izvoz iz .zip (ali navaden .json): vrne besedilo JSON, v katerem so relativne poti slik (slike/…)
 * zamenjane z vdelanimi slikami — ob uvozu se te naložijo v shrambo.
 */
export async function readTasksFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const isZip = /\.zip$/i.test(file.name) || new DataView(buf).getUint32(0, true) === 0x04034b50;
  if (!isZip) return new TextDecoder().decode(buf);
  const entries = await readZip(buf);
  const json = entries.find(e => /(^|\/)naloge\.json$/i.test(e.name)) ?? entries.find(e => /\.json$/i.test(e.name));
  if (!json) throw new Error('V ZIP ni datoteke .json z nalogami.');
  const dir = json.name.includes('/') ? json.name.slice(0, json.name.lastIndexOf('/') + 1) : '';
  let text = new TextDecoder().decode(json.data);
  for (const e of entries) {
    const ext = e.name.split('.').pop()?.toLowerCase() ?? '';
    if (!EXT_MIME[ext] || !e.name.startsWith(dir)) continue;
    const rel = e.name.slice(dir.length);
    let bin = '';
    for (let k = 0; k < e.data.length; k += 0x8000) bin += String.fromCharCode(...e.data.subarray(k, k + 0x8000));
    // v JSON je pot v atributu src="…" (narekovaj je ubežen kot \") — zamenjamo jo z vdelano sliko
    text = text.split(`"${rel}`).join(`"data:${EXT_MIME[ext]};base64,${btoa(bin)}`);
  }
  return text;
}

/** Prenese naloge kot .json (ime: »YYYY MM DD Naloge (N).json«). */
export function downloadTasksJson(tasks: Task[]) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const name = `${d.getFullYear()} ${p(d.getMonth() + 1)} ${p(d.getDate())} Naloge (${tasks.length}).json`;
  const url = URL.createObjectURL(new Blob([tasksToJson(tasks)], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `remove`: naloga je v datoteki označena za brisanje (»_izbrisi«: true) — ob uvozu se obstoječa naloga z enakim id izbriše. */
export interface JsonItem { draft: TaskDraft; srcId: string; srcParent: string | null; remove?: boolean }
export interface JsonParse { items: JsonItem[]; errors: string[]; warnings: string[] }

const KINDS = new Set<string>(['mc', 'multi', 'tf', 'numeric', 'short', 'open']);
const TASK_KINDS = new Set<string>(['racunska', 'besedilna', 'graficna', 'skica', 'eksperimentalna', 'povezovanje']);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clean = (h: string | null) => (h ? sanitizeRichHtml(h).html : h);

/** Prebere in preveri izvoženo datoteko; HTML se ob uvozu očisti (skripte, dogodki …). */
export function parseTasksJson(text: string): JsonParse {
  const res: JsonParse = { items: [], errors: [], warnings: [] };
  let data: unknown;
  try { data = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { res.errors.push(`Datoteka ni veljaven JSON: ${e instanceof Error ? e.message : String(e)}`); return res; }
  const obj = data as Partial<TasksJson>;
  const list = Array.isArray(data) ? data : obj?.tasks;
  if (!Array.isArray(list)) { res.errors.push('V datoteki ni seznama nalog (pričakovano polje »tasks«).'); return res; }
  if (!Array.isArray(data) && obj.format && obj.format !== JSON_FORMAT) res.warnings.push(`Neznan format »${obj.format}« — poskusim prebrati naloge.`);

  list.forEach((raw: unknown, i: number) => {
    const t = raw as Record<string, unknown>;
    const at = `naloga ${i + 1}`;
    const body = str(t?.body);
    if (!body || !body.replace(/<[^>]*>/g, '').trim()) { res.errors.push(`${at}: manjka besedilo`); return; }
    const kind = KINDS.has(String(t.answer_kind)) ? (t.answer_kind as AnswerKind) : 'open';
    if (!KINDS.has(String(t.answer_kind))) res.warnings.push(`${at}: neznana oblika odgovora — uvožena kot odprta`);
    const optionsRaw = Array.isArray(t.options) ? t.options : null;
    const options = optionsRaw
      ? optionsRaw.filter((o: unknown): o is { id: unknown; text: unknown } => !!o && typeof o === 'object')
          .map(o => ({ id: str(o.id) ?? crypto.randomUUID(), text: str(o.text) ?? '' }))
      : null;
    const diff = numOrNull(t.difficulty), bloom = numOrNull(t.bloom);
    res.items.push({
      srcId: str(t.id) ?? `#${i}`,
      srcParent: str(t.parent_id),
      remove: t._izbrisi === true || t._delete === true,
      draft: emptyTask({
        body: clean(body) ?? '', answer: clean(str(t.answer)), solution: clean(str(t.solution)),
        answer_kind: kind, options, correct: str(t.correct), tolerance: numOrNull(t.tolerance), unit: str(t.unit),
        difficulty: diff && diff >= 1 && diff <= 3 ? (diff as Difficulty) : null,
        bloom: bloom && bloom >= 1 && bloom <= 6 ? (bloom as BloomLevel) : null,
        kinds: strs(t.kinds).filter(k => TASK_KINDS.has(k)) as TaskKind[],
        curriculum: str(t.curriculum), chapters: strs(t.chapters), topics: strs(t.topics), standards: strs(t.standards),
        points: numOrNull(t.points) ?? 1, minutes: numOrNull(t.minutes),
        source: str(t.source) ?? 'lastna', tags: strs(t.tags), status: t.status === 'draft' ? 'draft' : 'verified',
        parent_id: null, // povezave se obnovijo po uvozu (nova id-ja)
      }),
    });
  });
  if (!list.length) res.errors.push('Datoteka je prazna.');
  return res;
}
