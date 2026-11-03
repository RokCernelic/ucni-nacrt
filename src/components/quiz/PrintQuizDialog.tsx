'use client';

import { useEffect, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import QRCode from 'qrcode';
import { useMasterClasses } from '@/hooks/useMasterClasses';
import { useRoster } from '@/hooks/useRoster';
import { Rich } from '@/components/tasks/ui';
import { layoutSheet, sheetToken, sheetSeed, frameGeometry, type PrintItem, type SheetLayout } from '@/lib/quiz/printSheet';
import { createPaperSession } from '@/lib/quiz/paperSession';
import Link from 'next/link';

export interface Sheet { key: string; name: string | null; qr: string | null; layout: SheetLayout }

const todayLabel = () => new Date().toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric' });

/** Tiskanje kviza na A4: odgovorni obrazec (krogci) zgoraj, vprašanja pod njim; po želji list za vsakega učenca (ime, QR, drugačen vrstni red). */
export default function PrintQuizDialog({ items, title, quizId, defaultClassId, onClose }: {
  items: PrintItem[]; title: string; quizId: string | null; defaultClassId?: string; onClose: () => void;
}) {
  const { classes } = useMasterClasses();
  const [pickedClass, setPickedClass] = useState('');
  const [perStudent, setPerStudent] = useState(true);
  const [shuffle, setShuffle] = useState(true);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** po tisku po učencih: seja za skener in rezultate */
  const [printed, setPrinted] = useState<{ sessionId: string; scanQr: string } | null>(null);
  const classId = pickedClass || (classes.some(c => c.id === defaultClassId) ? defaultClassId! : classes[0]?.id ?? '');
  const { students } = useRoster(classId || undefined);
  const cls = classes.find(c => c.id === classId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nChoice = items.filter(i => i.choice).length;
  const canPrint = items.length > 0 && !busy && (!perStudent || students.length > 0);

  const print = async () => {
    setBusy(true); setError(null);
    try {
      let list: Sheet[];
      if (perStudent) {
        if (!cls) return;
        // seja za skeniranje (odgovori gredo v skupno statistiko kvizov)
        const session = await createPaperSession({ title, quizId, classId: cls.id, className: cls.name, students, items, shuffle });
        const salt = session.paper!.salt;
        list = await Promise.all(students.map(async st => ({
          key: st.id, name: st.name,
          qr: await QRCode.toDataURL(sheetToken(session.id, st.id), { margin: 0, width: 240, errorCorrectionLevel: 'M' }),
          layout: layoutSheet(items, shuffle ? sheetSeed(salt, st.id) : null),
        })));
        setPrinted({ sessionId: session.id, scanQr: await QRCode.toDataURL(`${window.location.origin}/kvizi/skener`, { margin: 1, width: 220 }) });
      } else {
        list = [{ key: 'all', name: null, qr: null, layout: layoutSheet(items, null) }];
      }
      const style = document.createElement('style');
      style.textContent = '@page { size: A4 portrait; margin: 10mm 0; }'; // odmik zgoraj/spodaj tudi na nadaljnjih straneh
      document.head.appendChild(style);
      const root = document.documentElement;
      const done = () => { root.classList.remove('printing-questions'); setSheets(null); style.remove(); window.removeEventListener('afterprint', done); };
      flushSync(() => setSheets(list));
      root.classList.add('printing-questions');
      window.addEventListener('afterprint', done);
      window.print();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const labelStyle: React.CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)', display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px', cursor: 'pointer' };

  return (
    <>
      <div onClick={e => { e.stopPropagation(); onClose(); }} className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(20,30,25,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}>
        <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Natisni kviz"
          style={{ background: 'var(--canvas)', borderRadius: 'var(--r-lg)', padding: '24px 26px', width: '100%', maxWidth: '520px', fontFamily: 'var(--font-sans)' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '26px', fontWeight: 400, margin: '0 0 4px', color: 'var(--ink)' }}>Natisni kviz</h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 16px' }}>
            {title} · {items.length} vprašanj ({nChoice} izbirnih v obrazcu na vrhu, {items.length - nChoice} za ročno reševanje in pregled)
          </p>

          <label style={labelStyle}>
            <input type="radio" checked={!perStudent} onChange={() => setPerStudent(false)} style={{ marginTop: '3px' }} />
            <span>Enak list za vse<span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)' }}>Ena stran; učenec vpiše ime. Brez QR kode.</span></span>
          </label>
          <label style={labelStyle}>
            <input type="radio" checked={perStudent} onChange={() => setPerStudent(true)} style={{ marginTop: '3px' }} />
            <span>Poseben list za vsakega učenca<span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)' }}>Ime in priimek, QR koda in obrazec za vsakega; en PDF za tisk.</span></span>
          </label>

          {perStudent && (
            <div style={{ margin: '0 0 12px 26px' }}>
              <select value={classId} onChange={e => setPickedClass(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--hairline)', background: 'var(--canvas)', color: 'var(--ink)', fontSize: '13px', marginBottom: '6px' }}>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.school ? ` · ${c.school}` : ''}</option>)}
              </select>
              <div style={{ fontSize: '12px', color: students.length ? 'var(--muted)' : '#b7791f', marginBottom: '8px' }}>
                {!cls ? 'Dodaj razred v meniju Učenci.' : students.length ? `${students.length} učencev` : 'Ta razred nima učencev.'}
              </div>
              <label style={{ ...labelStyle, marginBottom: 0 }}>
                <input type="checkbox" checked={shuffle} onChange={e => setShuffle(e.target.checked)} style={{ marginTop: '3px' }} />
                <span>Vsak učenec drugačen vrstni red<span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)' }}>Premešajo se vprašanja in možnosti; črke v obrazcu ustrezajo premešanemu listu.</span></span>
              </label>
            </div>
          )}

          {error && <p style={{ fontSize: '13px', color: '#c0392b', margin: '8px 0 0' }}>{error}</p>}
          {printed && (
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginTop: '14px', padding: '12px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', background: 'var(--surface)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={printed.scanQr} alt="" style={{ width: '110px', height: '110px', flex: 'none' }} />
              <div style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5 }}>
                <b>Skeniranje:</b> s telefonom odpri to kodo (Učni načrt → Kvizi → Skener), prijavi se z istim računom in skeniraj okvirje z odgovori.
                <div style={{ marginTop: '6px' }}><Link href={`/kvizi/seja/${printed.sessionId}`} style={{ color: 'var(--forest)', fontWeight: 600 }}>Rezultati tega tiska →</Link></div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
            <button onClick={onClose} style={{ fontSize: '13px', padding: '9px 16px', borderRadius: 'var(--r-sm)', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--ink)', cursor: 'pointer' }}>Prekliči</button>
            <button onClick={() => void print()} disabled={!canPrint}
              style={{ fontSize: '13px', fontWeight: 600, padding: '9px 18px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--forest)', color: '#fff', cursor: canPrint ? 'pointer' : 'not-allowed', opacity: canPrint ? 1 : 0.5 }}>
              {busy ? 'Pripravljam …' : `🖨 Natisni${perStudent && students.length ? ` (${students.length} listov)` : ''}`}
            </button>
          </div>
        </div>
      </div>

      {sheets && createPortal(
        <div className="print-questions pqz" aria-hidden>
          {sheets.map(sh => (
            <QuizSheet key={sh.key} sheet={sh} title={title} className={cls?.name} />
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** En natisnjen list (glava, okvir z odgovori, vprašanja). */
export function QuizSheet({ sheet: sh, title, className }: { sheet: Sheet; title: string; className?: string }) {
  const cls = className ? { name: className } : null;
  return (
    <section className="pqz-sheet">
      <header className="pqz-head">
        <b className="pqz-title">{title}</b>
        <span className="pqz-name">{sh.name ?? 'Ime in priimek: ______________________'}</span>
        <span className="pqz-meta">{sh.name ? (cls ? `${cls.name} · ` : '') : 'Razred: ______ · '}{todayLabel()}</span>
      </header>

      {(sh.layout.choice.length > 0 || sh.qr) && (() => {
        const g = frameGeometry(sh.layout, !!sh.qr);
        const mm = (v: number) => `${v}mm`;
        return (
          <div className="pqz-grid" style={{ width: mm(g.w), height: mm(g.h) }}>
            {g.marks.map(([x, y], i) => <i key={i} className="pqz-mark" style={{ left: mm(x - 2), top: mm(y - 2) }} />)}
            {g.cells.map(c => (
              <div key={c.n}>
                <span className="pqz-n" style={{ left: mm(c.x), top: mm(c.y), width: mm(6), height: mm(6.8) }}>{c.n}{c.multi ? '+' : ''}</span>
                {c.bubbles.map(b => (
                  <span key={b.letter} className="pqz-bub" style={{ left: mm(b.cx - g.bub / 2), top: mm(b.cy - g.bub / 2), width: mm(g.bub), height: mm(g.bub) }}>{b.letter}</span>
                ))}
              </div>
            ))}
            {g.qr && sh.qr && <img className="pqz-qr" src={sh.qr} alt="" style={{ left: mm(g.qr.x), top: mm(g.qr.y), width: mm(g.qr.size), height: mm(g.qr.size) }} />}
          </div>
        );
      })()}

      {(['choice', 'free'] as const).map(g => sh.layout[g].length > 0 && (
        <ol className={`pqz-list${g === 'choice' ? ' pqz-cols2' : ''}`} key={g} style={{ listStyle: 'none', padding: 0 }}>
          {sh.layout[g].map(c => {
            const inline = c.item.choice && c.options.length > 0 && c.options.every(o => o.text.length <= 18) && c.options.reduce((n, o) => n + o.text.length, 0) <= 56;
            return (
              <li className={`pqz-item${g === 'choice' ? ' pqz-c' : ''}`} key={c.n}>
                <div className="pqz-q"><b>{c.n}.</b><Rich html={c.item.html} /></div>
                {c.item.choice
                  ? <div className={inline ? 'pqz-opts pqz-inline' : 'pqz-opts'}>{c.options.map(o => <div key={o.letter}><b>{o.letter})</b> {o.text}</div>)}</div>
                  : <div className="pqz-free" style={{ height: `${c.item.space}mm` }} />}
              </li>
            );
          })}
        </ol>
      ))}
    </section>
  );
}
