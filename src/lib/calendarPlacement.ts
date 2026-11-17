'use client';

/**
 * Počitnice, prazniki, dnevi dejavnosti in oznake v učnem načrtu: razvrščanje po datumu in samodejni vnos
 * uradnega šolskega koledarja v VSE učne načrte (vsi predmeti × vsi razredi), tudi tiste, ki jih učitelj še ni odprl.
 */

import { materialize, PAUSE_COLOR, type StoredItem } from '@/hooks/useEnotaOrder';
import { SCHOOL_CALENDARS, eventKey } from '@/data/schoolCalendar';
import { getCurriculum } from '@/data/registry';
import { lessonsFor, canonLabel } from '@/data/timetable';
import { schoolYearOf, hoursUntil, parseDay, lostHours, weekPatternFrom, uniformPattern, defaultWeekly, type WeekPattern } from '@/lib/schoolYear';

export const INFO_COLOR = '#4a6b8f';

/**
 * Elemente z datumom (počitnice, prazniki, oznake, ocenjevanja) v poglavjih enega razreda (`lists`, v vrstnem redu poglavij) razvrsti po datumu: vsak gre na mesto,
 * do katerega razred po urah pride do dneva pred datumom (`targetOf`), in vedno za prejšnjim po datumu.
 */
export function relayoutDated(lists: StoredItem[][], hoursOf: (ci: number, item: StoredItem) => number, targetOf: (from: string) => number): StoredItem[][] {
  type X = Extract<StoredItem, { k: 'x' }>;
  const dated: X[] = [];
  // vsi elementi z datumom: počitnice, prazniki, oznake in lastne enote z datumom (npr. ocenjevanje)
  const rest = lists.map(l => l.filter(i => { if (i.k === 'x' && i.from) { dated.push(i); return false; } return true; }));
  if (!dated.length || !rest.length) return lists;
  dated.sort((a, b) => a.from!.localeCompare(b.from!));
  let last: { ci: number; i: number } | null = null;
  const after = (ci: number, i: number) => !last || ci > last.ci || (ci === last.ci && i > last.i);
  for (const d of dated) {
    const target = targetOf(d.from!);
    let h = 0, at: { ci: number; i: number } | null = null;
    outer: for (let ci = 0; ci < rest.length; ci++) {
      for (let i = 0; i < rest[ci].length; i++) {
        if (h >= target - 1e-6 && after(ci, i)) {
          // na meji med poglavji raje na konec prejšnjega poglavja
          at = i === 0 && ci > 0 && after(ci - 1, rest[ci - 1].length) ? { ci: ci - 1, i: rest[ci - 1].length } : { ci, i };
          break outer;
        }
        h += hoursOf(ci, rest[ci][i]);
      }
    }
    if (!at) at = { ci: rest.length - 1, i: rest[rest.length - 1].length };
    rest[at.ci].splice(at.i, 0, d);
    last = at;
  }
  return rest;
}

/** Ure elementa za časovni trak / razvrščanje (oznake 0, lastne enote in počitnice njihove ure). */
export const customHours = (i: Extract<StoredItem, { k: 'x' }>) => (i.info ? 0 : (i.hours ?? 1));

/** Ciljne ure (ure pouka do dneva pred datumom) za razred. */
export function targetFn(grade: number, pattern: WeekPattern): (from: string) => number {
  const sy = { ...schoolYearOf(new Date(), grade), holidays: [] };
  return from => { const f = parseDay(from)!; return hoursUntil(new Date(f.getFullYear(), f.getMonth(), f.getDate() - 1), sy, pattern); };
}

const readJson = <T,>(key: string, fallback: T): T => { try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : fallback; } catch { return fallback; } };

/**
 * Uradni koledar (počitnice, prazniki, oznake) vstavi v vse učne načrte vseh razredov, ki še nimajo vseh dogodkov
 * tega šolskega leta, in jih razvrsti po datumu. Vrne število posodobljenih učnih načrtov.
 */
export function applyCalendarEverywhere(): number {
  const startYear = schoolYearOf(new Date()).start.getFullYear();
  const cal = SCHOOL_CALENDARS[startYear];
  if (!cal) return 0;
  const subjects = readJson<{ id: string; curriculum: string; subtitle?: string }[]>('ucni-nacrt-subjects', []);
  const master = readJson<{ id: string; name: string; school: string }[]>('ucni-nacrt-master-classes', []);
  let changed = 0;
  for (const s of subjects) {
    const entry = getCurriculum(s.curriculum);
    if (!entry) continue;
    const predmet = entry.predmet;
    const classIds = readJson<string[]>(`ucni-nacrt-view-ucni-${s.id}`, []);
    for (const cid of classIds) {
      const cls = master.find(m => m.id === cid);
      if (!cls) continue;
      const scope = `${s.id}::${cid}`;
      const flagKey = `ucni-nacrt-koledar-${scope}`;
      // že vstavljeni dogodki (prejšnja različica je zapisala le leto = vsi dnevi brez pouka)
      let done = new Set<string>();
      const rawFlag = localStorage.getItem(flagKey);
      if (rawFlag === String(startYear)) done = new Set(cal.events.filter(e => e.kind !== 'info').map(eventKey));
      else if (rawFlag) { try { const p = JSON.parse(rawFlag); if (p?.year === startYear && Array.isArray(p.keys)) done = new Set(p.keys); } catch { /* ignore */ } }
      if (cal.events.every(e => done.has(eventKey(e)))) continue;

      const gm = cls.name.match(/[6-9]/);
      const gradeFilter = gm ? Number(gm[0]) : null;
      const poglavja = gradeFilter != null ? predmet.poglavja.filter(p => p.razred === gradeFilter) : predmet.poglavja;
      const enoteKey = `ucni-nacrt-enote-order-${scope}`;
      const store = readJson<Record<string, StoredItem[]>>(enoteKey, {});
      const chapterOrder = readJson<Record<string, string[]>>(`ucni-nacrt-chapter-order-${scope}`, {});
      const hours = readJson<Record<string, number>>(`ucni-nacrt-hours-${scope}`, {});
      const weeklyMap = readJson<Record<string, number>>(`ucni-nacrt-weekly-${scope}`, {});
      const lessons = lessonsFor(canonLabel(cls.name), s.subtitle);
      const next = { ...store };

      for (const grade of [...new Set(poglavja.map(p => p.razred ?? 0))]) {
        const inGrade = poglavja.filter(p => (p.razred ?? 0) === grade);
        const ids = inGrade.map(p => p.id);
        const stored = chapterOrder[`${predmet.id}:${grade}`];
        const ordered = stored ? [...stored.filter(id => ids.includes(id)), ...ids.filter(id => !stored.includes(id))] : ids;
        const byId = new Map(inGrade.map(p => [p.id, p]));
        const chapters = ordered.map(id => ({ key: `${predmet.id}:${id}`, pp: byId.get(id)!.podpoglavja }));
        if (!chapters.length) continue;
        const lists = chapters.map(c => materialize(next[c.key], c.pp.map(pp => pp.id)));
        const weekly = weeklyMap[grade] ?? defaultWeekly(entry.gradeTargets[grade] ?? 70);
        const pattern = (lessons.length ? weekPatternFrom(lessons, predmet.id, weekly) : null) ?? uniformPattern(weekly);
        const sy = schoolYearOf(new Date(), grade);
        const existing = new Set(lists.flatMap(l => l.map(i => (i.k === 'x' ? i.from : undefined)).filter(Boolean)));
        let added = 0;
        for (const ev of cal.events) {
          if (done.has(eventKey(ev)) || (ev.grades && !ev.grades.includes(grade)) || existing.has(ev.from)) continue;
          const f = parseDay(ev.from), t = parseDay(ev.to);
          if (!f || !t || f > sy.end) continue;
          const info = ev.kind === 'info';
          lists[0].push({ k: 'x', id: crypto.randomUUID(), type: ev.label, checked: false, color: info ? INFO_COLOR : PAUSE_COLOR,
            hours: info ? 0 : lostHours(f, t, pattern), pause: true, from: ev.from, to: ev.to, ...(info ? { info: true } : {}) });
          added++;
        }
        if (!added) continue;
        const ppHours = new Map(chapters.flatMap(c => c.pp.map(pp => [pp.id, hours[`${predmet.id}:${pp.id}`] ?? pp.privzeteUre ?? 1] as const)));
        const out = relayoutDated(lists, (_ci, i) => (i.k === 'c' ? ppHours.get(i.id) ?? 1 : customHours(i)), targetFn(grade, pattern));
        chapters.forEach((c, ci) => { next[c.key] = out[ci]; });
      }
      const v = JSON.stringify(next);
      if (v !== JSON.stringify(store)) {
        localStorage.setItem(enoteKey, v);
        window.dispatchEvent(new StorageEvent('storage', { key: enoteKey, newValue: v, storageArea: localStorage }));
        changed++;
      }
      localStorage.setItem(flagKey, JSON.stringify({ year: startYear, keys: cal.events.map(eventKey) }));
    }
  }
  if (changed) window.dispatchEvent(new Event('ucni-nacrt-changed'));
  return changed;
}
