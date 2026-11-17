/**
 * Šolsko leto (1. 9. – 24. 6.) in štetje ur pouka do danega datuma (2 uri na teden, kot fizika v OŠ).
 * Počitnice so približne (slovenski šolski koledar): jesenske, novoletne, zimske, prvomajske — v teh dneh ur ni.
 */

export const HOURS_PER_WEEK = 2;

const day = (y: number, m: number, d: number) => new Date(y, m, d);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

export interface SchoolYear { start: Date; end: Date; holidays: [Date, Date][] }

/** Šolsko leto, v katerem je `today` (julij in avgust štejeta k letu, ki se začne 1. 9.). */
export function schoolYearOf(today = new Date()): SchoolYear {
  const y = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const autumn = mondayOf(day(y, 9, 29));                 // teden okrog 29. 10.
  const winter = mondayOf(day(y + 1, 1, 20));             // teden okrog 20. 2. (ena od obeh skupin)
  return {
    start: day(y, 8, 1),
    end: day(y + 1, 5, 24),
    holidays: [
      [autumn, addDays(autumn, 4)],
      [day(y, 11, 25), day(y + 1, 0, 2)],
      [winter, addDays(winter, 4)],
      [day(y + 1, 3, 27), day(y + 1, 4, 2)],
    ],
  };
}

const isHoliday = (d: Date, sy: SchoolYear) => sy.holidays.some(([a, b]) => d >= a && d <= b);

/** Ure pouka od začetka šolskega leta do vključno `date` (po 2 uri na teden, dnevi pouka enakomerno). */
export function hoursUntil(date: Date, sy: SchoolYear): number {
  const end = date < sy.end ? date : sy.end;
  let days = 0;
  for (let d = sy.start; d <= end; d = addDays(d, 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6 && !isHoliday(d, sy)) days++;
  }
  return (days * HOURS_PER_WEEK) / 5;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];

/** Začetki mesecev v šolskem letu (sep … jun) z urami, opravljenimi do tedaj. */
export function monthMarks(sy: SchoolYear): { label: string; hours: number }[] {
  const out: { label: string; hours: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const d = day(sy.start.getFullYear(), 8 + i, 1);
    out.push({ label: MONTHS[d.getMonth()], hours: i === 0 ? 0 : hoursUntil(addDays(d, -1), sy) });
  }
  return out;
}

export const shortDate = (d: Date) => `${d.getDate()}. ${d.getMonth() + 1}.`;
