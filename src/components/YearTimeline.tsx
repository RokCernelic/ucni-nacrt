'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { schoolYearOf, hoursUntil, monthMarks, shortDate, HOURS_PER_WEEK } from '@/lib/schoolYear';

type Anchor = [y: number, hours: number];

/**
 * Navpični časovni trak ob levi strani seznama učnega načrta: sega od vrha do dna seznama, ure podpoglavij
 * (in lastnih enot) določajo, kje je kateri mesec šolskega leta (2 uri na teden). Rdeča črtica = danes.
 * Zaprto poglavje se šteje kot en blok z vsemi svojimi urami; odpiranje, zapiranje in spreminjanje ur trak sproti prilagodi.
 */
export default function YearTimeline({ cardRef }: { cardRef: React.RefObject<HTMLElement | null> }) {
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [height, setHeight] = useState(0);
  const [top, setTop] = useState(0);
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
    let h = 0;
    const y = (r: DOMRect, edge: 'top' | 'bottom') => r[edge] - cr.top;
    for (const ch of Array.from(card.querySelectorAll<HTMLElement>('[data-tl-chapter]'))) {
      const r = ch.getBoundingClientRect();
      const units = Array.from(ch.querySelectorAll<HTMLElement>('[data-tl-unit]'));
      a.push([y(r, 'top'), h]);
      if (!units.length) {
        h += Number(ch.dataset.tlHours) || 0;
      } else {
        for (const u of units) {
          const ur = u.getBoundingClientRect();
          a.push([y(ur, 'top'), h]);
          h += Number(u.dataset.tlHours) || 0;
          a.push([y(ur, 'bottom'), h]);
        }
      }
      a.push([y(r, 'bottom'), h]);
    }
    a.push([cr.height, h]);
    const same = a.length === anchors.length && a.every((p, i) => Math.abs(p[0] - anchors[i][0]) < 0.5 && p[1] === anchors[i][1]);
    if (!same) setAnchors(a);
    if (Math.abs(cr.height - height) > 0.5) setHeight(cr.height);
    if (card.offsetTop !== top) setTop(card.offsetTop);
  };
  const measureRef = useRef(measure);
  // meritev DOM-a po vsakem izrisu (odprta/zaprta poglavja, spremenjene ure); stanje se spremeni le ob razliki
  // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const sy = schoolYearOf(today);
  const inYear = today >= sy.start && today <= sy.end;
  const nowH = hoursUntil(today, sy);
  const nowY = inYear ? yOf(Math.min(nowH, total)) : null;
  const marks = monthMarks(sy).filter(m => m.hours <= total + 1e-6);
  const endH = hoursUntil(sy.end, sy);
  const ends = endH <= total ? yOf(endH) : null;
  const yearLabel = `${sy.start.getFullYear()}/${String(sy.end.getFullYear()).slice(2)}`;

  return (
    <div className="year-tl" aria-hidden style={{ top, height }}>
      <span className="year-tl-year">{yearLabel}</span>
      <i className="year-tl-rail" />
      {nowY != null && <i className="year-tl-past" style={{ height: nowY }} />}
      {marks.map(m => {
        const y = yOf(m.hours);
        return (
          <span key={m.label} className="year-tl-mark" style={{ top: y }}>
            <b>{m.label}</b>
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
          title={`Danes, ${shortDate(today)}: po urniku (${HOURS_PER_WEEK} uri na teden) je za razredom približno ${Math.round(nowH)} ur${nowH > total ? ' — več, kot jih je razporejenih v učnem načrtu' : ''}`}>
          <em>{shortDate(today)}</em>
        </span>
      )}
    </div>
  );
}
