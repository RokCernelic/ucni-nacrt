'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useTaskSelection } from '@/hooks/useTaskSelection';
import { ANSWER_KINDS, type AnswerKind, type Task, type TaskDraft } from '@/lib/tasks/types';
import { BLOOM_3, BLOOM_6, classOfBloom, planTest, genRequestFor, type Slot } from '@/lib/tasks/buildTest';
import { btn, tinyLabel, input, Chip } from './ui';

const MAX_TOTAL = 40;
const PARALLEL = 3;

const kindName = (k: AnswerKind) => ANSWER_KINDS.find(a => a.id === k)?.name ?? k;
const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

type Phase = 'setup' | 'running' | 'done';
interface Result { slot: Slot; task: Task | null; error?: string }

/** Okno »Sestavi test«: iz nalog v trenutnem filtru izbere / generira test po zahtevani zgradbi. */
export default function BuildTest({ pool, onClose }: { pool: Task[]; onClose: () => void }) {
  const { save } = useTasks();
  const { selected, setMany } = useTaskSelection();

  const [total, setTotal] = useState(() => Math.min(10, Math.max(1, pool.length)));
  const [fine, setFine] = useState(false);
  const classes = fine ? BLOOM_6 : BLOOM_3;
  const [w3, setW3] = useState<Record<string, number>>({ l1: 40, l2: 40, l3: 20 });
  const [w6, setW6] = useState<Record<string, number>>({ b1: 20, b2: 20, b3: 20, b4: 20, b5: 10, b6: 10 });
  const bloomW = fine ? w6 : w3;
  const setBloomW = fine ? setW6 : setW3;

  // privzeta razporeditev oblik odgovora = kakršna je v filtru (zaokroženo na 5 %)
  const [kindW, setKindW] = useState<Partial<Record<AnswerKind, number>>>(() => {
    const cnt: Partial<Record<AnswerKind, number>> = {};
    for (const t of pool) cnt[t.answer_kind] = (cnt[t.answer_kind] ?? 0) + 1;
    const out: Partial<Record<AnswerKind, number>> = {};
    for (const k of ANSWER_KINDS) out[k.id] = cnt[k.id] ? Math.max(5, Math.round((cnt[k.id]! / Math.max(1, pool.length)) * 20) * 5) : 0;
    return out;
  });
  const [share, setShare] = useState(0);
  const [fillGaps, setFillGaps] = useState(true);
  const [seedKey, setSeedKey] = useState(() => String(Math.random()));

  const [phase, setPhase] = useState<Phase>('setup');
  const [progress, setProgress] = useState(0);
  const [genTotal, setGenTotal] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase !== 'running') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, phase]);
  useEffect(() => () => abort.current?.abort(), []);

  const spec = useMemo(() => ({ total, classes, bloomWeights: bloomW, kindWeights: kindW, generatedShare: share, fillGaps }), [total, classes, bloomW, kindW, share, fillGaps]);
  const plan = useMemo(() => planTest(pool, spec, seedKey), [pool, spec, seedKey]);

  // koliko nalog je v filtru po razredih in oblikah (informativno ob vnosnih poljih)
  const availBloom = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of pool) { const c = classOfBloom(classes, t.bloom); if (c) m[c.id] = (m[c.id] ?? 0) + 1; }
    return m;
  }, [pool, classes]);
  const availKind = useMemo(() => {
    const m: Partial<Record<AnswerKind, number>> = {};
    for (const t of pool) m[t.answer_kind] = (m[t.answer_kind] ?? 0) + 1;
    return m;
  }, [pool]);
  const noBloom = pool.filter(t => !t.bloom).length;

  const bloomSum = classes.reduce((s, c) => s + (bloomW[c.id] ?? 0), 0);
  const kindSum = ANSWER_KINDS.reduce((s, k) => s + (kindW[k.id] ?? 0), 0);
  const valid = total >= 1 && total <= MAX_TOTAL && bloomSum > 0 && kindSum > 0 && plan.slots.length === total;
  const needAi = plan.generated + plan.noSeed > 0;

  const build = async () => {
    setPhase('running'); setError(null); setProgress(0); setResults([]); setGenTotal(plan.generated);
    const ctl = new AbortController(); abort.current = ctl;
    const out: Result[] = plan.slots.map(slot => ({ slot, task: slot.task }));
    const todo = out.map((r, i) => ({ r, i })).filter(x => !x.r.task && x.r.slot.seed);
    let done = 0, next = 0;
    const worker = async () => {
      while (!ctl.signal.aborted) {
        const job = todo[next++]; if (!job) return;
        const { slot } = job.r;
        try {
          const { id: _id, created_at: _c, updated_at: _u, ...task } = slot.seed!; // eslint-disable-line @typescript-eslint/no-unused-vars
          const req = genRequestFor(slot, classes);
          const res = await fetch('/api/tasks/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
            body: JSON.stringify({ task, mode: 'similar', mods: req.mods, extra: req.extra }) });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? `Napaka ${res.status}`);
          const draft = data.draft as TaskDraft;
          // generirana naloga se shrani kot osnutek v bazo (ugnezdena pod izvirno), da jo je mogoče izbrati in pregledati
          const saved = await save({ ...draft, status: 'draft', source: 'ai', parent_id: slot.seed!.parent_id ?? slot.seed!.id });
          out[job.i] = { slot, task: saved };
        } catch (e) {
          if (ctl.signal.aborted) return;
          out[job.i] = { slot, task: null, error: e instanceof Error ? e.message : String(e) };
        }
        setProgress(++done);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
    if (ctl.signal.aborted) return;
    for (const r of out) if (!r.task && !r.error) r.error = 'V filtru ni nobene naloge, iz katere bi se dalo generirati.';
    const final = out.filter(r => r.task);
    // izbor v bazi: samo naloge tega testa
    setMany([...selected], false);
    setMany(final.map(r => r.task!.id), true);
    setResults(out);
    setPhase('done');
  };

  const cancel = () => { abort.current?.abort(); setPhase('setup'); };

  const field: React.CSSProperties = { ...input, width: '64px', padding: '4px 6px', textAlign: 'right' };
  const sectionLabel = (t: string) => <div style={{ ...tinyLabel, margin: '16px 0 6px' }}>{t}</div>;
  const got = results.filter(r => r.task);
  const gaps = results.filter(r => !r.task);
  const pts = got.reduce((s, r) => s + (r.task!.points || 0), 0);
  const mins = got.reduce((s, r) => s + (r.task!.minutes || 0), 0);
  const nGen = got.filter(r => !r.slot.task).length;

  return (
    <div onClick={() => phase !== 'running' && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,20,12,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--canvas)', borderRadius: 'var(--r-md)', width: '100%', maxWidth: '640px', padding: '22px 26px 24px', fontFamily: 'var(--font-sans)', boxShadow: '0 12px 40px rgba(0,0,0,.25)' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '26px', fontWeight: 400, margin: '0 0 4px', color: 'var(--ink)' }}>Sestavi test</h2>
        <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
          Naloge se izbirajo iz trenutnega filtra ({pool.length}). Po želji manjkajoče ali izbrani delež generira AI iz podobnih nalog.
        </p>

        {phase === 'setup' && (
          <>
            {sectionLabel('Število nalog')}
            <input type="number" min={1} max={MAX_TOTAL} value={total} onChange={e => setTotal(Math.min(MAX_TOTAL, Math.max(0, Math.floor(Number(e.target.value) || 0))))} style={field} />
            <span style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: '8px' }}>največ {MAX_TOTAL}</span>

            {sectionLabel('Delež po taksonomiji')}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <Chip active={!fine} onClick={() => setFine(false)}>3 stopnje</Chip>
              <Chip active={fine} onClick={() => setFine(true)}>6 stopenj (Bloom)</Chip>
            </div>
            {classes.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' }}>
                <span style={{ flex: 1, fontSize: '13px', color: 'var(--ink)' }}>{c.label}</span>
                <span style={{ fontSize: '11px', color: (availBloom[c.id] ?? 0) === 0 ? '#b7791f' : 'var(--muted)' }}>v filtru: {availBloom[c.id] ?? 0}</span>
                <input type="number" min={0} max={100} value={bloomW[c.id] ?? 0} onChange={e => setBloomW({ ...bloomW, [c.id]: Math.max(0, Number(e.target.value) || 0) })} style={field} />
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>%</span>
              </div>
            ))}
            <div style={{ fontSize: '11px', color: bloomSum === 100 ? 'var(--muted)' : '#b7791f', marginTop: '2px' }}>
              Skupaj {bloomSum} % {bloomSum !== 100 && bloomSum > 0 && '(razmerja se preračunajo na 100 %)'}
              {noBloom > 0 && ` · ${noBloom} nalog v filtru nima Bloomove stopnje in se ne uporabi`}
            </div>

            {sectionLabel('Delež po obliki odgovora')}
            {ANSWER_KINDS.map(k => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' }}>
                <span style={{ flex: 1, fontSize: '13px', color: 'var(--ink)' }}>{k.name}{k.quiz ? ' · kviz' : ''}</span>
                <span style={{ fontSize: '11px', color: (kindW[k.id] ?? 0) > 0 && !availKind[k.id] ? '#b7791f' : 'var(--muted)' }}>v filtru: {availKind[k.id] ?? 0}</span>
                <input type="number" min={0} max={100} value={kindW[k.id] ?? 0} onChange={e => setKindW({ ...kindW, [k.id]: Math.max(0, Number(e.target.value) || 0) })} style={field} />
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>%</span>
              </div>
            ))}
            <div style={{ fontSize: '11px', color: kindSum === 100 ? 'var(--muted)' : '#b7791f', marginTop: '2px' }}>
              Skupaj {kindSum} % {kindSum !== 100 && kindSum > 0 && '(razmerja se preračunajo na 100 %)'}
            </div>

            {sectionLabel('Iz baze ali generirano')}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>vse iz baze</span>
              <input type="range" min={0} max={100} step={10} value={share} onChange={e => setShare(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>vse generirano</span>
              <b style={{ fontSize: '13px', minWidth: '40px', textAlign: 'right' }}>{share} %</b>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--body)', marginTop: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={fillGaps} onChange={e => setFillGaps(e.target.checked)} />
              Kar v bazi manjka (stopnja ali oblika), generiraj
            </label>

            {/* predogled načrta */}
            <div style={{ marginTop: '18px', background: 'var(--surface)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: '12px', color: 'var(--body)', lineHeight: 1.6 }}>
              <b>Načrt:</b> {plan.slots.length} nalog — {plan.fromBank} iz baze, {plan.generated} generiranih
              {plan.mismatched > 0 && <span style={{ color: '#b7791f' }}> · {plan.mismatched} iz baze le približno ustreza (manjka v filtru)</span>}
              {plan.noSeed > 0 && <span style={{ color: '#c0392b' }}> · {plan.noSeed} mest ni mogoče zapolniti (v filtru ni nobene naloge)</span>}
              <br />
              <span style={{ color: 'var(--muted)' }}>
                {classes.map(c => `${c.id.replace(/^[lb]/, '')}: ${plan.slots.filter(s => s.classId === c.id).length}`).join(' · ')}
                {' · '}
                {ANSWER_KINDS.filter(k => plan.slots.some(s => s.kind === k.id)).map(k => `${k.name}: ${plan.slots.filter(s => s.kind === k.id).length}`).join(' · ')}
              </span>
              {needAi && <><br /><span style={{ color: 'var(--muted)' }}>Generiranje uporablja AI (plačljiv klic API na nalogo) in traja nekaj sekund na nalogo.</span></>}
            </div>

            {error && <p style={{ color: '#c0392b', fontSize: '12px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
              <button onClick={() => void build()} disabled={!valid || pool.length === 0}
                style={{ ...btn(true), padding: '8px 16px', opacity: valid && pool.length ? 1 : 0.45, cursor: valid && pool.length ? 'pointer' : 'not-allowed' }}>
                🧪 Sestavi test{plan.generated ? ` (generiram ${plan.generated})` : ''}
              </button>
              <button onClick={() => setSeedKey(String(Math.random()))} style={btn()} title="Drug naključni izbor nalog po istih nastavitvah">🎲 Drug izbor</button>
              <span style={{ flex: 1 }} />
              <button onClick={onClose} style={btn()}>Prekliči</button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <div style={{ marginTop: '20px' }}>
            <p style={{ fontSize: '13px', color: 'var(--ink)', margin: '0 0 8px' }}>Generiram naloge … {progress} / {genTotal}</p>
            <div style={{ height: '6px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${genTotal ? (progress / genTotal) * 100 : 100}%`, height: '100%', background: 'var(--forest)', transition: 'width .3s' }} />
            </div>
            <button onClick={cancel} style={{ ...btn(), marginTop: '14px' }}>Prekini</button>
          </div>
        )}

        {phase === 'done' && (
          <div style={{ marginTop: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--ink)', margin: '0 0 4px' }}>
              <b>Test je sestavljen: {got.length} {got.length === 1 ? 'naloga' : 'nalog'}</b>
              {pts > 0 && ` · ${String(pts).replace('.', ',')} točk`}{mins > 0 && ` · ${mins} min`}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
              Naloge so izbrane v bazi (spodaj se pokaže vrstica za tisk / kviz).
              {nGen > 0 && ` ${nGen} generiranih je shranjenih kot osnutek pod izvirno nalogo — preglej jih pred uporabo.`}
            </p>
            {gaps.length > 0 && (
              <div style={{ background: '#fdf6e3', borderRadius: 'var(--r-sm)', padding: '8px 10px', fontSize: '12px', color: '#8a5a00', marginBottom: '10px', lineHeight: 1.5 }}>
                {gaps.length} {gaps.length === 1 ? 'mesto ni zapolnjeno' : 'mest ni zapolnjenih'}: {gaps[0].error}
              </div>
            )}
            <ol style={{ margin: 0, paddingLeft: '22px', fontSize: '12px', color: 'var(--body)', lineHeight: 1.5 }}>
              {results.map((r, i) => (
                <li key={i} style={{ marginBottom: '3px', opacity: r.task ? 1 : 0.5 }}>
                  <span style={{ color: 'var(--muted)' }}>
                    [{classes.find(c => c.id === r.slot.classId)?.id.replace(/^[lb]/, '') ?? '?'} · {kindName(r.slot.kind)}{r.task && !r.slot.task ? ' · AI' : ''}{r.slot.mismatch ? ' · približno' : ''}]
                  </span>{' '}
                  {r.task ? plain(r.task.body).slice(0, 110) + (plain(r.task.body).length > 110 ? ' …' : '') : '(prazno mesto)'}
                </li>
              ))}
            </ol>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={onClose} style={{ ...btn(true), padding: '8px 16px' }}>Zapri</button>
              <button onClick={() => setPhase('setup')} style={btn()}>← Nastavitve</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
