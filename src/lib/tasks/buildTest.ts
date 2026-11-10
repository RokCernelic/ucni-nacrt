import { BLOOM, answerGroupOf, type AnswerKind, type BloomLevel, type Task } from './types';
import { makeRng } from '@/hooks/useSeating';

/** Taksonomski razredi, po katerih učitelj določi delež nalog (3 ali 6 stopenj). */
export interface BloomClass { id: string; label: string; levels: BloomLevel[] }

export const BLOOM_3: BloomClass[] = [
  { id: 'l1', label: '1 · Znanje (pomnjenje)', levels: [1] },
  { id: 'l2', label: '2 · Razumevanje in uporaba', levels: [2, 3] },
  { id: 'l3', label: '3 · Analiza, vrednotenje, ustvarjanje', levels: [4, 5, 6] },
];
export const BLOOM_6: BloomClass[] = BLOOM.map(b => ({ id: `b${b.level}`, label: `${b.level} · ${b.name}`, levels: [b.level] }));

export const classOfBloom = (classes: BloomClass[], bloom: BloomLevel | null) =>
  bloom == null ? undefined : classes.find(c => c.levels.includes(bloom));

export interface TestSpec {
  total: number;
  classes: BloomClass[];
  /** delež po taksonomskem razredu (poljubne uteži, normaliziramo) */
  bloomWeights: Record<string, number>;
  /** delež po obliki odgovora (poljubne uteži; manjkajoče = 0) */
  kindWeights: Partial<Record<AnswerKind, number>>;
  /** delež nalog (0–100), ki jih generira AI iz podobnih nalog v bazi */
  generatedShare: number;
  /** kar v bazi manjka (npr. ni ustrezne naloge), naj se generira */
  fillGaps: boolean;
}

export interface Slot {
  classId: string;
  kind: AnswerKind;
  /** naloga iz baze (null → generiraj) */
  task: Task | null;
  /** izhodiščna naloga za generiranje podobne */
  seed: Task | null;
  /** zakaj se generira: manjka v bazi, ali učitelj želi delež generiranih */
  why?: 'gap' | 'share';
  /** naloga iz baze ne ustreza povsem zahtevani stopnji / obliki (generiranje izklopljeno) */
  mismatch?: boolean;
}

export interface Plan {
  slots: Slot[];
  fromBank: number;
  generated: number;
  mismatched: number;
  /** generiranje bi bilo potrebno, a v filtru ni nobene izhodiščne naloge */
  noSeed: number;
}

/** Razdeli `total` po utežeh (metoda največjih ostankov); uteži se normalizirajo. */
export function apportion(total: number, weights: Record<string, number>): Record<string, number> {
  const keys = Object.keys(weights).filter(k => weights[k] > 0);
  const out: Record<string, number> = Object.fromEntries(Object.keys(weights).map(k => [k, 0]));
  const sum = keys.reduce((s, k) => s + weights[k], 0);
  if (!keys.length || sum <= 0 || total <= 0) return out;
  const exact = keys.map(k => ({ k, v: (weights[k] / sum) * total }));
  exact.forEach(e => { out[e.k] = Math.floor(e.v); });
  let left = total - exact.reduce((s, e) => s + out[e.k], 0);
  for (const e of [...exact].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)))) {
    if (left <= 0) break;
    out[e.k]++; left--;
  }
  return out;
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Načrt testa iz nalog v filtru: določi, katera naloga pride na vsako mesto (stopnja × oblika odgovora),
 * katera mesta se generirajo (manjkajoče v bazi in/ali zahtevani delež) in iz katere naloge.
 * Izbor je naključen, a se izogiba ponavljanju istih podpoglavij in daje prednost preverjenim nalogam.
 */
export function planTest(pool: Task[], spec: TestSpec, seed: string): Plan {
  const rng = makeRng(seed);
  const total = Math.max(0, Math.floor(spec.total));
  const bq = apportion(total, spec.bloomWeights);
  const kq = apportion(total, spec.kindWeights as Record<string, number>);

  // kandidati po ključu »razred|oblika«; preverjene naloge pred osnutki (znotraj skupine naključno)
  const cand = new Map<string, Task[]>();
  const sorted = shuffled(pool, rng).sort((a, b) => (a.status === 'verified' ? 0 : 1) - (b.status === 'verified' ? 0 : 1));
  for (const t of sorted) {
    const c = classOfBloom(spec.classes, t.bloom);
    if (!c) continue;
    const key = `${c.id}|${answerGroupOf(t.answer_kind)}`;
    if (!cand.has(key)) cand.set(key, []);
    cand.get(key)!.push(t);
  }
  const used = new Set<string>();
  const topicUse = new Map<string, number>();
  const availableIn = (classId: string, kind: AnswerKind) => (cand.get(`${classId}|${kind}`) ?? []).filter(t => !used.has(t.id));
  const take = (classId: string, kind: AnswerKind): Task | null => {
    const list = availableIn(classId, kind);
    if (!list.length) return null;
    // najmanj uporabljeno podpoglavje (seznam je že premešan, prednost preverjenim)
    const score = (t: Task) => Math.max(0, ...(t.topics.length ? t.topics : t.chapters).map(k => topicUse.get(k) ?? 0));
    const best = list.reduce((a, b) => (score(b) < score(a) ? b : a));
    used.add(best.id);
    for (const k of best.topics.length ? best.topics : best.chapters) topicUse.set(k, (topicUse.get(k) ?? 0) + 1);
    return best;
  };

  // mesta: razrede z najmanj razpoložljivih nalog obdelamo prve (da jim druge ne vzamejo kandidatov)
  const kindsLeft = { ...kq } as Record<string, number>;
  const classOrder = spec.classes.filter(c => (bq[c.id] ?? 0) > 0)
    .sort((a, b) => {
      const av = (c: BloomClass) => (Object.keys(kindsLeft) as AnswerKind[]).reduce((s, k) => s + availableIn(c.id, k).length, 0) / (bq[c.id] || 1);
      return av(a) - av(b);
    });
  const slots: Slot[] = [];
  for (const c of classOrder) {
    for (let i = 0; i < bq[c.id]; i++) {
      const kinds = (Object.keys(kindsLeft) as AnswerKind[]).filter(k => kindsLeft[k] > 0);
      const withTask = kinds.filter(k => availableIn(c.id, k).length > 0);
      const pickFrom = withTask.length ? withTask : kinds;
      const kind = pickFrom.reduce((a, b) => (kindsLeft[b] > kindsLeft[a] ? b : a));
      kindsLeft[kind]--;
      const task = take(c.id, kind);
      slots.push({ classId: c.id, kind, task, seed: null, why: task ? undefined : 'gap' });
    }
  }

  // delež generiranih: del nalog iz baze zamenja z generiranimi (izhodišče = ta naloga)
  const wantGen = Math.round((total * Math.min(100, Math.max(0, spec.generatedShare))) / 100);
  const gapCount = () => slots.filter(s => !s.task).length;
  let generating = spec.fillGaps ? gapCount() : Math.min(gapCount(), wantGen);
  const toConvert = shuffled(slots.filter(s => s.task), rng);
  while (generating < wantGen && toConvert.length) {
    const s = toConvert.pop()!;
    s.seed = s.task; s.task = null; s.why = 'share'; generating++;
  }

  // manjkajoče, ki jih ne generiramo → nadomesti z najbližjo prosto nalogo iz filtra (označi kot neustrezno)
  const genSlots = (): Slot[] => slots.filter(s => !s.task && (s.why === 'share' || spec.fillGaps));
  const unfilled = slots.filter(s => !s.task && !genSlots().includes(s));
  const rest = shuffled(pool.filter(t => !used.has(t.id) && !slots.some(s => s.seed?.id === t.id)), rng);
  for (const s of unfilled) {
    const near = rest.findIndex(t => classOfBloom(spec.classes, t.bloom)?.id === s.classId) >= 0
      ? rest.findIndex(t => classOfBloom(spec.classes, t.bloom)?.id === s.classId)
      : rest.findIndex(t => answerGroupOf(t.answer_kind) === s.kind) >= 0 ? rest.findIndex(t => answerGroupOf(t.answer_kind) === s.kind) : (rest.length ? 0 : -1);
    if (near >= 0) { s.task = rest.splice(near, 1)[0]; s.mismatch = true; s.why = undefined; used.add(s.task.id); }
  }

  // izhodiščne naloge za generiranje: najprej enaka stopnja in oblika, nato stopnja, nato oblika, sicer katera koli
  const seedUse = new Map<string, number>();
  let noSeed = 0;
  const inTest = new Set(slots.filter(s => s.task).map(s => s.task!.id));
  for (const s of genSlots()) {
    if (s.seed) { seedUse.set(s.seed.id, (seedUse.get(s.seed.id) ?? 0) + 1); continue; }
    const pref = (t: Task) => (classOfBloom(spec.classes, t.bloom)?.id === s.classId ? 0 : 2) + (answerGroupOf(t.answer_kind) === s.kind ? 0 : 1) + (inTest.has(t.id) ? 4 : 0) + (seedUse.get(t.id) ?? 0) * 3;
    const ordered = shuffled(pool, rng).sort((a, b) => pref(a) - pref(b));
    if (!ordered.length) { noSeed++; continue; }
    s.seed = ordered[0];
    seedUse.set(ordered[0].id, (seedUse.get(ordered[0].id) ?? 0) + 1);
  }

  const gen = genSlots().filter(s => s.seed);
  return {
    slots,
    fromBank: slots.filter(s => s.task && !s.mismatch).length,
    generated: gen.length,
    mismatched: slots.filter(s => s.mismatch).length,
    noSeed,
  };
}

/** Navodila za generiranje podobne naloge na mestu `slot` (uporabi obstoječe možnosti okna ✨ Generiraj). */
export function genRequestFor(slot: Slot, classes: BloomClass[]): { mods: string[]; extra: string } {
  const seed = slot.seed!;
  const mods: string[] = [];
  const extra: string[] = [];
  if (answerGroupOf(seed.answer_kind) !== slot.kind) {
    const m: Partial<Record<AnswerKind, string>> = { mc: 'abcd', multi: 'multi', tf: 'tf', numeric: 'stevilo', open: 'odprta' };
    if (m[slot.kind]) mods.push(m[slot.kind]!);
    else if (slot.kind === 'short') extra.push('Spremeni v nalogo s KRATKIM odgovorom: če je odgovor eno število, uporabi answer_kind numeric (z enoto in toleranco), sicer short (beseda ali kratka poved).');
  }
  const cls = classes.find(c => c.id === slot.classId);
  if (cls && !(seed.bloom != null && cls.levels.includes(seed.bloom))) {
    const names = cls.levels.map(l => `${l} (${BLOOM.find(b => b.level === l)?.name})`).join(' ali ');
    extra.push(`Nova naloga naj preverja Bloomovo stopnjo ${names}; ustrezno nastavi bloom.`);
  }
  return { mods, extra: extra.join(' ') };
}
