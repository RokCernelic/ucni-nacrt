/**
 * Tabela učencev razreda (zavihek Učenci): stolpci rezultatov kvizov in ročni stolpci, povprečje odstotkov in razvrščanje.
 * Skupno za prikaz v RosterEditor in za tisk seznama (tudi več razredov naenkrat).
 */
import type { Student } from '@/hooks/useRoster';
import { participated, type QuizSession, type loadClassHistory } from '@/lib/quiz/sessionApi';
import { scoreAnswers } from '@/lib/quiz/scoring';
import { ceilPct } from '@/lib/quiz/format';
import { sortByLastName } from '@/lib/names';

export type R = { pct: number; pts: number; max: number; sid: string };
export type QuizCol = { s: QuizSession; title: string; res: Map<string, R>; byName: Map<string, R> };
export type ManualCol = { id: string; name: string; values: Record<string, string> };
export type ColCfg = { manual: ManualCol[]; order: string[]; hidden?: string[]; nameWidth?: number };
export type RosterSort = { key: string; dir: 1 | -1 };
type History = Awaited<ReturnType<typeof loadClassHistory>>;

export const normName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');

/** Stolpci kvizov razreda: ena izvedba = en stolpec (le izvedbe z vsaj enim sodelujočim). */
export function buildQuizCols(history: History | null, titleOf: (s: QuizSession) => string): QuizCol[] {
  if (!history) return [];
  return history.sessions.map(s => {
    const by = new Map<string, Record<string, string>>();
    for (const a of history.answersBySession.get(s.id) ?? []) by.set(a.student_id, { ...(by.get(a.student_id) ?? {}), [a.question_id]: a.value });
    const res = new Map<string, R>();
    const byName = new Map<string, R>();
    for (const st of (history.studentsBySession.get(s.id) ?? []).filter(participated)) {
      const sc = scoreAnswers(s.quiz, by.get(st.student_id) ?? {});
      const r: R = { pct: ceilPct(sc.percent), pts: sc.points, max: sc.maxPoints, sid: st.student_id };
      res.set(st.student_id, r);
      byName.set(normName(st.name), r);
    }
    return { s, title: titleOf(s), res, byName };
  }).filter(c => c.res.size > 0);
}

/** Rezultat učenca v izvedbi: po id-ju iz seznama, sicer po imenu (npr. če je bil seznam ponovno vnesen). */
export const resOf = (c: { res: Map<string, R>; byName: Map<string, R> }, st: { id: string; name: string }) => c.res.get(st.id) ?? c.byName.get(normName(st.name));

export const numVal = (v: string | undefined) => { if (!v) return null; const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) && /^\s*[-+]?\d+([.,]\d+)?\s*$/.test(v) ? n : null; };
/** Odstotek, vpisan v ročni stolpec (npr. »85 %«). */
export const pctOf = (v: string | undefined) => { const m = /^\s*(\d{1,3}(?:[.,]\d+)?)\s*%\s*$/.exec(v ?? ''); const n = m ? Number(m[1].replace(',', '.')) : NaN; return n >= 0 && n <= 100 ? n : null; };
/** Ročni stolpci, v katere so vpisani sami odstotki. */
export const pctColsOf = (cfg: ColCfg) => cfg.manual.filter(m => { const vs = Object.values(m.values).filter(v => v.trim()); return vs.length > 0 && vs.every(v => pctOf(v) != null); });

/** Povprečje odstotkov učenca: rezultati kvizov in ročni stolpci z odstotki. */
export function avgPctOf(st: { id: string; name: string }, quizCols: QuizCol[], pctCols: ManualCol[]): number | null {
  const ps = [...quizCols.map(c => resOf(c, st)?.pct ?? null), ...pctCols.map(m => pctOf(m.values[st.id]))].filter((n): n is number => n != null);
  return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
}

/** Vrstni red stolpcev (shranjeni red, novi na konec) in vidni stolpci. */
export function columnsOf(cfg: ColCfg, quizCols: QuizCol[]) {
  const defaultKeys = ['gender', 'pin', 'seat', ...quizCols.map(c => `q:${c.s.id}`), ...cfg.manual.map(m => `m:${m.id}`)];
  const colKeys = [...cfg.order.filter(k => defaultKeys.includes(k)), ...defaultKeys.filter(k => !cfg.order.includes(k))];
  const hidden = new Set(cfg.hidden ?? []);
  return { defaultKeys, colKeys, hidden, visibleKeys: colKeys.filter(k => !hidden.has(k)) };
}

/** Razvrsti učence (stolpec + smer); pri enakih vrednostih po priimku. */
export function sortStudents<T extends Student>(students: T[], sort: RosterSort, quizCols: QuizCol[], cfg: ColCfg, colKeys: string[]): T[] {
  const base = sortByLastName(students);
  if (sort.key === 'name') return sort.dir === 1 ? base : [...base].reverse();
  if (!colKeys.includes(sort.key) && sort.key !== 'avg') return base;
  const pctCols = pctColsOf(cfg);
  const value = (st: T): string | number => {
    const key = sort.key;
    if (key === 'gender') return st.gender || '~';
    if (key === 'pin') return st.pin ?? '~';
    if (key === 'avg') { const g = avgPctOf(st, quizCols, pctCols); return g == null ? 1e9 : -g; } // najboljši najprej
    if (key === 'seat') return -((st.frontRow ? 4 : 0) + (st.nextToBoy ? 2 : 0) + (st.apartFrom?.length ? 1 : 0));
    if (key.startsWith('q:')) { const c = quizCols.find(c => `q:${c.s.id}` === key); const r = c ? resOf(c, st) : undefined; return r ? -r.pct : 1; }
    if (key.startsWith('m:')) {
      const v = cfg.manual.find(m => `m:${m.id}` === key)?.values[st.id] ?? '';
      const n = numVal(v);
      return n != null ? `0${String(1e6 - n * 100).padStart(12, '0')}` : v ? `1${v.toLowerCase()}` : '~'; // števila (večja najprej), nato besedilo, prazno na konec
    }
    return 0;
  };
  return base.map((st, i) => ({ st, i, v: value(st) })).sort((a, b) => {
    const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), 'sl');
    return c * sort.dir || a.i - b.i;
  }).map(x => x.st);
}

/** Zaporedna številka: podana v seznamu (»Ime Priimek, M, 12«), sicer mesto po priimku. */
export const numberOf = (st: Student, students: Student[]) => st.no ?? sortByLastName(students).findIndex(x => x.id === st.id) + 1;

export const seatRulesText = (st: Student, students: Student[]) => [
  st.frontRow && 'prva vrsta', st.nextToBoy && 'ob fantu', st.apartFrom?.length && `ne ob: ${students.find(x => x.id === st.apartFrom![0])?.name ?? '?'}`,
].filter(Boolean).join(' · ');

export const SORT_KEY = 'ucni-nacrt-roster-sort';
export function readRosterSort(): RosterSort {
  try { const v = JSON.parse(localStorage.getItem(SORT_KEY) ?? 'null'); if (v && typeof v.key === 'string' && (v.dir === 1 || v.dir === -1)) return v; } catch { /* ignore */ }
  return { key: 'name', dir: 1 };
}

export const cfgKeyOf = (classId: string) => `ucni-nacrt-rostercols-${classId}`;
export function readColCfg(classId: string): ColCfg {
  try { const r = typeof window !== 'undefined' ? localStorage.getItem(cfgKeyOf(classId)) : null; const v = r ? JSON.parse(r) : null; return { manual: v?.manual ?? [], order: v?.order ?? [], hidden: v?.hidden ?? [], nameWidth: v?.nameWidth }; }
  catch { return { manual: [], order: [] }; }
}
export function readRosterStudents(classId: string): Student[] {
  try { const r = localStorage.getItem(`ucni-nacrt-roster-${classId}`); return r ? JSON.parse(r) : []; } catch { return []; }
}

/**
 * Več razredov v eno tabelo (tisk »vsi razredi na en list«): učenci z id-ji »razred:učenec«, kvizi združeni po kvizu
 * (ista vsebina v različnih razredih = en stolpec), ročni stolpci po imenu; vidni so stolpci, ki so vidni vsaj v enem razredu.
 */
export function mergeClasses(parts: { classId: string; label: string; students: Student[]; quizCols: QuizCol[]; cfg: ColCfg }[]) {
  const students: Student[] = [];
  const classOf = new Map<string, string>();
  const quiz = new Map<string, QuizCol>();
  const manual = new Map<string, ManualCol>();
  const visible = new Set<string>();
  const order: string[] = [];
  for (const p of parts) {
    const pid = (id: string) => `${p.classId}:${id}`;
    for (const st of p.students) {
      students.push({ ...st, id: pid(st.id), no: undefined, apartFrom: st.apartFrom?.map(pid) });
      classOf.set(pid(st.id), p.label);
    }
    const { visibleKeys } = columnsOf(p.cfg, p.quizCols);
    for (const k of visibleKeys) if (!k.startsWith('q:') && !k.startsWith('m:')) visible.add(k);
    for (const c of p.quizCols) {
      const key = c.s.quiz_id ?? `naslov:${c.title}`;
      const m = quiz.get(key) ?? { s: c.s, title: c.title, res: new Map<string, R>(), byName: new Map<string, R>() };
      for (const st of p.students) { const r = resOf(c, st); if (r) m.res.set(pid(st.id), r); }
      quiz.set(key, m);
      if (visibleKeys.includes(`q:${c.s.id}`)) visible.add(`q:${m.s.id}`);
      if (!order.includes(`q:${m.s.id}`)) order.push(`q:${m.s.id}`);
    }
    for (const mc of p.cfg.manual) {
      const key = mc.name.trim().toLowerCase();
      const m = manual.get(key) ?? { id: `x${manual.size}`, name: mc.name, values: {} };
      for (const [sid, v] of Object.entries(mc.values)) m.values[pid(sid)] = v;
      manual.set(key, m);
      if (visibleKeys.includes(`m:${mc.id}`)) visible.add(`m:${m.id}`);
    }
  }
  const quizCols = [...quiz.values()].sort((a, b) => a.s.created_at.localeCompare(b.s.created_at));
  const cfg: ColCfg = { manual: [...manual.values()], order: [] };
  const all = columnsOf(cfg, quizCols).colKeys;
  cfg.hidden = all.filter(k => !visible.has(k));
  return { students, classOf, quizCols, cfg };
}
