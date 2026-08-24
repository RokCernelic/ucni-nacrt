import { fizika } from './fizika';
import { tehnika } from './tehnika';
import type { Predmet } from '@/types/curriculum';

export interface CurriculumEntry {
  /** id učnega načrta (kurikula) */
  id: string;
  predmet: Predmet;
  gradeTargets: Record<number, number>;
}

/** Vsi razpoložljivi učni načrti, ki jih učitelj lahko doda kot svoj predmet. */
export const CURRICULA: CurriculumEntry[] = [
  { id: 'fizika', predmet: fizika, gradeTargets: { 8: 70, 9: 64 } },
  { id: 'tehnika', predmet: tehnika, gradeTargets: { 6: 70, 7: 35, 8: 35 } },
];

export function getCurriculum(id: string): CurriculumEntry | null {
  return CURRICULA.find(c => c.id === id) ?? null;
}
