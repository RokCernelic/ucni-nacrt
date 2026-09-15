'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  deviceJoin, deviceState, deviceAnswer, deviceSubmit, deviceImage, getDeviceId, joinChannel,
  type DeviceState, type PublicQuestion,
} from '@/lib/quiz/sessionApi';
import { seededOrder } from '@/lib/quiz/shuffle';
import { formatNumber } from '@/lib/quiz/format';
import { useAutoFullscreen } from '@/hooks/useAutoFullscreen';

const LETTERS = 'ABCDEF';
const page: React.CSSProperties = { minHeight: '100vh', background: '#f4f2ee', fontFamily: 'var(--font-sans)', color: 'var(--ink)', display: 'flex', flexDirection: 'column' };
const card: React.CSSProperties = { background: '#fff', borderRadius: '18px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', padding: '28px', width: '100%', maxWidth: '640px' };
const bigBtn = (disabled = false): React.CSSProperties => ({ width: '100%', fontSize: '20px', fontWeight: 700, color: '#fff', background: 'var(--forest)', border: 'none', borderRadius: '14px', padding: '18px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 });

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ ...page, alignItems: 'center', justifyContent: 'center', padding: '24px' }}><div style={card}>{children}</div></div>;
}

/** Vnos kode seje (če učenec ni prišel prek QR). */
export function CodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState('');
  useAutoFullscreen();
  return (
    <Centered>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '34px', fontWeight: 400, margin: '0 0 8px' }}>Kviz</h1>
      <p style={{ fontSize: '17px', color: 'var(--muted)', margin: '0 0 20px' }}>Vpiši kodo, ki jo vidiš na tabli.</p>
      <form onSubmit={e => { e.preventDefault(); if (code.trim().length >= 4) router.push(`/k/${code.trim().toUpperCase()}`); }}>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          autoFocus autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="KODA"
          style={{ width: '100%', boxSizing: 'border-box', textAlign: 'center', fontSize: '44px', fontWeight: 700, letterSpacing: '0.2em', padding: '14px', border: '2px solid var(--hairline)', borderRadius: '14px', outline: 'none', marginBottom: '16px' }} />
        <button type="submit" style={bigBtn(code.length < 4)} disabled={code.length < 4}>Naprej</button>
      </form>
    </Centered>
  );
}

function PinEntry({ code, onJoined, message }: { code: string; onJoined: () => void; message?: string }) {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<string | null>(message ?? null);
  const [busy, setBusy] = useState(false);

  const submit = async (value: string) => {
    if (value.length !== 4 || busy) return;
    setBusy(true); setStatus(null);
    try {
      const r = await deviceJoin(code, value, getDeviceId());
      if (r.status === 'joined' || r.status === 'pending') onJoined();
      else {
        setPin('');
        setStatus(r.status === 'bad_pin' ? 'Napačen PIN. Poskusi znova.'
          : r.status === 'locked' ? 'Preveč napačnih poskusov. Pokliči učitelja.'
          : 'Seja s to kodo ne obstaja ali je končana.');
      }
    } catch {
      setStatus('Ni povezave. Preveri internet in poskusi znova.');
    } finally { setBusy(false); }
  };

  const press = (d: string) => {
    if (busy) return;
    const next = d === '⌫' ? pin.slice(0, -1) : (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submit(next);
  };

  return (
    <Centered>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '14px', letterSpacing: '0.12em', color: 'var(--muted)', fontWeight: 600 }}>KODA {code}</div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '32px', fontWeight: 400, margin: '8px 0 18px' }}>Vpiši svoj PIN</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '14px' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ width: '54px', height: '66px', borderRadius: '12px', border: `2px solid ${pin.length === i ? 'var(--forest)' : 'var(--hairline)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', fontWeight: 700 }}>{pin[i] ? '•' : ''}</div>
          ))}
        </div>
        <p style={{ minHeight: '24px', fontSize: '16px', color: '#c0392b', margin: '0 0 10px' }}>{busy ? <span style={{ color: 'var(--muted)' }}>Preverjam …</span> : status}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', maxWidth: '330px', margin: '0 auto' }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => d === '' ? <div key={i} /> : (
            <button key={i} onClick={() => press(d)} style={{ fontSize: '30px', fontWeight: 600, padding: '16px 0', borderRadius: '14px', border: '1px solid var(--hairline)', background: '#fff', color: 'var(--ink)', cursor: 'pointer', touchAction: 'manipulation' }}>{d}</button>
          ))}
        </div>
      </div>
    </Centered>
  );
}

function useImage(code: string, q: PublicQuestion | null | undefined) {
  const [images, setImages] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());
  const id = q?.id;
  const hasImage = !!q?.hasImage;
  useEffect(() => {
    if (!id || !hasImage || requested.current.has(id)) return;
    requested.current.add(id);
    deviceImage(code, getDeviceId(), id)
      .then(src => { if (src) setImages(m => ({ ...m, [id]: src })); })
      .catch(() => { requested.current.delete(id); });
  }, [code, id, hasImage]);
  return id && hasImage ? images[id] ?? null : null;
}

function QuestionBody({ code, q, selected, locked, shuffleSeed, onPick, onNumeric, header }: {
  code: string; q: PublicQuestion; selected: string | null | undefined; locked: boolean; shuffleSeed: string | null;
  onPick: (optionId: string) => void; onNumeric: (value: string) => void; header: React.ReactNode;
}) {
  const img = useImage(code, q);
  const [num, setNum] = useState(selected ?? '');
  useEffect(() => { setNum(selected ?? ''); }, [q.id, selected]);

  // med zbiranjem premešano (brez črk — ne bi se ujemale s tablo); po zaklepu izvirni vrstni red s črkami
  const shuffled = !!shuffleSeed && !locked;
  const options = useMemo(() => {
    const opts = q.options ?? [];
    return shuffled ? seededOrder(opts, `${shuffleSeed}:${q.id}`) : opts;
  }, [q.id, q.options, shuffled, shuffleSeed]);

  return (
    <div style={{ ...card, maxWidth: '860px' }}>
      {header}
      <div style={{ fontSize: 'clamp(22px, 3.2vw, 30px)', fontWeight: 600, lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>{q.prompt}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img && <img src={img} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: '40vh', margin: '16px auto 0', borderRadius: '12px' }} />}
      {q.hasImage && !img && <div style={{ height: '160px', margin: '16px 0 0', borderRadius: '12px', background: '#eee' }} />}

      {q.kind === 'mc' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '22px' }}>
          {options.map(o => {
            const isSel = selected === o.id;
            const origIndex = (q.options ?? []).findIndex(x => x.id === o.id);
            return (
              <button key={o.id} disabled={locked} onClick={() => onPick(o.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left', width: '100%', padding: '18px 20px', borderRadius: '14px', fontSize: 'clamp(19px, 2.6vw, 24px)', cursor: locked ? 'default' : 'pointer', touchAction: 'manipulation',
                  border: `3px solid ${isSel ? 'var(--forest)' : 'var(--hairline)'}`, background: isSel ? 'var(--forest)' : '#fff', color: isSel ? '#fff' : 'var(--ink)', opacity: locked && !isSel ? 0.55 : 1 }}>
                {!shuffled && <span style={{ fontWeight: 800, minWidth: '26px' }}>{LETTERS[origIndex]}</span>}
                <span style={{ flex: 1 }}>{o.text}</span>
                {isSel && <span style={{ fontSize: '22px' }}>✓</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ marginTop: '22px' }}>
          <input value={num} disabled={locked} inputMode="decimal" placeholder="Tvoj odgovor"
            onChange={e => setNum(e.target.value.replace(/[^0-9,.\-\s]/g, '').slice(0, 20))}
            onKeyDown={e => { if (e.key === 'Enter') onNumeric(num); }}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: '34px', fontWeight: 600, padding: '14px 18px', borderRadius: '14px', border: '3px solid var(--hairline)', outline: 'none', textAlign: 'center' }} />
          {!locked && (
            <button onClick={() => onNumeric(num)} disabled={num.trim() === '' || num.trim() === (selected ?? '')}
              style={{ ...bigBtn(num.trim() === '' || num.trim() === (selected ?? '')), marginTop: '12px' }}>
              {selected ? 'Spremeni odgovor' : 'Oddaj odgovor'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function StudentQuiz({ code: rawCode }: { code: string }) {
  const code = rawCode.toUpperCase();
  useAutoFullscreen();
  const [state, setState] = useState<DeviceState | null>(null);
  const router = useRouter();
  const [net, setNet] = useState<'ok' | 'offline' | 'not_installed'>('ok');
  const [flash, setFlash] = useState<string | null>(null);
  const [pickedLocal, setPickedLocal] = useState<Record<string, string>>({});
  const [studentIndex, setStudentIndex] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const channel = useRef<ReturnType<typeof joinChannel> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await deviceState(code, getDeviceId());
      setState(s); setNet('ok');
    } catch (e) {
      // funkcije še niso nameščene v Supabase (migracija ni zagnana) — to ni težava z omrežjem
      const msg = e instanceof Error ? e.message : '';
      setNet(/could not find the function|schema cache|does not exist/i.test(msg) ? 'not_installed' : 'offline');
    }
  }, [code]);

  useEffect(() => {
    void refresh();
    const ch = joinChannel(code, () => { void refresh(); });
    channel.current = ch;
    // rezervno osveževanje: pogosteje, če kanal ni povezan
    const t = setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
    const onVis = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); ch.close(); };
  }, [code, refresh]);

  const send = async (questionId: string, value: string) => {
    setPickedLocal(p => ({ ...p, [questionId]: value }));
    try {
      const r = await deviceAnswer(code, getDeviceId(), questionId, value);
      if (!r.ok) {
        setFlash(r.reason === 'locked' ? 'Odgovori so že zaklenjeni.' : r.reason === 'ended' ? 'Seja je končana.' : 'Odgovora ni bilo mogoče shraniti.');
        setPickedLocal(p => { const n = { ...p }; delete n[questionId]; return n; });
      } else {
        channel.current?.send('answer');
        setFlash(null);
      }
      void refresh();
    } catch {
      setNet('offline');
      setPickedLocal(p => { const n = { ...p }; delete n[questionId]; return n; });
    }
  };

  if (!state) return <Centered><p style={{ fontSize: '18px', color: 'var(--muted)', textAlign: 'center' }}>
    {net === 'not_installed' ? 'Kvizi na tem strežniku še niso nameščeni. Obvesti učitelja.' : net === 'offline' ? 'Ni povezave …' : 'Nalagam …'}
  </p></Centered>;

  if (state.status === 'no_session') {
    return <Centered>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '30px', fontWeight: 400, margin: '0 0 10px' }}>Seje ni</h1>
      <p style={{ fontSize: '17px', color: 'var(--muted)', margin: '0 0 20px' }}>Seja s kodo <b>{code}</b> ne obstaja ali je končana.</p>
      <button style={bigBtn()} onClick={() => router.push('/k')}>Vpiši drugo kodo</button>
    </Centered>;
  }
  if (state.status === 'not_joined') return <PinEntry code={code} onJoined={() => void refresh()} />;
  if (state.status === 'pending') {
    return <Centered>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px' }}>⏳</div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 400, margin: '10px 0' }}>Čakam na učitelja</h1>
        <p style={{ fontSize: '17px', color: 'var(--muted)', margin: 0 }}>Tvoj PIN je že povezan z drugo napravo. Učitelj mora potrditi to napravo.</p>
      </div>
    </Centered>;
  }

  const topBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', background: 'var(--forest)', color: '#fff' }}>
      <span style={{ fontWeight: 700, fontSize: '17px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{state.title}</span>
      {net === 'offline' && <span style={{ fontSize: '13px', background: '#c0392b', padding: '3px 8px', borderRadius: '6px' }}>ni povezave</span>}
      <span style={{ fontSize: '15px', opacity: 0.8 }}>{state.name}</span>
    </div>
  );

  // ── konec / oddano: skupni rezultat ──
  if (state.status === 'ended' || state.submitted) {
    const pct = state.maxPoints ? Math.round(((state.points ?? 0) / state.maxPoints) * 100) : 0;
    return (
      <div style={page}>{topBar}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{ fontSize: '16px', color: 'var(--muted)' }}>{state.status === 'ended' ? 'Kviz je končan' : 'Kviz si oddal'}</div>
            <div style={{ fontSize: '64px', fontWeight: 800, margin: '8px 0 0', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(state.points ?? 0)} / {formatNumber(state.maxPoints ?? 0)}</div>
            <div style={{ fontSize: '24px', color: 'var(--forest)', fontWeight: 700 }}>{pct} %</div>
            {state.status !== 'ended' && <p style={{ fontSize: '15px', color: 'var(--muted)', margin: '14px 0 0' }}>Počakaj navodila učitelja.</p>}
          </div>
          {state.review?.map((r, i) => (
            <div key={r.id} style={{ ...card, padding: '18px 22px', borderLeft: `6px solid ${r.isCorrect ? 'var(--green-ok)' : r.yourAnswer ? '#c0392b' : '#ccc'}` }}>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px' }}>{i + 1}. vprašanje</div>
              <div style={{ fontSize: '18px', fontWeight: 600, whiteSpace: 'pre-wrap' }}>{r.prompt}</div>
              <div style={{ fontSize: '16px', marginTop: '8px' }}>
                Tvoj odgovor: <b>{r.kind === 'mc' ? (r.options?.find(o => o.id === r.yourAnswer)?.text ?? '—') : (r.yourAnswer ?? '—')}</b>
                {!r.isCorrect && <> · Pravilno: <b style={{ color: 'var(--green-ok)' }}>{r.kind === 'mc' ? r.options?.find(o => o.id === r.correct)?.text : r.correct}</b></>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── vodi učitelj ──
  if (state.mode === 'teacher') {
    const q = state.question;
    if (!q) return <div style={page}>{topBar}<Centered><p style={{ fontSize: '20px', textAlign: 'center' }}>Počakaj na vprašanje …</p></Centered></div>;
    const locked = state.phase !== 'collecting';
    const selected = locked ? state.answer : (pickedLocal[q.id] ?? state.answer);
    return (
      <div style={page}>{topBar}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <QuestionBody code={code} q={q} selected={selected} locked={locked} shuffleSeed={state.shuffle ? state.seed ?? null : null}
            onPick={id => void send(q.id, id)} onNumeric={v => void send(q.id, v.trim())}
            header={<div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--muted)', marginBottom: '10px' }}>Vprašanje {(state.index ?? 0) + 1} / {state.total}</div>} />
          <div style={{ fontSize: '18px', fontWeight: 600, minHeight: '28px', color: locked ? 'var(--muted)' : 'var(--forest)', textAlign: 'center' }}>
            {flash ?? (locked ? '🔒 Odgovori so zaklenjeni — poglej na tablo.' : selected ? '✓ Odgovor prejet — do zaklepa ga lahko še spremeniš.' : '')}
          </div>
        </div>
      </div>
    );
  }

  // ── vsak sam ──
  const questions = state.questions ?? [];
  const ordered = state.shuffle && state.seed ? seededOrder(questions.map(q => ({ ...q, keepPlace: false })), `${state.seed}:vrstni-red`) : questions;
  const idx = Math.min(studentIndex, Math.max(0, ordered.length - 1));
  const q = ordered[idx];
  const answers = { ...(state.answers ?? {}), ...pickedLocal };
  const answeredCount = ordered.filter(x => answers[x.id]).length;

  return (
    <div style={page}>{topBar}
      <div style={{ padding: '16px 20px 0', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {ordered.map((x, i) => (
          <button key={x.id} onClick={() => setStudentIndex(i)}
            style={{ width: '44px', height: '44px', borderRadius: '50%', fontSize: '16px', fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
              border: `2px solid ${i === idx ? 'var(--ink)' : answers[x.id] ? 'var(--forest)' : 'var(--hairline)'}`,
              background: answers[x.id] ? 'var(--forest)' : '#fff', color: answers[x.id] ? '#fff' : 'var(--ink)' }}>{i + 1}</button>
        ))}
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
        {q && (
          <QuestionBody code={code} q={q} selected={answers[q.id]} locked={false} shuffleSeed={state.shuffle ? state.seed ?? null : null}
            onPick={id => void send(q.id, id)} onNumeric={v => void send(q.id, v.trim())}
            header={<div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--muted)', marginBottom: '10px' }}>Vprašanje {idx + 1} / {ordered.length}</div>} />
        )}
        {flash && <div style={{ fontSize: '16px', color: '#c0392b' }}>{flash}</div>}
        <div style={{ display: 'flex', gap: '10px', width: '100%', maxWidth: '860px' }}>
          <button onClick={() => setStudentIndex(Math.max(0, idx - 1))} disabled={idx === 0}
            style={{ flex: 1, fontSize: '18px', fontWeight: 600, padding: '16px', borderRadius: '14px', border: '1px solid var(--hairline)', background: '#fff', color: 'var(--ink)', opacity: idx === 0 ? 0.4 : 1 }}>‹ Nazaj</button>
          {idx < ordered.length - 1 ? (
            <button onClick={() => setStudentIndex(idx + 1)} style={{ flex: 1, ...bigBtn(), padding: '16px', fontSize: '18px' }}>Naprej ›</button>
          ) : (
            <button onClick={() => setConfirmSubmit(true)} style={{ flex: 1, ...bigBtn(), padding: '16px', fontSize: '18px' }}>Oddaj kviz</button>
          )}
        </div>
      </div>

      {confirmSubmit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 50 }}>
          <div style={{ ...card, textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 400, margin: '0 0 10px' }}>Oddam kviz?</h2>
            <p style={{ fontSize: '17px', color: answeredCount < ordered.length ? '#b7791f' : 'var(--muted)', margin: '0 0 20px' }}>
              {answeredCount < ordered.length ? `Neodgovorjenih vprašanj: ${ordered.length - answeredCount}. ` : 'Odgovoril si na vsa vprašanja. '}
              Po oddaji odgovorov ne moreš več spreminjati.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirmSubmit(false)} style={{ flex: 1, fontSize: '18px', padding: '16px', borderRadius: '14px', border: '1px solid var(--hairline)', background: '#fff', color: 'var(--ink)' }}>Še ne</button>
              <button onClick={async () => { setConfirmSubmit(false); try { await deviceSubmit(code, getDeviceId()); channel.current?.send('submit'); } catch { setNet('offline'); } void refresh(); }}
                style={{ flex: 1, ...bigBtn(), padding: '16px', fontSize: '18px' }}>Oddaj</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
