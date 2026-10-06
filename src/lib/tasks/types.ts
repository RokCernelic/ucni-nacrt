/** Baza nalog (supabase/migrations/20261006120000_naloge.sql). */

export type AnswerKind = 'mc' | 'tf' | 'numeric' | 'short' | 'open';
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
  topics: string[];
  standards: string[];
  points: number;
  minutes: number | null;
  source: string | null;
  tags: string[];
  status: TaskStatus;
}

export type TaskDraft = Omit<Task, 'id' | 'created_at' | 'updated_at'> & { id?: string };

export const emptyTask = (patch: Partial<TaskDraft> = {}): TaskDraft => ({
  body: '', answer: null, solution: null, answer_kind: 'open', options: null, correct: null, tolerance: null, unit: null,
  difficulty: null, bloom: null, kinds: [], curriculum: null, topics: [], standards: [], points: 1, minutes: null,
  source: 'lastna', tags: [], status: 'verified', ...patch,
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

export const ANSWER_KINDS: { id: AnswerKind; name: string; quiz: boolean }[] = [
  { id: 'mc', name: 'izbirno (A–F)', quiz: true },
  { id: 'tf', name: 'drži / ne drži', quiz: true },
  { id: 'numeric', name: 'številsko', quiz: true },
  { id: 'short', name: 'kratek odgovor', quiz: false },
  { id: 'open', name: 'odprto / esejsko', quiz: false },
];

export const SOURCES: { id: string; name: string }[] = [
  { id: 'lastna', name: 'lastna' },
  { id: 'ucbenik', name: 'učbenik / DZ' },
  { id: 'npz', name: 'NPZ' },
  { id: 'tekmovanje', name: 'tekmovanje' },
  { id: 'ai', name: 'AI' },
  { id: 'drugo', name: 'drugo' },
];
