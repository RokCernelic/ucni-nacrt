'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { joinChannel, joinStatsChannel } from '@/lib/quiz/sessionApi';
import { loadPaperSession, savePaperAnswers, type PaperSession } from '@/lib/quiz/paperSession';
import { layoutSheet, frameGeometry, parseToken, sheetSeed, type FrameGeometry, type SheetLayout, type LayoutItem } from '@/lib/quiz/printSheet';
import { toGray, locate, readLocated, project, type SheetReading } from '@/lib/quiz/omr';

type Item = LayoutItem & { correct: string[]; points: number };
interface Loaded { session: PaperSession; students: { student_id: string; name: string; submitted_at: string | null }[]; channel: ReturnType<typeof joinChannel> }
interface Hit {
  sessionId: string; studentId: string; name: string;
  layout: SheetLayout<Item>; geom: FrameGeometry; reading: SheetReading;
  /** izbrani krogci po vprašanjih (indeksi), po potrebi popravljeni ročno */
  chosen: number[][];
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paused = useRef(false);
  useEffect(() => { paused.current = !!hit; }, [hit]);

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
              else {
                const layout = layoutSheet(paper.items, paper.shuffle ? sheetSeed(paper.salt, tok.studentId) : null);
                const geom = frameGeometry(layout, true);
                const reading = readLocated(g, geom, loc);
                if (!reading) setStatus('Okvir ni dovolj jasen — približaj ali poravnaj list.');
                else {
                  drawn = { reading, geom };
                  const sg = sig({ studentId: tok.studentId, reading });
                  lastSig.current = lastSig.current.s === sg ? { s: sg, n: lastSig.current.n + 1 } : { s: sg, n: 1 };
                  setStatus(`${st.name}: berem …`);
                  if (lastSig.current.n >= 2) {
                    setHit({ sessionId: tok.sessionId, studentId: tok.studentId, name: st.name, layout, geom, reading, chosen: reading.cells.map(c => c.chosen) });
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
  }, [running, getSession]);

  // točkovanje prebranega lista
  const score = hit ? hit.layout.choice.map((c, i) => {
    const ids = hit.chosen[i].map(k => c.options[k]?.id).filter(Boolean) as string[];
    const correct = c.item.correct;
    const ok = correct.length > 0 && ids.length === correct.length && ids.every(id => correct.includes(id));
    return { n: c.n, letters: hit.chosen[i].map(k => c.options[k]?.letter).join(''), right: c.options.filter(o => correct.includes(o.id)).map(o => o.letter).join(''), ok, points: c.item.points, uncertain: hit.reading.cells[i].uncertain, nOpts: c.options.length, multi: !!c.item.multi };
  }) : [];
  const got = score.reduce((s, r) => s + (r.ok ? r.points : 0), 0);
  const max = score.reduce((s, r) => s + r.points, 0);

  const toggle = (qi: number, k: number) => setHit(h => {
    if (!h) return h;
    const multi = !!h.layout.choice[qi].item.multi;
    const cur = h.chosen[qi];
    const next = cur.includes(k) ? cur.filter(x => x !== k) : multi ? [...cur, k].sort() : [k];
    return { ...h, chosen: h.chosen.map((c, i) => (i === qi ? next : c)) };
  });

  const save = async () => {
    if (!hit) return;
    setBusy(true); setError(null);
    try {
      const s = await getSession(hit.sessionId);
      const scored = new Set((s.session.quiz.questions ?? []).map(q => q.id));
      const answers = hit.layout.choice.flatMap((c, i) => {
        if (!scored.has(c.item.id)) return [];
        const ids = hit.chosen[i].map(k => c.options[k]?.id).filter(Boolean) as string[];
        if (!ids.length) return [];
        return [{ questionId: c.item.id, value: ids.length === 1 ? ids[0] : 'X' }];
      });
      await savePaperAnswers(hit.sessionId, hit.studentId, answers);
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
          <canvas ref={viewRef} style={{ width: '100%', borderRadius: '10px', background: '#000', display: 'block' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0' }}>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0, flex: 1 }}>{status}</p>
            <button onClick={stopCamera} style={{ ...btnS(), fontSize: '13px', padding: '8px 12px', flexShrink: 0 }}>✕ Ustavi kamero</button>
          </div>
        </>
      )}
      {error && <p style={{ color: '#c0392b', fontSize: '13px' }}>{error}</p>}

      {hit && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, background: 'var(--canvas)', borderTop: '1px solid var(--hairline)', boxShadow: '0 -6px 24px rgba(0,0,0,.15)', padding: '12px 14px 16px', maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px' }}>
            <b style={{ fontSize: '17px' }}>{hit.name}</b>
            <span style={{ fontSize: '17px', color: 'var(--forest)', fontWeight: 700 }}>{String(got).replace('.', ',')} / {String(max).replace('.', ',')}</span>
            {saved[hit.studentId] !== undefined && <span style={{ fontSize: '12px', color: '#b7791f' }}>že skeniran — shranitev prepiše</span>}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 8px' }}>Preveri: tapni krogec, da popraviš. Oranžno = negotovo.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '6px 12px', marginBottom: '12px' }}>
            {score.map((r, qi) => (
              <div key={r.n} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 4px', borderRadius: '6px', background: r.uncertain ? '#fff4e0' : 'transparent' }}>
                <span style={{ width: '26px', textAlign: 'right', fontSize: '12px', fontWeight: 700 }}>{r.n}{r.multi ? '+' : ''}</span>
                {Array.from({ length: r.nOpts }, (_, k) => {
                  const on = hit.chosen[qi].includes(k);
                  return (
                    <button key={k} onClick={() => toggle(qi, k)}
                      style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1.5px solid var(--ink)', fontSize: '10px', fontWeight: 700, padding: 0, cursor: 'pointer', background: on ? 'var(--ink)' : 'transparent', color: on ? '#fff' : 'var(--muted)' }}>
                      {'ABCDEFGHIJKL'[k]}
                    </button>
                  );
                })}
                <span style={{ fontSize: '13px', marginLeft: '2px' }}>{r.right ? (r.ok ? '✓' : `✗ ${r.right}`) : '·'}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => void save()} disabled={busy} style={{ ...btnS(true), flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? 'Shranjujem …' : '✓ Shrani in naprej'}</button>
            <button onClick={() => { lastSig.current = { s: '', n: 0 }; setHit(null); }} disabled={busy} style={btnS()}>Znova</button>
          </div>
        </div>
      )}

      {Object.keys(saved).length > 0 && !hit && (
        <p style={{ fontSize: '13px', color: 'var(--forest)' }}>Skeniranih v tej seji: {Object.keys(saved).length}</p>
      )}
    </div>
  );
}
