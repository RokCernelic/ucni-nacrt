/**
 * Šolsko leto (1. 9. – 24. 6., 9. razred do 15. 6.) in štetje ur pouka do danega datuma (2 uri na teden, kot fizika v OŠ).
 * Počitnice in prazniki po uradnem šolskem koledarju (src/data/schoolCalendar.ts), za druga leta približno — v teh dneh ur ni.
 */

import { SCHOOL_CALENDARS } from '@/data/schoolCalendar';

export const HOURS_PER_WEEK = 2;

const day = (y: number, m: number, d: number) => new Date(y, m, d);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

export interface SchoolYear { start: Date; end: Date; holidays: [Date, Date][] }

/**
 * Šolsko leto, v katerem je `today` (julij in avgust štejeta k letu, ki se začne 1. 9.). Za leta z uradnim koledarjem
 * (src/data/schoolCalendar.ts) veljajo uradni datumi počitnic in praznikov ter konec pouka (9. razred prej), sicer približni.
 */
export function schoolYearOf(today = new Date(), grade?: number | null): SchoolYear {
  const y = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const cal = SCHOOL_CALENDARS[y];
  if (cal) {
    const p = (iso: string) => parseDay(iso)!;
    return { start: p(cal.start), end: p(grade === 9 ? cal.end9 : cal.end), holidays: cal.events.map(e => [p(e.from), p(e.to)] as [Date, Date]) };
  }
  const autumn = mondayOf(day(y, 9, 29));                 // teden okrog 29. 10.
  const winter = mondayOf(day(y + 1, 1, 20));             // teden okrog 20. 2. (ena od obeh skupin)
  return {
    start: day(y, 8, 1),
    end: day(y + 1, 5, grade === 9 ? 15 : 24),
    holidays: [
      [autumn, addDays(autumn, 4)],
      [day(y, 11, 25), day(y + 1, 0, 2)],
      [winter, addDays(winter, 4)],
      [day(y + 1, 3, 27), day(y + 1, 4, 2)],
    ],
  };
}

const isHoliday = (d: Date, sy: SchoolYear) => sy.holidays.some(([a, b]) => d >= a && d <= b);

/**
 * Ure pouka od začetka šolskega leta do vključno `date`: po urniku razreda (`pattern`, ure na dan v tednu)
 * ali enakomerno 2 uri na teden; vgrajene počitnice v `sy` se izpustijo.
 */
export function hoursUntil(date: Date, sy: SchoolYear, pattern?: WeekPattern | null): number {
  const end = date < sy.end ? date : sy.end;
  let h = 0;
  for (let d = sy.start; d <= end; d = addDays(d, 1)) if (!isHoliday(d, sy)) h += hoursOnDay(d, pattern);
  return h;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];

/** Začetki mesecev v šolskem letu (sep … jun) z urami, opravljenimi do tedaj. */
export function monthMarks(sy: SchoolYear, pattern?: WeekPattern | null): { label: string; hours: number }[] {
  const out: { label: string; hours: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const d = day(sy.start.getFullYear(), 8 + i, 1);
    out.push({ label: MONTHS[d.getMonth()], hours: i === 0 ? 0 : hoursUntil(addDays(d, -1), sy, pattern) });
  }
  return out;
}

export const shortDate = (d: Date) => `${d.getDate()}. ${d.getMonth() + 1}.`;

/** Datum iz polja <input type="date"> (YYYY-MM-DD) v lokalnem času. */
export const parseDay = (iso: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/**
 * Ure predmeta, ki odpadejo v obdobju od–do: cel dan brez pouka → odpadejo vse ure predmeta tisti dan
 * (po urniku razreda; brez urnika enakomerno 2 / 5 na delovni dan).
 */
export function lostHours(from: Date, to: Date, pattern?: WeekPattern | null): number {
  let h = 0, weekdays = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) { h += hoursOnDay(d, pattern); if (d.getDay() % 6 !== 0) weekdays++; }
  // brez urnika ne vemo, ali je bil predmet tisti dan: en dan (praznik, dan dejavnosti) = 1 ura
  return pattern ? Math.round(h) : weekdays ? Math.max(1, Math.round(h)) : 0;
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

/**
 * Ure predmeta po dnevih v tednu (0 = nedelja … 6 = sobota) iz urnika razreda: običajno število ur na tisti dan.
 * null, če razreda v urniku ni ali urnik nima 2 ur na teden (takrat velja enakomerno 2 uri na teden).
 */
export type WeekPattern = number[];
export function weekPatternFrom(lessons: { d: string; u: string | null }[], subject: string): WeekPattern | null {
  const own = lessons.filter(l => l.u === subject);
  if (!own.length) return null;
  const perDate = new Map<string, number>();
  for (const l of own) perDate.set(l.d, (perDate.get(l.d) ?? 0) + 1);
  const days = new Set(lessons.map(l => l.d));
  const pat = [0, 0, 0, 0, 0, 0, 0];
  for (let wd = 0; wd < 7; wd++) {
    const dates = [...days].filter(d => parseDay(d)?.getDay() === wd);
    if (!dates.length) continue;
    // najpogostejše število ur tega predmeta na ta dan v tednu
    const counts = new Map<number, number>();
    for (const d of dates) { const n = perDate.get(d) ?? 0; counts.set(n, (counts.get(n) ?? 0) + 1); }
    pat[wd] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  }
  // urnik upoštevamo le, če se ujema z 2 urama na teden (sicer je v njem verjetno kaj manjkalo)
  return pat.reduce((x, n) => x + n, 0) === HOURS_PER_WEEK ? pat : null;
}

/** Ure, ki bi bile na dan `d` (po urniku razreda ali enakomerno 2 / 5 na delovni dan). */
export const hoursOnDay = (d: Date, pattern?: WeekPattern | null) => {
  const wd = d.getDay();
  if (pattern) return pattern[wd] ?? 0;
  return wd === 0 || wd === 6 ? 0 : HOURS_PER_WEEK / 5;
};
