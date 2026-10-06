import { CURRICULA, getCurriculum } from '@/data/registry';
import type { Standard } from '@/types/curriculum';

export interface TopicInfo {
  /** '<curriculum>:<podpoglavjeId>' — enako kot ključ v učnem načrtu */
  key: string;
  curriculum: string;
  predmet: string;
  grade: number | null;
  /** npr. "1.2" */
  number: string;
  title: string;
  chapter: string;
  /** enoličen ključ poglavja: '<curriculum>:<poglavjeId>' */
  chapterKey: string;
  standards: Standard[];
}

const cache = new Map<string, TopicInfo[]>();

/** Vsa podpoglavja učnega načrta z enakim oštevilčenjem kot v pogledu Učni načrt. */
export function topicsOf(curriculumId: string): TopicInfo[] {
  const hit = cache.get(curriculumId);
  if (hit) return hit;
  const entry = getCurriculum(curriculumId);
  if (!entry) return [];
  const p = entry.predmet;
  const continuous = p.continuousNumbering ?? false;
  const perGrade = new Map<number, number>();
  const out: TopicInfo[] = [];
  p.poglavja.forEach((pg, gi) => {
    const grade = pg.razred ?? 0;
    const n = continuous ? gi + 1 : (perGrade.get(grade) ?? 0) + 1;
    perGrade.set(grade, (perGrade.get(grade) ?? 0) + 1);
    pg.podpoglavja.forEach((pp, i) => out.push({
      key: `${curriculumId}:${pp.id}`, curriculum: curriculumId, predmet: p.naslov, grade: pg.razred ?? null,
      number: `${n}.${i + 1}`, title: pp.naslov, chapter: `${n} ${pg.naslov}`, chapterKey: `${curriculumId}:${pg.id}`, standards: pp.standardi,
    }));
  });
  cache.set(curriculumId, out);
  return out;
}

export function topicInfo(key: string): TopicInfo | null {
  const curriculum = key.split(':')[0];
  return topicsOf(curriculum).find(t => t.key === key) ?? null;
}

export const topicLabel = (key: string) => {
  const t = topicInfo(key);
  return t ? `${t.grade ? `${t.grade}. r · ` : ''}${t.number} ${t.title}` : key;
};

export const allCurricula = () => CURRICULA.map(c => ({ id: c.id, name: c.predmet.naslov }));

/** Ali naloga preverja vsaj en minimalni standard? */
export function hasMinimalStandard(standardIds: string[], topics: string[]): boolean {
  if (!standardIds.length) return false;
  const ids = new Set(standardIds);
  return topics.some(k => topicInfo(k)?.standards.some(s => ids.has(s.id) && s.minimalni));
}
