'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import QRCode from 'qrcode';
import { useMasterClasses } from '@/hooks/useMasterClasses';
import { useRoster } from '@/hooks/useRoster';
import { SheetHead, FrameView, ItemBody, type Sheet } from './QuizSheetParts';
import { HalvesPages, useHalvesPlan, findOrder, type HalvesPlan } from './HalvesSheet';
import SolutionsPage from './SolutionsPage';
import { layoutSheet, sheetToken, sheetSeed, frameGeometry, hasSolutionText, type PrintItem, type SheetLayout } from '@/lib/quiz/printSheet';
import { createPaperSession } from '@/lib/quiz/paperSession';
import Link from 'next/link';
import { setPrintTitle } from '@/lib/printTitle';
import { PAGE_NUMBER_BOX } from '@/lib/printPage';
import { sortByLastName } from '@/lib/names';

export type { Sheet };

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
  const [preview, setPreview] = useState<{ sheets: Sheet[]; idx: number; halves?: boolean } | null>(null);
  /** dva testa na en list A4 (zgoraj / spodaj) */
  const [halves, setHalves] = useState(false);
  /** stran z rešitvami (za učitelja) kot zadnja stran natisa — če rešitve obstajajo */
  const hasSolutions = useMemo(() => items.some(hasSolutionText), [items]);
  const [withSolutions, setWithSolutions] = useState(true);
  const [solItems, setSolItems] = useState<PrintItem[] | null>(null);
  /** izbor vprašanj, s katerim se je natisnilo dva testa na list (za izris strani) */
  const [printPlan, setPrintPlan] = useState<HalvesPlan | null>(null);
  /** vprašanja se mešajo le pri listih po učencih; pri enakem listu je vrstni red vprašanj vedno izviren */
  const qShuffle = perStudent && shuffleQ;
  const hp = useHalvesPlan(items, halves, perStudent, title);
  /** vprašanja, ki se prilegajo (pri dveh testih na list se preostala odrežejo za vse učence enako) */
  const effItems = useMemo(() => (halves && hp.plan ? items.filter(i => hp.plan!.keptIds.has(i.id)) : items), [halves, hp.plan, items]);

  const nChoice = items.filter(i => i.choice).length;
  const canPrint = items.length > 0 && !busy && (!perStudent || students.length > 0) && (!halves || (!!hp.plan && effItems.length > 0));

  /** Listi za tisk: po učencih (QR + premešanje po soli seje) ali en enak list. */
  const buildSheets = async (listItems: PrintItem[], sessionId?: string, salt?: string, eqSeed?: string, orders?: Record<string, string[]>): Promise<Sheet[]> => {
    if (perStudent && sessionId && salt) {
      return Promise.all(students.map(async st => ({
        key: st.id, name: st.name,
        qr: await QRCode.toDataURL(sheetToken(sessionId, st.id), { margin: 0, width: 240, errorCorrectionLevel: 'M' }),
        // izrecen vrstni red (dva testa na list): številčenje gre po vrsti v bralnem redu; odgovori se po želji premešajo
        layout: orders?.[st.id]
          ? layoutSheet(listItems, shuffleO ? sheetSeed(salt, st.id) : null, { questions: false, options: shuffleO, order: orders[st.id] })
          : layoutSheet(listItems, qShuffle || shuffleO ? sheetSeed(salt, st.id) : null, { questions: qShuffle, options: shuffleO }),
      })));
    }
    return [{ key: 'all', name: null, qr: null, layout: layoutSheet(listItems, shuffleO ? (eqSeed ?? crypto.randomUUID()) : null, { questions: false, options: shuffleO, order: orders?.all }) }];
  };

  /** Vrstni red vprašanj za dva testa na list: številke po vrsti v bralnem redu, pri mešanju vprašanj drugačen za vsakega učenca. */
  const halvesOrder = (plan: HalvesPlan, forItems: PrintItem[], key: string | null, withQr: boolean): string[] => {
    const o = findOrder(forItems, plan.m, withQr, key);
    if (!o) throw new Error('Vprašanj ni mogoče razporediti na polovici lista — zmanjšaj število nalog.');
    return o;
  };

  /** Predogled: en list (ne cel razred) z vzorčnim imenom, datumom in QR kodo; pri dveh testih na list dva vzorčna testa. */
  const openPreview = async () => {
    setBusy(true); setError(null);
    try {
      // pri dveh testih na list vzorca uporabljata seme iz izračuna prileganja, zato se zagotovo prilegata
      const mk = async (key: string, seed: string): Promise<Sheet> => ({
        key, name: 'IME IN PRIIMEK',
        qr: await QRCode.toDataURL(sheetToken('00000000-0000-0000-0000-000000000000', key), { margin: 0, width: 240, errorCorrectionLevel: 'M' }),
        layout: halves && hp.plan
          ? layoutSheet(effItems, shuffleO ? seed : null, { questions: false, options: shuffleO, order: halvesOrder(hp.plan, effItems, qShuffle ? seed : null, true) })
          : layoutSheet(effItems, qShuffle || shuffleO ? seed : null, { questions: qShuffle, options: shuffleO }),
      });
      const rnd = () => Math.random().toString(36).slice(2, 10);
      if (halves) {
        setPreview({ sheets: perStudent ? [await mk('predogled-1', 'predogled0'), await mk('predogled-2', 'predogled1')] : await buildSheets(effItems, undefined, undefined, 'predogled0', { all: halvesOrder(hp.plan!, effItems, null, false) }), idx: 0, halves: true });
      } else {
        setPreview({ sheets: [perStudent ? await mk('predogled', rnd()) : (await buildSheets(effItems))[0]], idx: 0 });
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const print = async () => {
    setBusy(true); setError(null);
    try {
      const salt = Math.random().toString(36).slice(2, 10);
      const eqSeed = crypto.randomUUID();
      let printItems = items;
      let exact: HalvesPlan | null = null;
      if (halves) {
        // izbor vprašanj je skupen vsem učencem (enako težki testi); vsak list ima svojo razporeditev po stolpcih
        exact = hp.plan;
        if (!exact) throw new Error('Meritev vprašanj še ni pripravljena — poskusi znova.');
        printItems = items.filter(i => exact!.keptIds.has(i.id));
        if (!printItems.length) throw new Error('Nobeno vprašanje se ne prilega na polovico lista.');
      }
      let list: Sheet[];
      if (perStudent) {
        if (!cls) return;
        // dva testa na list: vrstni red vprašanj po učencih (številke po vrsti); shranjen v seji za skener in točkovanje
        const orders = exact ? Object.fromEntries(students.map(st => [st.id, halvesOrder(exact!, printItems, qShuffle ? sheetSeed(salt, st.id) : null, true)])) : undefined;
        // seja za skeniranje (odgovori gredo v skupno statistiko kvizov)
        const session = await createPaperSession({ title, quizId, classId: cls.id, className: cls.name, students, items: printItems, shuffleQuestions: qShuffle, shuffleOptions: shuffleO, salt, orders });
        list = await buildSheets(printItems, session.id, session.paper!.salt, undefined, orders);
        setPrinted({ sessionId: session.id, scanQr: await QRCode.toDataURL(`${window.location.origin}/kvizi/skener`, { margin: 1, width: 220 }) });
      } else {
        list = await buildSheets(printItems, undefined, undefined, eqSeed, exact ? { all: halvesOrder(exact, printItems, null, false) } : undefined);
      }
      const style = document.createElement('style');
      // odmik zgoraj/spodaj tudi na nadaljnjih straneh; številčenje strani le pri skupnem listu
      // (pri listih po učencih bi se štetje nadaljevalo čez vse učence — to bi motilo)
      style.textContent = halves
        ? '@page { size: A4 portrait; margin: 0; }'
        : perStudent
        ? '@page { size: A4 portrait; margin: 10mm 0; }'
        : `@page { size: A4 portrait; margin: 10mm 0 15mm; ${PAGE_NUMBER_BOX} }`;
      document.head.appendChild(style);
      const root = document.documentElement;
      const restoreTitle = setPrintTitle(title);
      const done = () => { root.classList.remove('printing-questions'); setSheets(null); setPrintPlan(null); setSolItems(null); style.remove(); restoreTitle(); window.removeEventListener('afterprint', done); };
      flushSync(() => { setPrintPlan(exact); setSolItems(withSolutions && hasSolutions ? printItems : null); setSheets(list); });
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

          {hasSolutions && (
        <label style={{ ...labelStyle, margin: '14px 0 4px' }}>
          <input type="checkbox" checked={withSolutions} onChange={e => setWithSolutions(e.target.checked)} style={{ marginTop: '3px' }} />
          <span>Dodaj stran z rešitvami (za učitelja)
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)' }}>Zadnja stran natisa: pravilni odgovori in rešitve iz baze nalog. Natisne se enkrat, ne za vsakega učenca.</span>
          </span>
        </label>
      )}
      <label style={{ ...labelStyle, margin: '14px 0 4px' }}>
        <input type="checkbox" checked={halves} onChange={e => setHalves(e.target.checked)} style={{ marginTop: '3px' }} />
        <span>Dva testa na en list A4 (privarčuj papir)
          <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)' }}>
            {perStudent ? 'Zgoraj en učenec, spodaj drugi; črtkana ločnica po sredini. ' : 'Isti test zgoraj in spodaj; črtkana ločnica po sredini. '}
            Test je lahko dolg največ dve polovici (spredaj in zadaj, dvostransko tiskanje); vprašanja, ki se ne prilegajo, se odrežejo.
          </span>
        </span>
      </label>
      {halves && (
        <div style={{ margin: '0 0 8px 26px', fontSize: '12px', fontWeight: 600, color: !hp.plan ? 'var(--muted)' : hp.plan.droppedItems.length ? '#b7791f' : 'var(--green-ok)' }}>
          {!hp.plan ? 'Merim …'
            : hp.plan.droppedItems.length === 0 ? `✓ Prilegajo se vsa vprašanja (${hp.plan.total}).`
            : `⚠ Prilega se ${hp.plan.kept} od ${hp.plan.total} vprašanj. Odrezano za vse učence enako: ${hp.plan.droppedItems.map(d => `»${d.prompt.replace(/\s+/g, ' ').slice(0, 40)}${d.prompt.length > 40 ? '…' : ''}«`).join(', ')}. Zmanjšaj število nalog ali jih odstrani sam.`}
        </div>
      )}
      {hp.node}

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
            <span style={{ flex: 1, color: 'var(--muted)', fontSize: '12px' }}>
              {preview.halves && hp.plan ? (
                <>
                  <b style={{ color: hp.plan.droppedItems.length ? '#b7791f' : 'var(--green-ok)' }}>
                    {hp.plan.droppedItems.length ? `Prilega se ${hp.plan.kept} od ${hp.plan.total} vprašanj — odrezanih: ${hp.plan.droppedItems.length}` : `Prilegajo se vsa vprašanja (${hp.plan.total})`}
                  </b>
                  {' · levo sprednja, desno hrbtna stran (zgoraj en test, spodaj drug).'}
                </>
              ) : perStudent ? 'Vzorčen list (ime, datum in QR koda so primer); premešanje je naključno — vsak natisnjen list bo premešan drugače.' : shuffleO ? 'Premešanje je naključno — natisnjen list bo premešan drugače.' : ''}
            </span>
            <button onClick={() => { setPreview(null); void print(); }} style={{ fontSize: '13px', fontWeight: 600, padding: '7px 14px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--forest)', color: '#fff', cursor: 'pointer' }}>🖨 Natisni</button>
            <button onClick={() => setPreview(null)} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--hairline)', background: 'transparent', cursor: 'pointer' }}>Zapri</button>
          </div>
          <div onClick={e => e.stopPropagation()} style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            {preview.halves && hp.plan ? (
              <div className="pqz-preview" style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap', zoom: 0.6 }}>
                <HalvesPages sheets={preview.sheets} plan={hp.plan} title={title} placeholder duplicate={!perStudent} />
              </div>
            ) : (
              <div className="pqz-preview" style={{ width: 'fit-content', margin: '0 auto' }}>
                <QuizSheet sheet={preview.sheets[preview.idx]} title={title} placeholder />
              </div>
            )}
            {withSolutions && hasSolutions && (
              <div className="pqz-preview" style={{ width: 'fit-content', margin: '0 auto' }}>
                <SolutionsPage items={effItems} title={title} />
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {sheets && createPortal(
        <div className="print-questions pqz" aria-hidden>
          {printPlan
            ? <HalvesPages sheets={sheets} plan={printPlan} title={title} className={cls?.name} duplicate={!perStudent} />
            : sheets.map(sh => <QuizSheet key={sh.key} sheet={sh} title={title} className={cls?.name} />)}
          {solItems && <SolutionsPage items={solItems} title={title} halves={!!printPlan} />}
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
export function QuizSheet({ sheet: sh, title, className, placeholder }: { sheet: Sheet; title: string; className?: string; placeholder?: boolean }) {
  return (
    <section className="pqz-sheet">
      <SheetHead sheet={sh} title={title} className={className} placeholder={placeholder} />
      <FrameView sheet={sh} />
      {(['choice', 'free'] as const).map(g => sh.layout[g].length > 0 && (
        <ol className={`pqz-list${g === 'choice' ? ' pqz-cols2' : ''}`} key={g} style={{ listStyle: 'none', padding: 0 }}>
          {sh.layout[g].map(c => (
            <li className={`pqz-item${g === 'choice' ? ' pqz-c' : ''}`} key={c.n}><ItemBody c={c} /></li>
          ))}
        </ol>
      ))}
    </section>
  );
}
