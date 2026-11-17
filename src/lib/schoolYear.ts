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

/** Datum iz polja <input type="date"> (YYYY-MM-DD) v lokalnem času. */
export const parseDay = (iso: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/** Ure pouka, ki odpadejo v obdobju od–do (delovni dnevi × 2 / 5), vsaj 1. */
export function lostHours(from: Date, to: Date): number {
  let days = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) { const wd = d.getDay(); if (wd !== 0 && wd !== 6) days++; }
  return Math.max(1, Math.round((days * HOURS_PER_WEEK) / 5));
}

export const nextDay = (d: Date) => addDays(d, 1);

/** Šolski teden: 1. teden je tisti (pon–ned), v katerem je 1. september. */
export function schoolWeek(date: Date, sy: SchoolYear = schoolYearOf(date)): number {
  const w0 = mondayOf(sy.start);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((mondayOf(d).getTime() - w0.getTime() + 12 * 3600e3) / (7 * 86400e3)) + 1;
}

/** Začetki šolskih tednov (ponedeljki; 1. teden od 1. 9.) do konca pouka. */
export function weekStarts(sy: SchoolYear): { n: number; date: Date }[] {
  const out: { n: number; date: Date }[] = [{ n: 1, date: sy.start }];
  for (let d = addDays(mondayOf(sy.start), 7), n = 2; d <= sy.end; d = addDays(d, 7), n++) out.push({ n, date: d });
  return out;
}
