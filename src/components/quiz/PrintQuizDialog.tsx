'use client';

import { useEffect, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import QRCode from 'qrcode';
import { useMasterClasses } from '@/hooks/useMasterClasses';
import { useRoster } from '@/hooks/useRoster';
import { Rich } from '@/components/tasks/ui';
import { layoutSheet, sheetToken, type PrintItem } from '@/lib/quiz/printSheet';

interface Sheet { key: string; name: string | null; qr: string | null; layout: ReturnType<typeof layoutSheet> }

const todayLabel = () => new Date().toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric' });

/** Tiskanje kviza na A4: odgovorni obrazec (krogci) zgoraj, vprašanja pod njim; po želji list za vsakega učenca (ime, QR, drugačen vrstni red). */
export default function PrintQuizDialog({ items, title, jobId, defaultClassId, onClose }: {
  items: PrintItem[]; title: string; jobId: string; defaultClassId?: string; onClose: () => void;
}) {
  const { classes } = useMasterClasses();
  const [pickedClass, setPickedClass] = useState('');
  const [perStudent, setPerStudent] = useState(true);
  const [shuffle, setShuffle] = useState(true);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    try {
      const salt = Math.random().toString(36).slice(2, 8);
      let list: Sheet[];
      if (perStudent) {
        list = await Promise.all(students.map(async s => {
          const seed = shuffle ? `${salt}${s.id}` : '';
          const token = sheetToken(jobId, s.id, shuffle ? salt + s.id : '-');
          return { key: s.id, name: s.name, qr: await QRCode.toDataURL(token, { margin: 0, width: 220, errorCorrectionLevel: 'M' }), layout: layoutSheet(items, seed || null) };
        }));
      } else {
        list = [{ key: 'all', name: null, qr: null, layout: layoutSheet(items, null) }];
      }
      const style = document.createElement('style');
      style.textContent = '@page { size: A4 portrait; margin: 0; }';
      document.head.appendChild(style);
      const root = document.documentElement;
      const done = () => { root.classList.remove('printing-questions'); setSheets(null); style.remove(); window.removeEventListener('afterprint', done); };
      flushSync(() => setSheets(list));
      root.classList.add('printing-questions');
      window.addEventListener('afterprint', done);
      window.print();
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
            <section className="pqz-sheet" key={sh.key}>
              <i className="pqz-mark" style={{ left: '7mm', top: '7mm' }} /><i className="pqz-mark" style={{ right: '7mm', top: '7mm' }} />
              <i className="pqz-mark" style={{ left: '7mm', bottom: '7mm' }} /><i className="pqz-mark" style={{ right: '7mm', bottom: '7mm' }} />
              <header className="pqz-head">
                <div className="pqz-who">
                  <div className="pqz-title">{title}</div>
                  <div className="pqz-name">{sh.name ?? 'Ime in priimek: ____________________________'}</div>
                  <div className="pqz-meta">{cls && sh.name ? `${cls.name} · ` : sh.name ? '' : 'Razred: ________ · '}{todayLabel()}</div>
                </div>
                {sh.qr && <img className="pqz-qr" src={sh.qr} alt="" />}
              </header>

              {sh.layout.choice.length > 0 && (
                <div className="pqz-grid">
                  <div className="pqz-gridhead">Odgovori — pobarvaj krogec{sh.layout.choice.some(c => c.item.multi) ? ' (pri nekaterih je pravilnih več)' : ''}</div>
                  <div className="pqz-rows" style={{ columnCount: sh.layout.choice.length > 20 ? 3 : sh.layout.choice.length > 8 ? 2 : 1 }}>
                    {sh.layout.choice.map(c => (
                      <div className="pqz-row" key={c.n}>
                        <span className="pqz-n">{c.n}</span>
                        {c.options.map(o => <span className="pqz-bub" key={o.letter}>{o.letter}</span>)}
                        {c.item.multi && <span className="pqz-multi">več</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <ol className="pqz-list" style={{ listStyle: 'none', padding: 0 }}>
                {[...sh.layout.choice, ...sh.layout.free].map(c => (
                  <li className="pqz-item" key={c.n}>
                    <div className="pqz-q"><b>{c.n}.</b><Rich html={c.item.html} /></div>
                    {c.item.choice
                      ? <div className="pqz-opts">{c.options.map(o => <div key={o.letter}><b>{o.letter})</b> {o.text}</div>)}</div>
                      : <div className="pqz-free" style={{ height: `${c.item.space}mm` }} />}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
