/** Kvizi — podatkovni model (glej docs/KVIZI.md). */

export type QuestionKind = 'mc' | 'numeric' | 'open';

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
  /** naloga v bazi, iz katere je vprašanje nastalo (za oznake: težavnost, Bloom, poglavje) */
  taskId?: string;
  /** dodaten razmik pod nalogo na natisnjenem listu (mm; privzeto po slogu lista) */
  gapAfter?: number;
  /** razmik pod nalogo pri tisku dveh testov na en list (mm; privzeto 3,5) */
  gapHalf?: number;
  /** postavitev slik v besedilu naloge na natisnjenem listu (po vrsti slik): širina in odmik v mm */
  imgs?: (ImgLayout | null)[];
}

/** Velikost in položaj slike znotraj naloge na listu (mm): `w` širina, `x` odmik levo/desno, `y` odmik gor/dol. */
export interface ImgLayout { w: number; x: number; y: number }

export interface McQuestion extends QuestionBase {
  kind: 'mc';
  options: QuizOption[];
  /** id pravilne možnosti; pri `multi` id-ji vseh pravilnih, urejeni in ločeni z vejico */
  correct: string | null;
  /** več pravilnih možnosti (naloga »več možnosti« na natisnjenem listu): pravilno le, če so označene natanko vse pravilne */
  multi?: boolean;
}

export interface NumericQuestion extends QuestionBase {
  kind: 'numeric';
  /** pravilna vrednost, kot jo vpiše učitelj (vejica ali pika) */
  correct: string;
  /** dovoljeno ± odstopanje (0 = točno) */
  tolerance: number;
  /** pričakovana enota (učenec jo lahko zapiše ali ne; z drugo predpono se pretvori) */
  unit?: string;
  /** prostor za odgovor na natisnjenem listu (mm; privzeto 15) */
  space?: number;
}

/** Odprto vprašanje (račun, zapis odgovora): se ne točkuje samodejno — učitelj pregleda ročno. */
export interface OpenQuestion extends QuestionBase {
  kind: 'open';
  /** obogateno besedilo (formule, slike) za tisk */
  html?: string;
  /** vzorčni odgovor / rešitev za učitelja (učenci ga ne vidijo) */
  answer?: string;
  /** prostor za odgovor na natisnjenem listu (mm) */
  space?: number;
  /** v izvedbi natisnjenega kviza: točke vpiše učitelj (naloga, ki je skener ne prebere); odgovor = število točk */
  manual?: boolean;
}

export type Question = McQuestion | NumericQuestion | OpenQuestion;

export interface Quiz {
  id: string;
  title: string;
  folderId: string | null;
  questions: Question[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  /** razpored natisnjenega lista (urejevalnik A4) */
  sheet?: QuizSheetLayout;
}

export interface QuizSheetLayout {
  /** razmik med stolpcema izbirnih nalog (mm; privzeto 8) */
  colGap?: number;
  /** skrij okvirček za točke ob nalogah (besedilo naloge dobi več prostora) */
  hidePoints?: boolean;
}

export interface QuizFolder {
  id: string;
  name: string;
  parentId: string | null;
}
