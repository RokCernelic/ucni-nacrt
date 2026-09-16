'use client';

import { useMemo } from 'react';
import { useRoster, type Student } from './useRoster';
import { useSeating, shuffleInto, makeRng, emptyHistory, bumpHistory, type Seating } from './useSeating';
import { useRooms, type RoomPlan } from './useRooms';
import { useFixedSeats, fixedMapForDate } from './useFixedSeats';
import { useDayOverrides, useDayLayouts } from '@/components/SeatingChart';
import { lessonsFor, canonLabel, type Lesson, type LessonSubject } from '@/data/timetable';

export interface ClassDayAssignment {
  classId: string;
  className: string;
  lesson: Lesson;
  layout: RoomPlan;
  assign: Record<string, string>;
  studentById: Map<string, Student>;
}

/**
 * Razpored za EN razred na DAN datum (lahko 0, 1 ali izjemoma več ur — npr.
 * fizika + tehnika isti dan). Uporablja isto pravično razporeditev (zgodovina
 * skozi vse pretekle ure tega razreda) kot glavni sedežni red, da se natisnjeni
 * razpored ujema s tistim, kar učitelj vidi na zaslonu za ta dan.
 */
export function useClassDayAssignments(
  classId: string, className: string, schoolHint: string, targetDate: string, subjectFilter?: LessonSubject,
): ClassDayAssignment[] {
  const { students } = useRoster(classId);
  const { seating } = useSeating(classId);
  const { getPlan } = useRooms();
  const { fixed } = useFixedSeats(classId);
  const { map: dayMap } = useDayOverrides(classId);
  const { map: dayLayoutMap } = useDayLayouts(classId);

  const lessons = useMemo(() => {
    const all = lessonsFor(canonLabel(className), schoolHint);
    return subjectFilter === undefined ? all : all.filter(l => l.u === null || l.u === subjectFilter);
  }, [className, schoolHint, subjectFilter]);

  const lessonsUpToTarget = useMemo(() => lessons.filter(l => l.d <= targetDate), [lessons, targetDate]);

  return useMemo(() => {
    const studentById = new Map(students.map(s => [s.id, s]));
    const results: ClassDayAssignment[] = [];
    const history = emptyHistory();
    for (const l of lessonsUpToTarget) {
      const lp = dayLayoutMap[l.d] ?? getPlan(l.r) ?? { rows: seating.rows, cols: seating.cols, disabled: seating.disabled };
      const lS: Seating = { rows: lp.rows, cols: lp.cols, disabled: lp.disabled, assign: {} };
      const ids = students.map(s => s.id);
      const actual = dayMap[l.d] ?? shuffleInto(lS, ids, students.filter(s => s.frontRow).map(s => s.id), makeRng(`${classId}|${l.d}`), {
        boyIds: students.filter(s => s.gender === 'M').map(s => s.id),
        pairIds: students.filter(s => s.nextToBoy).map(s => s.id),
        fixed: fixedMapForDate(fixed, l.d),
        history,
      });
      bumpHistory(history, actual);
      if (l.d === targetDate) results.push({ classId, className, lesson: l, layout: lp, assign: actual, studentById });
    }
    return results;
  }, [lessonsUpToTarget, targetDate, dayMap, dayLayoutMap, getPlan, seating.rows, seating.cols, seating.disabled, fixed, students, classId, className]);
}
