'use client';

import { joinChoiceIds, parseNumber } from '@/lib/quiz/scoring';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { joinChannel, joinStatsChannel, setManualPoints } from '@/lib/quiz/sessionApi';
import { loadPaperSession, savePaperAnswers, isPaperOpen, paperScannedAt, loadStudentAnswers, type PaperSession } from '@/lib/quiz/paperSession';
import { layoutSheet, frameGeometry, parseToken, sheetSeed, shuffleOpts, type FrameGeometry, type SheetLayout, type LayoutItem } from '@/lib/quiz/printSheet';
import { toGray, locate, readLocated, project, type SheetReading } from '@/lib/quiz/omr';

type Item = LayoutItem & { correct: string[]; points: number };
interface Loaded { session: PaperSession; students: { student_id: string; name: string; submitted_at: string | null }[]; channel: ReturnType<typeof joinChannel> }
interface Hit {
  sessionId: string; studentId: string; name: string;
  layout: SheetLayout<Item>; geom: FrameGeometry; reading: SheetReading;
  /** izbrani krogci po vprašanjih (indeksi), po potrebi popravljeni ročno */
  chosen: number[][];
  /** naloge, ki jih skener ne prebere: točke vpiše učitelj (n = številka na listu tega učenca) */
  manual: { id: string; n: number; prompt: string; points: number }[];
  /** vpisane točke (besedilo polja); `loaded` = prej shranjene vrednosti so naložene */
  manualVals: Record<string, string>;
  manualSaved: Record<string, string> | null;
}

const sig = (h: { studentId: string; reading: SheetReading }) => `${h.studentId}|${h.reading.cells.map(c => c.chosen.join(',')).join(';')}`;

/** Telefon kot skener natisnjenih kvizov: kamera → okvir z odgovori → točke → shrani k učencu (skupna statistika). */
export default function PaperScanner() {
  const { user, loading } = useAuth();
  const statsCh = useRef<ReturnType<typeof joinStatsChannel> | null>(null);
  useEffect(() => {
    if (!user) return;
    const ch = joinStatsChannel(user.id, () => {});
    statsCh.current = ch;
    return () => { ch.close(); statsCh.current = null; };
  }, [user]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const work = useRef<HTMLCanvasElement | null>(null);
  const sessions = useRef(new Map<string, Promise<Loaded>>());
  const lastSig = useRef<{ s: string; n: number }>({ s: '', n: 0 });
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Usmeri kamero v okvir z odgovori (vsi štirje črni kvadratki in QR koda).');
  const [hit, setHit] = useState<Hit | null>(null);
  const [saved, setSaved] = useState<Record<string, number>>({});
  /** ali je bil ta list že shranjen (tudi z druge naprave z istim računom) — čas zadnje shranitve */
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // rezultati ležeče (zasukani za 90° v desno), ko je zaslon pokončen — telefon med skeniranjem drži ležeče
  const [landscape, setLandscapeState] = useState(true);
  const [portraitScreen, setPortraitScreen] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- branje nastavitve in usmerjenosti zaslona ob prvem izrisu
    try { if (localStorage.getItem('skener-lezece') === '0') setLandscapeState(false); } catch { /* ignore */ }
    const mq = window.matchMedia('(orientation: portrait)');
    const on = () => setPortraitScreen(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const setLandscape = (v: boolean) => { setLandscapeState(v); try { localStorage.setItem('skener-lezece', v ? '1' : '0'); } catch { /* ignore */ } };
  const paused = useRef(false);
  useEffect(() => { paused.current = !!hit; }, [hit]);

  /** Ali je seja še odprta (učitelj je ni ročno končal)? Rezultat velja nekaj sekund, da ne preverjamo ob vsaki sličici. */
  const openCache = useRef(new Map<string, { t: number; open: boolean }>());
  const sessionOpen = useCallback(async (id: string, fresh = false) => {
    const c = openCache.current.get(id);
    if (!fresh && c && Date.now() - c.t < 4000) return c.open;
    const open = await isPaperOpen(id);
    openCache.current.set(id, { t: Date.now(), open });
    return open;
  }, []);

  const getSession = useCallback((id: string) => {
    let p = sessions.current.get(id);
    if (!p) {
      p = loadPaperSession(id).then(r => ({ ...r, channel: joinChannel(r.session.code, () => {}) }));
      p.catch(() => sessions.current.delete(id));
      sessions.current.set(id, p);
    }
    return p;
  }, []);

  useEffect(() => () => { void Promise.all([...sessions.current.values()]).then(all => all.forEach(s => s.channel.close())).catch(() => {}); }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setRunning(true);
    } catch (e) {
      setError(`Kamere ni bilo mogoče vklopiti: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  useEffect(() => () => {
    const s = videoRef.current?.srcObject as MediaStream | null;
    s?.getTracks().forEach(t => t.stop());
  }, []);

  // kamera se vklopi takoj ob odprtju skenerja (gumb ostane za ponovni vklop / če brskalnik zavrne)
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!user || autoStarted.current) return;
    const t = setTimeout(() => { autoStarted.current = true; void start(); }, 0);
    return () => clearTimeout(t);
  }, [user]);

  const stopCamera = () => {
    const s = videoRef.current?.srcObject as MediaStream | null;
    s?.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
  };

  // med skeniranjem skrij glavo aplikacije (meni, ura) — več prostora za sliko
  useEffect(() => {
    if (!running) return;
    const root = document.documentElement;
    root.classList.add('scanner-full');
    return () => root.classList.remove('scanner-full');
  }, [running]);

  // zanka skeniranja (~4× na sekundo)
  useEffect(() => {
    if (!running) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      const v = videoRef.current;
      if (v && v.videoWidth && !paused.current) {
        const scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
        const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
        const c = (work.current ??= document.createElement('canvas'));
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const g = toGray(img.data, w, h);
        const loc = locate(img.data, w, h, g);
        let drawn: { reading: SheetReading; geom: FrameGeometry } | null = null;
        if (!loc) setStatus('Iščem okvir … (vsi štirje črni kvadratki morajo biti v sliki)');
        else {
          const tok = parseToken(loc.token);
          if (!tok) setStatus('To ni QR koda natisnjenega kviza.');
          else {
            try {
              const s = await getSession(tok.sessionId);
              const st = s.students.find(x => x.student_id === tok.studentId);
              const paper = s.session.paper;
              if (!paper || !st) setStatus('List ne pripada nobeni od tvojih sej.');
              else if (!(await sessionOpen(tok.sessionId))) setStatus('Ta seja je končana — skeniranje ni več mogoče.');
              else {
                const layout = layoutSheet(paper.items, paper.shuffle ? sheetSeed(paper.salt, tok.studentId) : null, { ...shuffleOpts(paper), order: paper.orders?.[tok.studentId] });
                const geom = frameGeometry(layout, true);
                const reading = readLocated(g, geom, loc);
                if (!reading) setStatus('Okvir ni dovolj jasen — približaj ali poravnaj list.');
                else {
                  drawn = { reading, geom };
                  const sg = sig({ studentId: tok.studentId, reading });
                  lastSig.current = lastSig.current.s === sg ? { s: sg, n: lastSig.current.n + 1 } : { s: sg, n: 1 };
                  setStatus(`${st.name}: berem …`);
                  if (lastSig.current.n >= 2) {
                    const nOf = new Map([...layout.choice, ...layout.free].map(c => [c.item.id, c.n]));
                    const manual = s.session.quiz.questions.filter(q => q.kind === 'open' && q.manual)
                      .map(q => ({ id: q.id, n: nOf.get(q.id) ?? 0, prompt: q.prompt, points: q.points })).sort((a, b) => a.n - b.n);
                    setHit({ sessionId: tok.sessionId, studentId: tok.studentId, name: st.name, layout, geom, reading, chosen: reading.cells.map(c => c.chosen), manual, manualVals: {}, manualSaved: null });
                    if (manual.length) void loadStudentAnswers(tok.sessionId, tok.studentId).then(prev => {
                      const saved = Object.fromEntries(manual.filter(m => prev[m.id] != null).map(m => [m.id, String(prev[m.id]).replace('.', ',')]));
                      setHit(h => (h && h.studentId === tok.studentId && h.sessionId === tok.sessionId ? { ...h, manualSaved: saved, manualVals: { ...saved, ...h.manualVals } } : h));
                    }).catch(() => {});
                    setScannedAt(null);
                    void paperScannedAt(tok.sessionId, tok.studentId).then(setScannedAt).catch(() => {});
                    try { navigator.vibrate?.(60); } catch { /* ignore */ }
                  }
                }
              }
            } catch (e) { setStatus(`Seje ni bilo mogoče naložiti: ${e instanceof Error ? e.message : String(e)}`); }
          }
        }
        // prikaz: sličica z oznakami
        const view = viewRef.current;
        if (view) {
          view.width = w; view.height = h;
          const vc = view.getContext('2d')!;
          vc.drawImage(c, 0, 0);
          if (drawn) {
            const { reading, geom } = drawn;
            vc.lineWidth = Math.max(2, w / 500);
            geom.cells.forEach((cell, i) => cell.bubbles.forEach((b, k) => {
              const [x, y] = project(reading.H, b.cx, b.cy);
              const [x2] = project(reading.H, b.cx + geom.bub / 2, b.cy);
              const on = reading.cells[i].chosen.includes(k);
              const unsure = !on && reading.cells[i].uncertain;
              if (!on && !unsure) return;
              vc.strokeStyle = on ? '#16a34a' : '#f59e0b';
              vc.beginPath(); vc.arc(x, y, Math.abs(x2 - x) + 3, 0, Math.PI * 2); vc.stroke();
            }));
            vc.fillStyle = '#16a34a';
            reading.marks.forEach(([x, y]) => { vc.fillRect(x - 5, y - 5, 10, 10); });
          }
        }
      }
      timer = setTimeout(() => void tick(), 220);
    };
    void tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [running, getSession, sessionOpen]);

  // točkovanje prebranega lista
  const score = hit ? hit.layout.choice.map((c, i) => {
    const ids = hit.chosen[i].map(k => c.options[k]?.id).filter(Boolean) as string[];
    const correct = c.item.correct;
    const ok = correct.length > 0 && ids.length === correct.length && ids.every(id => correct.includes(id));
    return { n: c.n, letters: hit.chosen[i].map(k => c.options[k]?.letter).join(''), right: c.options.filter(o => correct.includes(o.id)).map(o => o.letter).join(''), ok, points: c.item.points, uncertain: hit.reading.cells[i].uncertain, nOpts: c.options.length, multi: !!c.item.multi };
  }) : [];
  const manualOf = (m: { id: string; points: number }) => {
    const raw = hit?.manualVals[m.id]?.trim();
    if (!raw) return null;
    const n = parseNumber(raw);
    return n === null || n < 0 || n > m.points ? NaN : n;
  };
  const manualBad = hit ? hit.manual.filter(m => Number.isNaN(manualOf(m))) : [];
  const got = score.reduce((s, r) => s + (r.ok ? r.points : 0), 0) + (hit?.manual.reduce((s, m) => s + (manualOf(m) || 0), 0) ?? 0);
  const max = score.reduce((s, r) => s + r.points, 0) + (hit?.manual.reduce((s, m) => s + m.points, 0) ?? 0);

  const toggle = (qi: number, k: number) => setHit(h => {
    if (!h) return h;
    const multi = !!h.layout.choice[qi].item.multi;
    const cur = h.chosen[qi];
    const next = cur.includes(k) ? cur.filter(x => x !== k) : multi ? [...cur, k].sort() : [k];
    return { ...h, chosen: h.chosen.map((c, i) => (i === qi ? next : c)) };
  });

  const save = async () => {
    if (!hit) return;
    if (manualBad.length) { setError(`Točke pri nalogi ${manualBad.map(m => m.n).join(', ')} niso veljavne (od 0 do največ točk naloge).`); return; }
    setBusy(true); setError(null);
    try {
      if (!(await sessionOpen(hit.sessionId, true))) {
        setError('Ta seja je bila medtem končana — rezultat ni shranjen.');
        setHit(null); lastSig.current = { s: '', n: 0 };
        return;
      }
      const s = await getSession(hit.sessionId);
      const scored = new Set((s.session.quiz.questions ?? []).map(q => q.id));
      const answers = hit.layout.choice.flatMap((c, i) => {
        if (!scored.has(c.item.id)) return [];
        const ids = hit.chosen[i].map(k => c.options[k]?.id).filter(Boolean) as string[];
        if (!ids.length) return [];
        return [{ questionId: c.item.id, value: c.item.multi ? joinChoiceIds(ids) : ids.length === 1 ? ids[0] : 'X' }];
      });
      // ročno vpisane točke (prazno = ne spreminjaj; izbrisano polje = pobriši prej shranjene točke)
      for (const m of hit.manual) { const v = manualOf(m); if (v !== null && !Number.isNaN(v)) answers.push({ questionId: m.id, value: String(v) }); }
      const keep = hit.manual.filter(m => manualOf(m) === null).map(m => m.id);
      await savePaperAnswers(hit.sessionId, hit.studentId, answers, keep);
      for (const m of hit.manual) if (manualOf(m) === null && hit.manualSaved?.[m.id]) await setManualPoints(hit.sessionId, hit.studentId, m.id, null);
      s.channel.send('answers');
      statsCh.current?.send('answers');
      setSaved(m => ({ ...m, [hit.studentId]: got }));
      setStatus(`✓ Shranjeno: ${hit.name} (${got}/${max}). Naslednji list …`);
      lastSig.current = { s: '', n: 0 };
      setHit(null);
    } catch (e) {
      setError(`Shranjevanje ni uspelo: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  if (loading) return null;
  if (!user) return <p style={{ padding: '40px 20px', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>Za skeniranje se <Link href="/login" style={{ color: 'var(--forest)' }}>prijavi</Link> z istim računom kot na računalniku.</p>;

  const btnS = (primary = false): React.CSSProperties => ({ fontFamily: 'var(--font-sans)', fontSize: '15px', fontWeight: 600, padding: '12px 18px', borderRadius: '10px', border: primary ? 'none' : '1px solid var(--hairline)', background: primary ? 'var(--forest)' : 'var(--canvas)', color: primary ? '#fff' : 'var(--ink)', cursor: 'pointer' });

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '12px', fontFamily: 'var(--font-sans)' }}>
      {!running && <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', fontWeight: 400, margin: '4px 0 8px' }}>Skener natisnjenih kvizov</h1>}
      <video ref={videoRef} playsInline muted style={{ display: 'none' }} />
      {!running ? (
        <div style={{ padding: '20px 0' }}>
          <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.5 }}>
            Telefon drži nad listom tako, da je v sliki cel okvir z odgovori (štirje črni kvadratki v kotih in QR koda). Okvir naj zapolni čim več zaslona; list je lahko tudi obrnjen.
          </p>
          <button onClick={() => void start()} style={btnS(true)}>📷 Vklopi kamero</button>
        </div>
      ) : (
        <>
          <canvas ref={viewRef} style={{ width: '100%', borderRadius: '10px', background: '#000', display: hit ? 'none' : 'block' }} />
          {!hit && <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0' }}>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0, flex: 1 }}>{status}</p>
            <button onClick={stopCamera} style={{ ...btnS(), fontSize: '13px', padding: '8px 12px', flexShrink: 0 }}>✕ Ustavi kamero</button>
          </div>}
        </>
      )}
      {error && <p style={{ color: '#c0392b', fontSize: '13px' }}>{error}</p>}

      {hit && (() => {
        // brez posnetka: učitelj ima list pred sabo — samo prebrani odgovori in ročni popravki
        const turned = landscape && portraitScreen;
        const body = (<>
          <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px 12px', margin: '4px 0 6px' }}>
            <b style={{ fontSize: '20px' }}>{hit.name}</b>
            <span style={{ fontSize: '20px', color: 'var(--forest)', fontWeight: 700 }}>{String(got).replace('.', ',')} / {String(max).replace('.', ',')}</span>
            {(saved[hit.studentId] !== undefined || scannedAt) && <span style={{ fontSize: '12px', color: '#b7791f' }}>
              že skeniran{scannedAt ? ` (${new Date(scannedAt).toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}${saved[hit.studentId] === undefined ? ', na drugi napravi' : ''})` : ''} — shranitev prepiše
            </span>}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 12px' }}>Primerjaj z listom. Tapni črko, da popraviš. Oranžna vrstica = negotovo branje.</p>
          {/* ležeče: kot okvir na listu (4 stolpci, naloge po stolpcih od zgoraj navzdol); pokončno: 2 stolpca */}
          <div style={{ display: 'grid', gridTemplateColumns: turned ? 'repeat(4, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: '4px 14px' }}>
            {score.map((r, qi) => (
              <div key={r.n} style={{ ...(turned ? { gridColumn: Math.floor(qi / hit.geom.rows) + 1, gridRow: (qi % hit.geom.rows) + 1 } : {}), display: 'flex', alignItems: 'center', gap: '3px', padding: '5px 2px', borderRadius: '6px', background: r.uncertain ? '#fff1d6' : 'transparent', borderBottom: '1px solid var(--hairline)' }}>
                <span style={{ width: '24px', flexShrink: 0, textAlign: 'right', fontSize: '13px', fontWeight: 700, marginRight: '2px' }}>{r.n}{r.multi ? '+' : ''}</span>
                {Array.from({ length: r.nOpts }, (_, k) => {
                  const on = hit.chosen[qi].includes(k);
                  return (
                    <button key={k} onClick={() => toggle(qi, k)}
                      style={{ width: '27px', height: '27px', flexShrink: 0, borderRadius: '50%', border: '1.5px solid var(--ink)', fontSize: '11px', fontWeight: 700, padding: 0, cursor: 'pointer', background: on ? 'var(--ink)' : 'transparent', color: on ? '#fff' : 'var(--muted)' }}>
                      {'ABCDEFGHIJKL'[k]}
                    </button>
                  );
                })}
                <span style={{ marginLeft: 'auto', paddingLeft: '2px', fontSize: '15px', fontWeight: 800, color: !r.right ? 'var(--muted)' : r.ok ? 'var(--green-ok)' : '#c0392b', whiteSpace: 'nowrap' }}>
                  {r.right ? (r.ok ? '✓' : <>✗<span style={{ fontSize: '12px', fontWeight: 600 }}>{r.right}</span></>) : '·'}
                </span>
              </div>
            ))}
          </div>
          {hit.manual.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 6px' }}>Točke za ostale naloge (vpiši ročno)</div>
              <div style={{ display: 'grid', gridTemplateColumns: turned ? 'repeat(auto-fill, minmax(230px, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: '4px 10px' }}>
                {hit.manual.map(m => {
                  const v = manualOf(m);
                  const bad = Number.isNaN(v);
                  return (
                    <label key={m.id} title={m.prompt} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 2px', borderBottom: '1px solid var(--hairline)' }}>
                      <span style={{ width: '24px', flexShrink: 0, textAlign: 'right', fontSize: '13px', fontWeight: 700 }}>{m.n || '·'}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '12px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.prompt}</span>
                      <input value={hit.manualVals[m.id] ?? ''} inputMode="decimal" placeholder="–"
                        onChange={e => { const val = e.target.value.slice(0, 5); setHit(h => (h ? { ...h, manualVals: { ...h.manualVals, [m.id]: val } } : h)); }}
                        style={{ width: '48px', flexShrink: 0, textAlign: 'center', fontSize: '17px', fontWeight: 700, padding: '5px 2px', borderRadius: '8px', fontFamily: 'var(--font-sans)',
                          border: `1.5px solid ${bad ? '#c0392b' : 'var(--hairline)'}`, color: bad ? '#c0392b' : 'var(--ink)', background: '#fff' }} />
                      <span style={{ fontSize: '13px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>/ {String(m.points).replace('.', ',')}</span>
                    </label>
                  );
                })}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '6px 0 0' }}>Prazno polje = še ni pregledano. Točke lahko vpišeš ali popraviš tudi kasneje v rezultatih.</p>
            </div>
          )}
        </>);
        const buttons = (<>
          <button onClick={() => void save()} disabled={busy} style={{ ...btnS(true), flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? 'Shranjujem …' : '✓ Shrani in naprej'}</button>
          <button onClick={() => { lastSig.current = { s: '', n: 0 }; setHit(null); }} disabled={busy} style={btnS()}>Skeniraj znova</button>
          {portraitScreen && <button onClick={() => setLandscape(!landscape)} title={landscape ? 'Prikaži pokončno' : 'Prikaži ležeče (zasukano za 90° v desno)'}
            style={{ ...btnS(), padding: '12px 14px' }}>{landscape ? '▯' : '▭'}</button>}
        </>);
        const barStyle: React.CSSProperties = { display: 'flex', gap: '8px', background: 'var(--canvas)', borderTop: '1px solid var(--hairline)', boxShadow: '0 -6px 24px rgba(0,0,0,.12)' };
        if (turned) return (
          // telefon drži ležeče (zaslon zaklenjen pokončno): stran zasukana za 90° v desno čez cel zaslon
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vh', height: '100vw', zIndex: 60, background: 'var(--canvas)',
            transformOrigin: 'top left', transform: 'rotate(90deg) translateY(-100%)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>{body}</div>
            <div style={{ ...barStyle, padding: '10px 14px' }}>{buttons}</div>
          </div>
        );
        return (
          <div style={{ paddingBottom: '84px' }}>
            {body}
            <div style={{ ...barStyle, position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, padding: '12px 14px calc(12px + env(safe-area-inset-bottom))' }}>{buttons}</div>
          </div>
        );
      })()}

      {Object.keys(saved).length > 0 && !hit && (
        <p style={{ fontSize: '13px', color: 'var(--forest)' }}>Skeniranih v tej seji: {Object.keys(saved).length}</p>
      )}
    </div>
  );
}
