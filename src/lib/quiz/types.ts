/** Kvizi — podatkovni model (glej docs/KVIZI.md). */

export type QuestionKind = 'mc' | 'numeric';

export interface QuizOption {
  /** stabilen id — mešanje vrstnega reda ne vpliva na rezultate */
  id: string;
  text: string;
  /** ob mešanju ostane na svojem mestu (npr. »nič od naštetega«) */
  keepPlace?: boolean;
}

interface QuestionBase {
  id: string;
  prompt: string;
  /** slika vprašanja (zaenkrat pomanjšan data URL; kasneje pot v Supabase Storage) */
  image?: string;
  /** točke za pravilen odgovor (privzeto 1) */
  points: number;
}

export interface McQuestion extends QuestionBase {
  kind: 'mc';
  options: QuizOption[];
  /** id pravilne možnosti */
  correct: string | null;
}

export interface NumericQuestion extends QuestionBase {
  kind: 'numeric';
  /** pravilna vrednost, kot jo vpiše učitelj (vejica ali pika) */
  correct: string;
  /** dovoljeno ± odstopanje (0 = točno) */
  tolerance: number;
}

export type Question = McQuestion | NumericQuestion;

export interface Quiz {
  id: string;
  title: string;
  folderId: string | null;
  questions: Question[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

export interface QuizFolder {
  id: string;
  name: string;
  parentId: string | null;
}
