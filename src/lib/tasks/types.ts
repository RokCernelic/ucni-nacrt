/** Baza nalog (supabase/migrations/20261006120000_naloge.sql). */

export type AnswerKind = 'mc' | 'multi' | 'tf' | 'numeric' | 'short' | 'open';
export type Difficulty = 1 | 2 | 3;
export type BloomLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type TaskKind = 'racunska' | 'besedilna' | 'graficna' | 'skica' | 'eksperimentalna' | 'povezovanje';
export type TaskStatus = 'draft' | 'verified';

export interface TaskOption { id: string; text: string }

export interface Task {
  id: string;
  created_at: string;
  updated_at: string;
  body: string;
  answer: string | null;
  solution: string | null;
  answer_kind: AnswerKind;
  options: TaskOption[] | null;
  correct: string | null;
  tolerance: number | null;
  unit: string | null;
  difficulty: Difficulty | null;
  bloom: BloomLevel | null;
  kinds: TaskKind[];
  curriculum: string | null;
  /** poglavja brez podpoglavja: '<curriculum>:<poglavjeId>' */
  chapters: string[];
  topics: string[];
  standards: string[];
  points: number;
  minutes: number | null;
  source: string | null;
  tags: string[];
  status: TaskStatus;
  /** naloga, iz katere je bila ta generirana (prikaz ugnezdeno pod njo) */
  parent_id: string | null;
}

export type TaskDraft = Omit<Task, 'id' | 'created_at' | 'updated_at'> & { id?: string };

export const emptyTask = (patch: Partial<TaskDraft> = {}): TaskDraft => ({
  body: '', answer: null, solution: null, answer_kind: 'open', options: null, correct: null, tolerance: null, unit: null,
  difficulty: null, bloom: null, kinds: [], curriculum: null, chapters: [], topics: [], standards: [], points: 1, minutes: null,
  source: 'lastna', tags: [], status: 'verified', parent_id: null, ...patch,
});

export const BLOOM: { level: BloomLevel; name: string; hint: string; color: string }[] = [
  { level: 1, name: 'Pomnjenje', hint: 'priklic dejstev, definicij, pojmov', color: '#7a8b99' },
  { level: 2, name: 'Razumevanje', hint: 'razložiti, opisati, primerjati s svojimi besedami', color: '#3f7cac' },
  { level: 3, name: 'Uporaba', hint: 'uporabiti znanje v novi situaciji, računske naloge', color: '#2d6a31' },
  { level: 4, name: 'Analiza', hint: 'razčleniti, poiskati vzroke, interpretirati podatke/grafe', color: '#b7791f' },
  { level: 5, name: 'Vrednotenje', hint: 'presoditi, utemeljiti, kritično oceniti', color: '#c0562b' },
  { level: 6, name: 'Ustvarjanje', hint: 'načrtovati poskus, sestaviti, predlagati rešitev', color: '#8e3b8e' },
];

export const DIFFICULTY: { level: Difficulty; name: string; color: string }[] = [
  { level: 1, name: 'lahka', color: '#2d6a31' },
  { level: 2, name: 'srednja', color: '#b7791f' },
  { level: 3, name: 'zahtevna', color: '#c0392b' },
];

export const KINDS: { id: TaskKind; name: string }[] = [
  { id: 'racunska', name: 'računska' },
  { id: 'besedilna', name: 'besedilna' },
  { id: 'graficna', name: 'grafična' },
  { id: 'skica', name: 'skica / risanje' },
  { id: 'eksperimentalna', name: 'eksperimentalna' },
  { id: 'povezovanje', name: 'povezovanje / razvrščanje' },
];

/** Izbirne oblike (možnosti A, B, C …): ena pravilna (mc), več pravilnih (multi), drži / ne drži (tf). */
export const isChoice = (k: AnswerKind) => k === 'mc' || k === 'multi' || k === 'tf';
/** Id-ji pravilnih možnosti (multi: v `correct` ločeni z vejico). */
export const correctIds = (t: { answer_kind: AnswerKind; correct: string | null }): string[] =>
  t.answer_kind === 'multi' ? (t.correct ?? '').split(',').filter(Boolean) : t.correct ? [t.correct] : [];
export const LETTERS = 'ABCDEFGHIJKL';

export const ANSWER_KINDS: { id: AnswerKind; name: string; quiz: boolean }[] = [
  { id: 'mc', name: 'ABCD', quiz: true },
  { id: 'multi', name: 'več možnosti', quiz: false },
  { id: 'tf', name: 'da / ne', quiz: true },
  { id: 'numeric', name: 'odprt odgovor (število)', quiz: true },
  { id: 'short', name: 'odprt odgovor', quiz: false },
  { id: 'open', name: 'odprt odgovor', quiz: false },
];

/**
 * Oblike odgovora, kot jih vidi učitelj (filtri, urejevalnik, generiranje kviza): ABCD, več možnosti, da / ne, odprt odgovor.
 * »Odprt odgovor« združuje odprte naloge in številski odgovor (ta se v kvizu samodejno točkuje, zato ostane v podatkih
 * ločen kot 'numeric'); stara oblika 'short' (kratek odgovor) šteje kot odprt odgovor.
 */
export const ANSWER_GROUPS: { id: AnswerKind; name: string; kinds: AnswerKind[]; quiz: boolean; hint: string }[] = [
  { id: 'mc', name: 'ABCD', kinds: ['mc'], quiz: true, hint: 'Ena pravilna možnost med ponujenimi (samodejno točkovanje v kvizu)' },
  { id: 'multi', name: 'več možnosti', kinds: ['multi'], quiz: false, hint: 'Pravilnih možnosti je lahko več' },
  { id: 'tf', name: 'da / ne', kinds: ['tf'], quiz: true, hint: 'Trditev, ki drži ali ne drži (samodejno točkovanje v kvizu)' },
  { id: 'open', name: 'odprt odgovor', kinds: ['open', 'short', 'numeric'], quiz: false, hint: 'Učenec odgovor zapiše sam (beseda, razlaga, izračun); če je odgovor število, se v kvizu točkuje samodejno' },
];
/** Skupina (oblika, kot jo vidi učitelj) za obliko odgovora v podatkih. */
export const answerGroupOf = (k: AnswerKind): AnswerKind => (k === 'numeric' || k === 'short' ? 'open' : k);

export const SOURCES: { id: string; name: string }[] = [
  { id: 'lastna', name: 'lastna' },
  { id: 'ucbenik', name: 'učbenik / DZ' },
  { id: 'npz', name: 'NPZ' },
  { id: 'tekmovanje', name: 'tekmovanje' },
  { id: 'ai', name: 'AI' },
  { id: 'drugo', name: 'drugo' },
];
