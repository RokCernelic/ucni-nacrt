'use client';

import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Predmet, Standard } from '@/types/curriculum';
import { useHours } from '@/hooks/useHours';
import { useEnotaOrder } from '@/hooks/useEnotaOrder';
import { useChapterOrder } from '@/hooks/useChapterOrder';
import { setPrintTitle } from '@/lib/printTitle';

/** Letna priprava (nekdaj LDN): natisljiva tabela tem z urami, cilji, standardi in novimi pojmi za izbran razred. */

const LS_FIELDS = 'un-ldn-fields';
/** Pri šoli in učitelju si zapomnimo, kar je učitelj vpisal prejšnjič (ostala polja vpiše vsakič sam). */
function readSaved(): { school: string; teacher: string } {
  try { const o = JSON.parse(localStorage.getItem(LS_FIELDS) ?? '{}'); return { school: String(o.school ?? ''), teacher: String(o.teacher ?? '') }; } catch { return { school: '', teacher: '' }; }
}

interface Row { num: string; title: string; hours: number; custom: boolean; pp?: Predmet['poglavja'][number]['podpoglavja'][number] }
interface Chap { num: number; title: string; hours: number; poglavje: Predmet['poglavja'][number]; rows: Row[] }

function Std({ s }: { s: Standard }) {
  const hasBold = s.text.includes('**');
  return (
    <li style={{ fontStyle: s.izbirni ? 'italic' : undefined, fontWeight: s.minimalni && !hasBold ? 600 : undefined }}>
      {hasBold ? s.text.split('**').map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>)) : s.text}
      {s.minimalni && <sup className="ldn-tag"> M</sup>}
      {s.izbirni && <span className="ldn-tag"> (I)</span>}
      {s.shared && <span className="ldn-tag"> (S)</span>}
    </li>
  );
}

function Ldn({ predmet, classId, razredFilter, school, classLabel, target, onClose }: {
  predmet: Predmet; classId: string; razredFilter: number | null; school: string; classLabel: string; target?: number; onClose: () => void;
}) {
  const { getHours } = useHours(`ucni-nacrt-hours-${classId}`);
  const { resolve } = useEnotaOrder(`ucni-nacrt-enote-order-${classId}`);
  const { resolveOrder } = useChapterOrder(`ucni-nacrt-chapter-order-${classId}`);

  // vsa polja na naslovni strani izpolni učitelj sam (prazno = prazna črta za ročni vpis)
  const [saved] = useState(readSaved);
  const [schoolF, setSchoolF] = useState(saved.school);
  const [subjectF, setSubjectF] = useState('');
  const [classF, setClassF] = useState('');
  const [year, setYear] = useState('');
  const [teacher, setTeacher] = useState(saved.teacher);
  const [hoursF, setHoursF] = useState('');
  const [date, setDate] = useState('');
  const [cols, setCols] = useState({ cilji: true, standardi: true, pojmi: true });
  const [busy, setBusy] = useState(false);

  // poglavja izbranega razreda v tvojem vrstnem redu, z izvornimi številkami iz učnega načrta
  const poglavja = razredFilter != null ? predmet.poglavja.filter(p => p.razred === razredFilter) : predmet.poglavja;
  const continuous = predmet.continuousNumbering ?? false;
  const groups: { razred: number; poglavja: typeof poglavja }[] = [];
  poglavja.forEach(p => {
    const r = p.razred ?? 0;
    const last = groups[groups.length - 1];
    if (!last || last.razred !== r) groups.push({ razred: r, poglavja: [p] }); else last.poglavja.push(p);
  });
  const chapterNum = new Map<string, number>();
  groups.forEach(g => g.poglavja.forEach((p, i) => chapterNum.set(p.id, continuous ? predmet.poglavja.indexOf(p) + 1 : i + 1)));

  const chaps: Chap[] = [];
  for (const g of groups) {
    const ids = resolveOrder(`${predmet.id}:${g.razred}`, g.poglavja.map(p => p.id));
    const byId = new Map(g.poglavja.map(p => [p.id, p]));
    for (const id of ids) {
      const p = byId.get(id); if (!p) continue;
      const orig = new Map(p.podpoglavja.map((pp, i) => [pp.id, i + 1]));
      const ppById = new Map(p.podpoglavja.map(pp => [pp.id, pp]));
      const num = chapterNum.get(p.id) ?? 0;
      const rows: Row[] = [];
      for (const it of resolve(`${predmet.id}:${p.id}`, p.podpoglavja.map(pp => pp.id))) {
        if (it.kind === 'curriculum') {
          const pp = ppById.get(it.id); if (!pp) continue;
          const h = getHours(`${predmet.id}:${pp.id}`, pp.privzeteUre ?? 1);
          if (h > 0) rows.push({ num: `${num}.${orig.get(pp.id)}`, title: pp.naslov, hours: h, custom: false, pp });
        } else if (it.hours > 0) {
          rows.push({ num: '', title: it.type, hours: it.hours, custom: true });
        }
      }
      if (rows.length) chaps.push({ num, title: p.naslov, hours: rows.reduce((s, r) => s + r.hours, 0), poglavje: p, rows });
    }
  }
  const total = chaps.reduce((s, c) => s + c.hours, 0);

  const print = () => {
    setBusy(true);
    try { localStorage.setItem(LS_FIELDS, JSON.stringify({ school: schoolF, teacher })); } catch { /* ignore */ }
    const style = document.createElement('style');
    style.textContent = '@page { size: A4 landscape; margin: 10mm; }';
    document.head.appendChild(style);
    const restoreTitle = setPrintTitle(`Letna priprava ${subjectF || predmet.naslov} ${classF || classLabel}`);
    const root = document.documentElement;
    const done = () => { root.classList.remove('printing-questions'); style.remove(); restoreTitle(); setBusy(false); window.removeEventListener('afterprint', done); };
    root.classList.add('printing-questions');
    window.addEventListener('afterprint', done);
    window.print();
  };

  const field: React.CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: '14px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '7px 10px', background: '#fff', width: '100%', boxSizing: 'border-box' };
  const lab: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--muted)', margin: '10px 0 4px' };
  const chk = (k: keyof typeof cols, text: string) => (
    <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', color: 'var(--ink)', cursor: 'pointer' }}>
      <input type="checkbox" checked={cols[k]} onChange={e => setCols(c => ({ ...c, [k]: e.target.checked }))} /> {text}
    </label>
  );

  const fixed: { cls: string; w: string }[] = [{ cls: 'num', w: '10mm' }, { cls: 'tema', w: '42mm' }, { cls: 'ure', w: '11mm' }];

  const sheet = (
    <div className="print-questions ldn" aria-hidden>
      <section className="ldn-cover">
        <h1 className="ldn-h1">Letna priprava</h1>
        <table className="ldn-info">
          <tbody>
            <tr><th>Šola</th><td>{schoolF || '\u00A0'}</td></tr>
            <tr><th>Predmet</th><td>{subjectF || '\u00A0'}</td></tr>
            <tr><th>Razred</th><td>{classF || '\u00A0'}</td></tr>
            <tr><th>Šolsko leto</th><td>{year || '\u00A0'}</td></tr>
            <tr><th>Učitelj(ica)</th><td>{teacher || '\u00A0'}</td></tr>
            <tr><th>Število ur</th><td>{hoursF || '\u00A0'}</td></tr>
            <tr><th>Datum</th><td>{date || '\u00A0'}</td></tr>
          </tbody>
        </table>
        <div className="ldn-sign">
          <div><div className="ldn-line" />Podpis učitelja(ice)</div>
          <div><div className="ldn-line" />Podpis ravnatelja(ice)</div>
        </div>
      </section>

      <table className="ldn-table">
        <colgroup>
          {fixed.map(c => <col key={c.cls} style={{ width: c.w }} />)}
          {cols.cilji && <col style={{ width: cols.standardi ? '58mm' : undefined }} />}
          {cols.standardi && <col />}
        </colgroup>
        <thead>
          <tr>
            <th>Št.</th><th>Učna tema</th><th>Ure</th>
            {cols.cilji && <th>Cilji</th>}
            {cols.standardi && <th>Standardi znanja</th>}
          </tr>
        </thead>
        {chaps.map(c => (
          <tbody key={c.poglavje.id}>
            <tr className="ldn-chap">
              <td>{c.num}</td>
              <td>{c.title}{cols.pojmi && c.poglavje.noviPojmi?.length ? <div className="ldn-pojmi"><b>Novi pojmi:</b> {c.poglavje.noviPojmi.join(', ')}</div> : null}</td>
              <td>{c.hours}</td>
              {cols.cilji && <td />}
              {cols.standardi && <td>{c.poglavje.standardi?.length ? <ul>{c.poglavje.standardi.map(s => <Std key={s.id} s={s} />)}</ul> : null}</td>}
            </tr>
            {c.rows.map((r, i) => (
              <tr key={i} className={r.custom ? 'ldn-custom' : undefined}>
                <td>{r.num}</td>
                <td>{r.title}{r.pp?.izbirna ? <span className="ldn-tag"> (izbirna)</span> : null}
                  {cols.pojmi && r.pp?.noviPojmi?.length ? <div className="ldn-pojmi"><b>Novi pojmi:</b> {r.pp.noviPojmi.join(', ')}</div> : null}</td>
                <td>{r.hours}</td>
                {cols.cilji && <td>{r.pp ? <ul>{r.pp.cilji.map(ci => <li key={ci.id}>{ci.text}{ci.tip === 'I' && <span className="ldn-tag"> (I)</span>}</li>)}</ul> : null}</td>}
                {cols.standardi && <td>{r.pp ? <ul>{r.pp.standardi.map(s => <Std key={s.id} s={s} />)}</ul> : null}</td>}
              </tr>
            ))}
          </tbody>
        ))}
        {/* skupno število ur samo na koncu dokumenta (tfoot bi se ponovil na vsaki strani) */}
        <tbody>
          <tr className="ldn-total">
            <td /><td>Skupaj ur</td><td>{total}</td>
            <td colSpan={Number(cols.cilji) + Number(cols.standardi) || 1} className="ldn-legend">
              M – minimalni standard · I – izbirni cilj / standard · S – skupni standard
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div onClick={onClose} className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(20,30,25,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}>
        <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Letna priprava"
          style={{ background: 'var(--canvas)', borderRadius: 'var(--r-lg)', padding: '24px 26px', width: '100%', maxWidth: '480px', fontFamily: 'var(--font-sans)' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '26px', fontWeight: 400, margin: '0 0 4px', color: 'var(--ink)' }}>Letna priprava</h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 8px' }}>
            {predmet.naslov} · {classLabel}{school ? ` · ${school}` : ''} — {chaps.length} poglavij, skupaj {total} ur{target ? ` (po učnem načrtu ${target})` : ''}. Enote z 0 urami so izpuščene.
          </p>
          <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 2px' }}>Podatke za naslovno stran vpišeš sam; kar pustiš prazno, ostane prazna črta za ročni vpis.</p>
          <label style={lab}>Šola</label>
          <input style={field} value={schoolF} onChange={e => setSchoolF(e.target.value)} placeholder={school || 'npr. OŠ Cerklje ob Krki'} />
          <label style={lab}>Predmet</label>
          <input style={field} value={subjectF} onChange={e => setSubjectF(e.target.value)} placeholder={predmet.naslov} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <div><label style={lab}>Razred</label><input style={field} value={classF} onChange={e => setClassF(e.target.value)} placeholder={classLabel} /></div>
            <div><label style={lab}>Šolsko leto</label><input style={field} value={year} onChange={e => setYear(e.target.value)} placeholder="npr. 2026/27" /></div>
          </div>
          <label style={lab}>Učitelj(ica)</label>
          <input style={field} value={teacher} onChange={e => setTeacher(e.target.value)} placeholder="Ime in priimek" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <div><label style={lab}>Število ur</label><input style={field} value={hoursF} onChange={e => setHoursF(e.target.value)} placeholder={`v tabeli: ${total}${target ? ` (UN ${target})` : ''}`} /></div>
            <div><label style={lab}>Datum</label><input style={field} value={date} onChange={e => setDate(e.target.value)} placeholder="npr. 1. 9. 2026" /></div>
          </div>
          <label style={lab}>Stolpci v tabeli</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
            {chk('cilji', 'Cilji')}{chk('standardi', 'Standardi')}{chk('pojmi', 'Novi pojmi (pod temo)')}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '20px', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', padding: '9px 16px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', background: 'transparent', color: 'var(--ink)', cursor: 'pointer' }}>Prekliči</button>
            <button onClick={print} disabled={busy || chaps.length === 0}
              style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, padding: '9px 18px', border: 'none', borderRadius: 'var(--r-sm)', background: 'var(--forest)', color: '#fff', cursor: 'pointer', opacity: chaps.length === 0 ? 0.5 : 1 }}>🖨 Natisni</button>
          </div>
        </div>
      </div>
      {typeof document !== 'undefined' && createPortal(sheet, document.body)}
    </>
  );
}

export default function PrintLdnButton(props: { predmet: Predmet; classId?: string; razredFilter: number | null; school?: string; classLabel?: string; target?: number }): ReactNode {
  const [open, setOpen] = useState(false);
  if (!props.classId || !props.classLabel) return null; // LDN je vezan na izbran razred
  return (
    <>
      <button onClick={() => setOpen(true)} title="Letna priprava: teme, ure, cilji, standardi in novi pojmi za tiskanje"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        🖨 Letna priprava
      </button>
      {open && <Ldn predmet={props.predmet} classId={props.classId} razredFilter={props.razredFilter} school={props.school ?? ''} classLabel={props.classLabel} target={props.target} onClose={() => setOpen(false)} />}
    </>
  );
}
