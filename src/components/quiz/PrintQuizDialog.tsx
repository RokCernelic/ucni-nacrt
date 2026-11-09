'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import QRCode from 'qrcode';
import { useMasterClasses } from '@/hooks/useMasterClasses';
import { useRoster } from '@/hooks/useRoster';
import { Rich } from '@/components/tasks/ui';
import { layoutSheet, sheetToken, sheetSeed, frameGeometry, type PrintItem, type SheetLayout } from '@/lib/quiz/printSheet';
import { createPaperSession } from '@/lib/quiz/paperSession';
import Link from 'next/link';
import { setPrintTitle } from '@/lib/printTitle';
import { PAGE_NUMBER_BOX } from '@/lib/printPage';
import { sortByLastName } from '@/lib/names';

export interface Sheet { key: string; name: string | null; qr: string | null; layout: SheetLayout }

const todayLabel = () => new Date().toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric' });

/**
 * Možnosti in gumb za tisk kviza: enak list za vse (črta za ime) ali svoj test za vsakega učenca (ime, QR, skener);
 * premešanje vprašanj in/ali odgovorov. Uporabljata ga okno »Zaženi kviz« (način Natisnjeno) in samostojno okno za tisk.
 */
export function PrintPanel({ items, title, quizId, cls, students, classPicker, onCancel }: {
  items: PrintItem[]; title: string; quizId: string | null;
  cls?: { id: string; name: string }; students: { id: string; name: string; pin?: string }[];
  classPicker?: React.ReactNode; onCancel: () => void;
}) {
  const [perStudent, setPerStudent] = useState(true);
  const [shuffleQ, setShuffleQ] = useState(true);
  const [shuffleO, setShuffleO] = useState(true);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** po tisku po učencih: seja za skener in rezultate */
  const [printed, setPrinted] = useState<{ sessionId: string; scanQr: string } | null>(null);
  const [preview, setPreview] = useState<{ sheets: Sheet[]; idx: number } | null>(null);

  const nChoice = items.filter(i => i.choice).length;
  const canPrint = items.length > 0 && !busy && (!perStudent || students.length > 0);

  /** Listi za tisk ali predogled: po učencih (QR + premešanje po soli seje) ali en enak list. */
  const makeSheets = async (sessionId?: string, salt?: string): Promise<Sheet[]> => {
    if (perStudent && sessionId && salt) {
      return Promise.all(students.map(async st => ({
        key: st.id, name: st.name,
        qr: await QRCode.toDataURL(sheetToken(sessionId, st.id), { margin: 0, width: 240, errorCorrectionLevel: 'M' }),
        layout: layoutSheet(items, shuffleQ || shuffleO ? sheetSeed(salt, st.id) : null, { questions: shuffleQ, options: shuffleO }),
      })));
    }
    return [{ key: 'all', name: null, qr: null, layout: layoutSheet(items, shuffleO ? crypto.randomUUID() : null, { questions: false, options: shuffleO }) }];
  };

  const openPreview = async () => {
    setBusy(true); setError(null);
    try {
      // brez seje v bazi: vzorčna QR koda in naključno premešanje (natisnjen list bo premešan drugače)
      const list = perStudent ? await makeSheets('00000000-0000-0000-0000-000000000000', Math.random().toString(36).slice(2, 10)) : await makeSheets();
      setPreview({ sheets: list, idx: 0 });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const print = async () => {
    setBusy(true); setError(null);
    try {
      let list: Sheet[];
      if (perStudent) {
        if (!cls) return;
        // seja za skeniranje (odgovori gredo v skupno statistiko kvizov)
        const session = await createPaperSession({ title, quizId, classId: cls.id, className: cls.name, students, items, shuffleQuestions: shuffleQ, shuffleOptions: shuffleO });
        list = await makeSheets(session.id, session.paper!.salt);
        setPrinted({ sessionId: session.id, scanQr: await QRCode.toDataURL(`${window.location.origin}/kvizi/skener`, { margin: 1, width: 220 }) });
      } else {
        list = await makeSheets();
      }
      const style = document.createElement('style');
      // odmik zgoraj/spodaj tudi na nadaljnjih straneh; številčenje strani le pri skupnem listu
      // (pri listih po učencih bi se štetje nadaljevalo čez vse učence — to bi motilo)
      style.textContent = perStudent
        ? '@page { size: A4 portrait; margin: 10mm 0; }'
        : `@page { size: A4 portrait; margin: 10mm 0 15mm; ${PAGE_NUMBER_BOX} }`;
      document.head.appendChild(style);
      const root = document.documentElement;
      const restoreTitle = setPrintTitle(title);
      const done = () => { root.classList.remove('printing-questions'); setSheets(null); style.remove(); restoreTitle(); window.removeEventListener('afterprint', done); };
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
      <label style={labelStyle}>
            <input type="radio" checked={!perStudent} onChange={() => setPerStudent(false)} style={{ marginTop: '3px' }} />
            <span>Enak vrstni red za vse<span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)' }}>Na vrhu črta za ime in priimek; isti list za vse. Brez QR kode.</span></span>
          </label>
          {!perStudent && (
            <label style={{ ...labelStyle, margin: '0 0 12px 26px' }}>
              <input type="checkbox" checked={shuffleO} onChange={e => setShuffleO(e.target.checked)} style={{ marginTop: '3px' }} />
              <span>Premešaj odgovore<span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)' }}>Vrstni red možnosti (A, B, C …) se premeša le pri izbirnih nalogah (ne pri drži / ne drži, številskih in odprtih); vsi dobijo isti list.</span></span>
            </label>
          )}
          <label style={labelStyle}>
            <input type="radio" checked={perStudent} onChange={() => setPerStudent(true)} style={{ marginTop: '3px' }} />
            <span>Za vsakega učenca svoj test<span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)' }}>Ime in priimek, QR koda in obrazec za vsakega; en PDF za tisk.</span></span>
          </label>

          {perStudent && (
            <div style={{ margin: '0 0 12px 26px' }}>
              {classPicker}
              <div style={{ fontSize: '12px', color: students.length ? 'var(--muted)' : '#b7791f', marginBottom: '8px' }}>
                {!cls ? 'Izberi razred.' : students.length ? `${students.length} učencev` : 'Ta razred nima učencev.'}
              </div>
              <label style={{ ...labelStyle, marginBottom: '8px' }}>
                <input type="checkbox" checked={shuffleQ} onChange={e => setShuffleQ(e.target.checked)} style={{ marginTop: '3px' }} />
                <span>Premešaj vprašanja<span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)' }}>Vsak učenec ima drugačen vrstni red vprašanj.</span></span>
              </label>
              <label style={{ ...labelStyle, marginBottom: 0 }}>
                <input type="checkbox" checked={shuffleO} onChange={e => setShuffleO(e.target.checked)} style={{ marginTop: '3px' }} />
                <span>Premešaj odgovore<span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)' }}>Vsak učenec ima drugačen vrstni red možnosti, a le pri izbirnih nalogah (ne pri drži / ne drži, številskih in odprtih); črke v obrazcu ustrezajo njegovemu listu.</span></span>
              </label>
            </div>
          )}

          {error && <p style={{ fontSize: '13px', color: '#c0392b', margin: '8px 0 0' }}>{error}</p>}
          {printed && (
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginTop: '14px', padding: '12px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', background: 'var(--surface)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={printed.scanQr} alt="" style={{ width: '110px', height: '110px', flex: 'none' }} />
              <div style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5 }}>
                <b>Skeniranje:</b> s telefonom odpri to kodo (Učni načrt → Kvizi → Skener), prijavi se z istim računom in skeniraj okvirje z odgovori. Isti list lahko skeniraš večkrat (velja zadnje skeniranje). Seja je med aktivnimi, dokler je ne končaš — potem skeniranje ni več mogoče.
                <div style={{ marginTop: '6px' }}><Link href={`/kvizi/seja/${printed.sessionId}`} style={{ color: 'var(--forest)', fontWeight: 600 }}>Rezultati tega tiska →</Link></div>
              </div>
            </div>
          )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
        <button onClick={onCancel} style={{ fontSize: '13px', padding: '9px 16px', borderRadius: 'var(--r-sm)', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--ink)', cursor: 'pointer' }}>Prekliči</button>
        <button onClick={() => void openPreview()} disabled={!canPrint}
          title="Prikaže, kako bo list videti na papirju (brez tiskanja in brez ustvarjanja seje)"
          style={{ fontSize: '13px', padding: '9px 16px', borderRadius: 'var(--r-sm)', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--forest)', cursor: canPrint ? 'pointer' : 'not-allowed', opacity: canPrint ? 1 : 0.5 }}>
          👁 Predogled
        </button>
        <button onClick={() => void print()} disabled={!canPrint}
          style={{ fontSize: '13px', fontWeight: 600, padding: '9px 18px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--forest)', color: '#fff', cursor: canPrint ? 'pointer' : 'not-allowed', opacity: canPrint ? 1 : 0.5 }}>
          {busy ? 'Pripravljam …' : `🖨 Natisni${perStudent && students.length ? ` (${students.length} listov)` : ''}`}
        </button>
      </div>

      {preview && createPortal(
        <div className="no-print" onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(20,30,25,0.6)', display: 'flex', flexDirection: 'column' }}>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: 'var(--canvas)', fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)' }}>
            <b>Predogled</b>
            {preview.sheets.length > 1 && (
              <>
                <button disabled={preview.idx === 0} onClick={() => setPreview(p => p && { ...p, idx: p.idx - 1 })} style={{ padding: '4px 10px', cursor: 'pointer' }}>‹</button>
                <span>{preview.sheets[preview.idx].name} ({preview.idx + 1} / {preview.sheets.length})</span>
                <button disabled={preview.idx === preview.sheets.length - 1} onClick={() => setPreview(p => p && { ...p, idx: p.idx + 1 })} style={{ padding: '4px 10px', cursor: 'pointer' }}>›</button>
              </>
            )}
            <span style={{ flex: 1, color: 'var(--muted)', fontSize: '12px' }}>
              {perStudent ? 'QR koda je vzorčna; premešanje je naključno — natisnjen list bo premešan drugače.' : shuffleO ? 'Premešanje je naključno — natisnjen list bo premešan drugače.' : ''}
            </span>
            <button onClick={() => { setPreview(null); void print(); }} style={{ fontSize: '13px', fontWeight: 600, padding: '7px 14px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--forest)', color: '#fff', cursor: 'pointer' }}>🖨 Natisni</button>
            <button onClick={() => setPreview(null)} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--hairline)', background: 'transparent', cursor: 'pointer' }}>Zapri</button>
          </div>
          <div onClick={e => e.stopPropagation()} style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            <div className="pqz-preview" style={{ width: 'fit-content', margin: '0 auto' }}>
              <QuizSheet sheet={preview.sheets[preview.idx]} title={title} className={cls?.name} />
            </div>
          </div>
        </div>,
        document.body,
      )}

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

/** Samostojno okno za tisk kviza (npr. iz izbranih nalog): izbira razreda + PrintPanel. */
export default function PrintQuizDialog({ items, title, quizId, defaultClassId, onClose }: {
  items: PrintItem[]; title: string; quizId: string | null; defaultClassId?: string; onClose: () => void;
}) {
  const { classes } = useMasterClasses();
  const [pickedClass, setPickedClass] = useState('');
  const classId = pickedClass || (classes.some(c => c.id === defaultClassId) ? defaultClassId! : classes[0]?.id ?? '');
  const { students: roster } = useRoster(classId || undefined);
  const students = useMemo(() => sortByLastName(roster), [roster]);
  const cls = classes.find(c => c.id === classId);
  const nChoice = items.filter(i => i.choice).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div onClick={e => { e.stopPropagation(); onClose(); }} className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(20,30,25,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Natisni kviz"
        style={{ background: 'var(--canvas)', borderRadius: 'var(--r-lg)', padding: '24px 26px', width: '100%', maxWidth: '520px', fontFamily: 'var(--font-sans)' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '26px', fontWeight: 400, margin: '0 0 4px', color: 'var(--ink)' }}>Natisni kviz</h2>
        <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 16px' }}>
          {title} · {items.length} vprašanj ({nChoice} izbirnih v obrazcu na vrhu, {items.length - nChoice} za ročno reševanje in pregled)
        </p>
        <PrintPanel items={items} title={title} quizId={quizId} cls={cls} students={students} onCancel={onClose}
          classPicker={
            <select value={classId} onChange={e => setPickedClass(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--hairline)', background: 'var(--canvas)', color: 'var(--ink)', fontSize: '13px', marginBottom: '6px' }}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.school ? ` · ${c.school}` : ''}</option>)}
            </select>
          } />
      </div>
    </div>
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
