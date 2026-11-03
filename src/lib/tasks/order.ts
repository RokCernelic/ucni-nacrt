import { allCurricula, topicsOf, chaptersOf, topicInfo, chapterInfo } from './topics';
import type { Task } from './types';

/** Vrstni red nalog kot v učnem načrtu: poglavje → naloge samo s poglavjem → podpoglavja. */

let orders: { chapter: Map<string, number>; topic: Map<string, number> } | null = null;
function getOrders() {
  if (!orders) {
    const chapter = new Map<string, number>();
    const topic = new Map<string, number>();
    let c = 0, t = 0;
    for (const cur of allCurricula()) {
      for (const ch of chaptersOf(cur.id)) chapter.set(ch.key, c++);
      for (const tp of topicsOf(cur.id)) topic.set(tp.key, t++);
    }
    orders = { chapter, topic };
  }
  return orders;
}

/** Kje v učnem načrtu je naloga (prvo podpoglavje, sicer prvo poglavje). */
export function placeOf(t: Pick<Task, 'topics' | 'chapters'>): { chapterKey: string; topicKey: string } {
  const { chapter, topic } = getOrders();
  const tk = [...t.topics].sort((a, b) => (topic.get(a) ?? 1e9) - (topic.get(b) ?? 1e9))[0];
  if (tk) return { chapterKey: topicInfo(tk)?.chapterKey ?? '', topicKey: tk };
  const ck = [...t.chapters].sort((a, b) => (chapter.get(a) ?? 1e9) - (chapter.get(b) ?? 1e9))[0];
  return { chapterKey: ck ?? '', topicKey: '' };
}

/** Ali je naloga ugnezdena pod izvorno (izvorna je med podanimi nalogami)? */
export const isNested = (t: Pick<Task, 'parent_id'>, ids: Set<string>) => !!t.parent_id && ids.has(t.parent_id);

/** Ohrani vrstni red, le generirane naloge premakne takoj za izvorno (če je med nalogami). */
export function nestUnderParents<T extends Task>(tasks: T[]): T[] {
  const ids = new Set(tasks.map(t => t.id));
  const kids = new Map<string, T[]>();
  for (const t of tasks) if (isNested(t, ids)) kids.set(t.parent_id!, [...(kids.get(t.parent_id!) ?? []), t]);
  return tasks.filter(t => !isNested(t, ids)).flatMap(r => [r, ...(kids.get(r.id) ?? [])]);
}

/** Vrstni red kot v učnem načrtu; generirane naloge sledijo svoji izvorni nalogi. */
export function orderTasks<T extends Task>(tasks: T[]): T[] {
  const { chapter, topic } = getOrders();
  const ids = new Set(tasks.map(t => t.id));
  const rank = (t: Task) => { const p = placeOf(t); return [chapter.get(p.chapterKey) ?? 1e9, p.topicKey ? (topic.get(p.topicKey) ?? 1e9) : -1] as const; };
  const cmp = (a: Task, b: Task) => { const ra = rank(a), rb = rank(b); return ra[0] - rb[0] || ra[1] - rb[1] || a.created_at.localeCompare(b.created_at); };
  const roots = tasks.filter(t => !isNested(t, ids)).sort(cmp);
  const kids = new Map<string, T[]>();
  for (const t of tasks) if (isNested(t, ids)) kids.set(t.parent_id!, [...(kids.get(t.parent_id!) ?? []), t]);
  return roots.flatMap(r => [r, ...(kids.get(r.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at))]);
}

export interface TaskGroup {
  chapterKey: string;
  /** npr. "8. razred · 1 Vesolje" */
  chapter: string;
  /** npr. "1 Vesolje" */
  chapterTitle: string;
  predmet: string;
  grade: number | null;
  topics: { key: string; /** npr. "1.1 Telesa v vesolju" */ title: string; tasks: Task[] }[];
}

/** Razporedi že urejene naloge v poglavja in podpoglavja. */
export function groupTasks(ordered: Task[]): TaskGroup[] {
  const out: TaskGroup[] = [];
  const byId = new Map(ordered.map(t => [t.id, t]));
  for (const t of ordered) {
    const p = placeOf(t.parent_id && byId.get(t.parent_id) ? byId.get(t.parent_id)! : t); // generirana naloga je v skupini izvorne
    const ci = p.chapterKey ? chapterInfo(p.chapterKey) : null;
    const ti = p.topicKey ? topicInfo(p.topicKey) : null;
    let g = out[out.length - 1];
    if (!g || g.chapterKey !== p.chapterKey) {
      g = {
        chapterKey: p.chapterKey,
        chapter: ci ? `${ci.grade ? `${ci.grade}. razred · ` : ''}${ci.label}` : 'Brez poglavja',
        chapterTitle: ci ? ci.label : 'Brez poglavja',
        predmet: ci?.predmet ?? '', grade: ci?.grade ?? null, topics: [],
      };
      out.push(g);
    }
    let sub = g.topics[g.topics.length - 1];
    if (!sub || sub.key !== p.topicKey) { sub = { key: p.topicKey, title: ti ? `${ti.number} ${ti.title}` : '', tasks: [] }; g.topics.push(sub); }
    sub.tasks.push(t);
  }
  return out;
}
