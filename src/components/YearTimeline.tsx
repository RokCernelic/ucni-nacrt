'use client';
/* eslint-disable react-hooks/set-state-in-effect -- trak meri DOM po vsakem izrisu; stanje se spremeni le ob dejanski razliki */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { schoolYearOf, hoursUntil, monthMarks, shortDate, parseDay, schoolWeek, weekStarts, type WeekPattern } from '@/lib/schoolYear';

type Anchor = [y: number, hours: number];

/**
 * Navpični časovni trak ob levi strani seznama učnega načrta: sega od vrha do dna seznama, ure podpoglavij
 * (in lastnih enot) določajo, kje je kateri mesec šolskega leta (2 uri na teden). Rdeča črtica = danes.
 * Zaprto poglavje se šteje kot en blok z vsemi svojimi urami; odpiranje, zapiranje in spreminjanje ur trak sproti prilagodi.
 */
export default function YearTimeline({ cardRef, pattern, grade }: { cardRef: React.RefObject<HTMLElement | null>; pattern?: WeekPattern | null; grade?: number }) {
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [height, setHeight] = useState(0);
  const [top, setTop] = useState(0);
  /** odseki počitnic / praznikov na traku (y od–do) in ali jih je učitelj sploh vnesel */
  const [pauses, setPauses] = useState<[number, number][]>([]);
  const [ownPauses, setOwnPauses] = useState(false);
  /** počitnice z datumi: [ure ob začetku, ure ob koncu, od, do] (sidra za poravnavo s koledarjem) */
  const [dated, setDated] = useState<[number, number, string, string][]>([]);
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setToday(new Date());
    tick();
    const t = setInterval(tick, 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const measure = () => {
    const card = cardRef.current;
    if (!card) return;
    const cr = card.getBoundingClientRect();
    const a: Anchor[] = [[0, 0]];
    const ps: [number, number][] = [];
    const ds: [number, number, string, string][] = [];
    let h = 0;
    const y = (r: DOMRect, edge: 'top' | 'bottom') => r[edge] - cr.top;
    for (const ch of Array.from(card.querySelectorAll<HTMLElement>('[data-tl-chapter]'))) {
      const r = ch.getBoundingClientRect();
      const units = Array.from(ch.querySelectorAll<HTMLElement>('[data-tl-unit]'));
      a.push([y(r, 'top'), h]);
      try {
        for (const [off, hrs, from, to] of JSON.parse(ch.dataset.tlDated ?? '[]') as [number, number, string, string][]) ds.push([h + off, h + off + hrs, from, to]);
      } catch { /* ignore */ }
      if (!units.length) {
        h += Number(ch.dataset.tlHours) || 0;
      } else {
        for (const u of units) {
          const ur = u.getBoundingClientRect();
          a.push([y(ur, 'top'), h]);
          h += Number(u.dataset.tlHours) || 0;
          a.push([y(ur, 'bottom'), h]);
          if (u.dataset.tlPause) ps.push([y(ur, 'top'), y(ur, 'bottom')]);
        }
      }
      a.push([y(r, 'bottom'), h]);
    }
    a.push([cr.height, h]);
    const same = a.length === anchors.length && a.every((p, i) => Math.abs(p[0] - anchors[i][0]) < 0.5 && p[1] === anchors[i][1]);
    if (!same) setAnchors(a);
    if (Math.abs(cr.height - height) > 0.5) setHeight(cr.height);
    if (JSON.stringify(ps.map(p => p.map(Math.round))) !== JSON.stringify(pauses.map(p => p.map(Math.round)))) setPauses(ps);
    if (JSON.stringify(ds) !== JSON.stringify(dated)) setDated(ds);
    const own = !!card.querySelector('[data-tl-pause]');
    if (own !== ownPauses) setOwnPauses(own);
    if (card.offsetTop !== top) setTop(card.offsetTop);
  };
  const measureRef = useRef(measure);
  // meritev DOM-a po vsakem izrisu (odprta/zaprta poglavja, spremenjene ure); stanje se spremeni le ob razliki
  useLayoutEffect(() => { measureRef.current = measure; measure(); });
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const run = () => measureRef.current();
    const ro = new ResizeObserver(run);
    ro.observe(card);
    const mo = new MutationObserver(run);
    mo.observe(card, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tl-hours'] });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [cardRef]);

  if (!today || anchors.length < 2 || !height) return null;
  const total = anchors[anchors.length - 1][1];
  if (total <= 0) return null;

  /** navpični položaj, kjer je doseženih `hrs` ur (linearno znotraj enote) */
  const yOf = (hrs: number): number => {
    if (hrs <= 0) return 0;
    for (let i = 1; i < anchors.length; i++) {
      const [y0, h0] = anchors[i - 1], [y1, h1] = anchors[i];
      if (h1 > h0 && hrs <= h1) return y0 + ((hrs - h0) / (h1 - h0)) * (y1 - y0);
    }
    return height;
  };

  // učitelj je vnesel lastne počitnice/praznike → vgrajenih (približnih) počitnic ne upoštevamo, sicer bi jih šteli dvakrat
  const sy0 = schoolYearOf(today, grade);
  const sy = ownPauses ? { ...sy0, holidays: [] } : sy0;
  // koledar (ure pouka po 2 na teden) → položaj v učnem načrtu: počitnice z datumom so sidra, vmes teče 1 : 1
  const pts: [number, number][] = [[0, 0]];
  for (const [h0, h1, from, to] of [...dated].sort((x, y) => x[0] - y[0])) {
    const f = parseDay(from), t = parseDay(to);
    if (!f || !t) continue;
    const c0 = hoursUntil(new Date(f.getFullYear(), f.getMonth(), f.getDate() - 1), sy, pattern), c1 = hoursUntil(t, sy, pattern);
    const [pc, ph] = pts[pts.length - 1];
    if (c0 >= pc && h0 >= ph && c1 >= c0 && h1 >= h0) pts.push([c0, h0], [c1, h1]);
  }
  const toH = (c: number) => {
    for (let i = 1; i < pts.length; i++) {
      const [c0, h0] = pts[i - 1], [c1, h1] = pts[i];
      if (c <= c1) return c1 > c0 ? h0 + ((c - c0) / (c1 - c0)) * (h1 - h0) : h1;
    }
    const [cl, hl] = pts[pts.length - 1];
    return hl + (c - cl);
  };
  const inYear = today >= sy.start && today <= sy.end;
  const nowH = toH(hoursUntil(today, sy, pattern));
  const nowY = inYear ? yOf(Math.min(nowH, total)) : null;
  const marks = monthMarks(sy, pattern).map(m => ({ ...m, hours: toH(m.hours) })).filter(m => m.hours <= total + 1e-6);
  const endH = toH(hoursUntil(sy.end, sy, pattern));
  const ends = endH <= total ? yOf(endH) : null;
  // šolski tedni (diskretno, desno ob traku): črtica za vsak teden, številka, kjer je dovolj prostora
  const weeks: { n: number; y: number; label: boolean }[] = [];
  let lastLabel = -1e9, lastTick = -1e9;
  for (const w of weekStarts(sy)) {
    const h = toH(hoursUntil(new Date(w.date.getFullYear(), w.date.getMonth(), w.date.getDate() - 1), sy, pattern));
    if (h > total + 1e-6) break;
    const y = yOf(h);
    if (y - lastTick < 3) continue;
    const label = y - lastLabel >= 16;
    weeks.push({ n: w.n, y, label });
    lastTick = y;
    if (label) lastLabel = y;
  }
  const week = inYear ? schoolWeek(today, sy) : null;
  const yearLabel = `${sy.start.getFullYear()}/${String(sy.end.getFullYear()).slice(2)}`;

  return (
    <div className="year-tl" aria-hidden style={{ top, height }}>
      <span className="year-tl-year">{yearLabel}</span>
      <i className="year-tl-rail" />
      {nowY != null && <i className="year-tl-past" style={{ height: nowY }} />}
      {weeks.map(w => (
        <span key={w.n} className="year-tl-week" style={{ top: w.y }}>{w.label && <b>{w.n}</b>}</span>
      ))}
      {pauses.map(([y0, y1], i) => <i key={i} className="year-tl-pause" style={{ top: y0, height: Math.max(3, y1 - y0) }} />)}
      {marks.map(m => ({ ...m, y: yOf(m.hours) }))
        // meseci, ki padejo skoraj na isto mesto: ostane poznejši (prejšnji bi se prekrival)
        .filter((m, i, arr) => !(arr[i + 1] && arr[i + 1].y - m.y < 12))
        .map(({ label, y, ...m }) => {
        return (
          <span key={label} className="year-tl-mark" style={{ top: y }} data-h={m.hours}>
            <b>{label}</b>
          </span>
        );
      })}
      {ends != null && (
        <span className="year-tl-mark is-end" style={{ top: ends }} title="Konec pouka">
          <b>{shortDate(sy.end)}</b>
        </span>
      )}
      {nowY != null && (
        <span className="year-tl-now" style={{ top: nowY }}
          title={`Danes, ${shortDate(today)} (${week}. šolski teden): po urniku je za razredom približno ${Math.round(nowH)} ur${nowH > total ? ' — več, kot jih je razporejenih v učnem načrtu' : ''}`}>
          <em>{shortDate(today)}<small>{week}. teden</small></em>
        </span>
      )}
    </div>
  );
}
