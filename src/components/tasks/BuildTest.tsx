'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useRouter } from 'next/navigation';
import { useQuizLibrary } from '@/hooks/useQuizLibrary';
import { tasksToQuestions } from '@/lib/tasks/toQuiz';
import { orderTasks } from '@/lib/tasks/order';
import { ANSWER_GROUPS, answerGroupOf, LETTERS, isChoice, correctIds, type AnswerKind, type Task, type TaskDraft } from '@/lib/tasks/types';
import { BLOOM_3, BLOOM_6, apportion, classOfBloom, planTest, genRequestFor, type Slot } from '@/lib/tasks/buildTest';
import { btn, tinyLabel, input, Chip, Rich, TaskAnswer } from './ui';

const MAX_TOTAL = 40;
const PARALLEL = 3;

function SliderRow({ label, info, warn, value, onChange, locked, canLock, onToggleLock }: {
  label: string; info: string; warn?: boolean; value: number; onChange: (v: number) => void;
  locked: boolean; canLock: boolean; onToggleLock: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '3px 0' }}>
      <span style={{ flex: '0 0 210px', fontSize: '13px', color: 'var(--ink)' }}>{label}</span>
      <input type="range" min={0} max={100} step={1} value={value} disabled={locked} onChange={e => onChange(Number(e.target.value))} style={{ flex: 1, minWidth: 0, opacity: locked ? 0.45 : 1 }} />
      <b style={{ width: '40px', textAlign: 'right', fontSize: '13px' }}>{value} %</b>
      <button type="button" onClick={onToggleLock} disabled={!locked && !canLock}
        title={locked ? 'Odkleni drsnik' : canLock ? 'Zakleni vrednost: drsnik se ne spreminja, ko premikaš druge' : 'Vsaj dva drsnika morata ostati odklenjena'}
        style={{ width: '28px', height: '26px', borderRadius: '4px', cursor: locked || canLock ? 'pointer' : 'not-allowed', fontSize: '13px', lineHeight: 1, opacity: !locked && !canLock ? 0.3 : 1,
          border: `1px solid ${locked ? 'var(--forest)' : 'var(--hairline)'}`, background: locked ? 'var(--forest)' : 'transparent', color: locked ? '#fff' : 'var(--muted)' }}>
        {locked ? '🔒' : '🔓'}
      </button>
      <span style={{ width: '74px', fontSize: '11px', color: warn ? '#b7791f' : 'var(--muted)' }}>{info}</span>
    </div>
  );
}

const kindName = (k: AnswerKind) => ANSWER_GROUPS.find(a => a.id === answerGroupOf(k))?.name ?? k;
const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Premik enega drsnika: preostanek do 100 % se razdeli med NEZAKLENJENE ostale v razmerju njihovih vrednosti
 * (cela števila, vsota = 100). Zaklenjeni drsniki ostanejo, kjer so; premaknjeni drsnik ne more preseči 100 % − zaklenjeno.
 */
function rebalance<K extends string>(vals: Record<K, number>, id: K, value: number, locked: Set<string>): Record<K, number> {
  const others = (Object.keys(vals) as K[]).filter(k => k !== id);
  const free = others.filter(k => !locked.has(k));
  if (!free.length) return vals;
  const lockedSum = others.filter(k => locked.has(k)).reduce((a, k) => a + (vals[k] || 0), 0);
  const v = Math.min(100 - lockedSum, Math.max(0, Math.round(value)));
  const sum = free.reduce((a, k) => a + (vals[k] || 0), 0);
  const w = Object.fromEntries(free.map(k => [k, sum > 0 ? vals[k] || 0 : 1]));
  return { ...vals, ...apportion(100 - lockedSum - v, w), [id]: v } as Record<K, number>;
}

type Phase = 'setup' | 'running' | 'done';
/** `task` = naloga iz baze; `draft` = generirana, še neshranjena; `keep` = ostane v kvizu */
interface Result { slot: Slot; task: Task | null; draft?: TaskDraft; error?: string; keep: boolean }

/** Okno »Generiraj kviz«: iz nalog v trenutnem filtru sestavi (ali generira) kviz po zahtevani zgradbi; ob potrditvi pristane v seznamu Kvizi. */
export default function BuildTest({ pool, defaultTitle, onClose }: { pool: Task[]; defaultTitle: string; onClose: () => void }) {
  const { save } = useTasks();
  const router = useRouter();
  const lib = useQuizLibrary();
  const [quizTitle, setQuizTitle] = useState(defaultTitle);

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
    for (const t of pool) { const g = answerGroupOf(t.answer_kind); cnt[g] = (cnt[g] ?? 0) + 1; }
    const any = pool.length > 0;
    return apportion(100, Object.fromEntries(ANSWER_GROUPS.map(k => [k.id, any ? cnt[k.id] ?? 0 : 1]))) as Partial<Record<AnswerKind, number>>;
  });
  const [lockedB, setLockedB] = useState<Set<string>>(new Set());
  const [lockedK, setLockedK] = useState<Set<string>>(new Set());
  const toggleLock = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); setSet(n); };
  const [share, setShare] = useState(0);
  const [fillGaps, setFillGaps] = useState(true);
  const [seedKey, setSeedKey] = useState(() => String(Math.random()));

  const [phase, setPhase] = useState<Phase>('setup');
  const [progress, setProgress] = useState(0);
  const [genTotal, setGenTotal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [regen, setRegen] = useState<number | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase === 'setup') onClose(); };
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
    for (const t of pool) { const g = answerGroupOf(t.answer_kind); m[g] = (m[g] ?? 0) + 1; }
    return m;
  }, [pool]);
  const noBloom = pool.filter(t => !t.bloom).length;

  const bloomSum = classes.reduce((s, c) => s + (bloomW[c.id] ?? 0), 0);
  const kindSum = ANSWER_GROUPS.reduce((s, k) => s + (kindW[k.id] ?? 0), 0);
  const valid = total >= 1 && total <= MAX_TOTAL && bloomSum > 0 && kindSum > 0 && plan.slots.length === total;
  const needAi = plan.generated + plan.noSeed > 0;

  /** Ena generirana naloga za mesto `slot` (iz njegove izhodiščne naloge). */
  const generateFor = async (slot: Slot, signal?: AbortSignal): Promise<TaskDraft> => {
    const { id: _id, created_at: _c, updated_at: _u, ...task } = slot.seed!; // eslint-disable-line @typescript-eslint/no-unused-vars
    const req = genRequestFor(slot, classes);
    const res = await fetch('/api/tasks/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ task, mode: 'similar', mods: req.mods, extra: req.extra }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Napaka ${res.status}`);
    return data.draft as TaskDraft;
  };

  /** Zamenjaj nalogo na mestu `i` z novo generirano (iz iste izhodiščne naloge, ista stopnja in oblika). */
  const regenerate = async (i: number) => {
    const r = results[i];
    const seed = r.slot.seed ?? r.task;
    if (!seed || regen !== null) return;
    setRegen(i); setError(null);
    try {
      const slot: Slot = { ...r.slot, seed, kind: r.slot.kind };
      const draft = await generateFor(slot);
      setResults(rs => rs.map((x, j) => (j === i ? { slot, task: null, draft, keep: true } : x)));
    } catch (e) { setError(`Naloga ${i + 1}: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setRegen(null); }
  };

  const build = async () => {
    setPhase('running'); setError(null); setProgress(0); setResults([]); setGenTotal(plan.generated);
    const ctl = new AbortController(); abort.current = ctl;
    const out: Result[] = plan.slots.map(slot => ({ slot, task: slot.task, keep: true }));
    const todo = out.map((r, i) => ({ r, i })).filter(x => !x.r.task && x.r.slot.seed);
    let done = 0, next = 0;
    const worker = async () => {
      while (!ctl.signal.aborted) {
        const job = todo[next++]; if (!job) return;
        const { slot } = job.r;
        try {
          // generirana naloga se v bazo shrani šele ob potrditvi (po pregledu)
          out[job.i] = { slot, task: null, draft: await generateFor(slot, ctl.signal), keep: true };
        } catch (e) {
          if (ctl.signal.aborted) return;
          out[job.i] = { slot, task: null, error: e instanceof Error ? e.message : String(e), keep: false };
        }
        setProgress(++done);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
    if (ctl.signal.aborted) return;
    for (const r of out) if (!r.task && !r.draft && !r.error) { r.keep = false; r.error = 'V filtru ni nobene naloge, iz katere bi se dalo generirati.'; }
    setResults(out);
    setPhase('done');
  };

  const cancel = () => { abort.current?.abort(); setPhase('setup'); };

  const field: React.CSSProperties = { ...input, width: '64px', padding: '4px 6px', textAlign: 'right' };
  const sectionLabel = (t: string) => <div style={{ ...tinyLabel, margin: '16px 0 6px' }}>{t}</div>;
  const got = results.filter(r => (r.task || r.draft) && r.keep);
  const gaps = results.filter(r => !r.task && !r.draft);
  const item = (r: Result) => (r.task ?? r.draft)!;
  const pts = got.reduce((s, r) => s + (item(r).points || 0), 0);
  const mins = got.reduce((s, r) => s + (item(r).minutes || 0), 0);
  const nGen = got.filter(r => r.draft).length;
  const setKeep = (i: number, keep: boolean) => setResults(rs => rs.map((r, j) => (j === i ? { ...r, keep } : r)));

  /** Potrdi kviz: shrani obdržane generirane naloge (osnutki pod izvirno nalogo) in ustvari kviz v knjižnici Kvizi. */
  const confirmQuiz = async () => {
    setSaving(true); setError(null);
    try {
      const tasks: Task[] = [];
      for (const r of got) {
        if (r.task) { tasks.push(r.task); continue; }
        tasks.push(await save({ ...r.draft!, status: 'draft', source: 'ai', parent_id: r.slot.seed!.parent_id ?? r.slot.seed!.id }));
      }
      const { questions } = tasksToQuestions(orderTasks(tasks));
      lib.createQuizFrom(quizTitle || 'Nov kviz', questions);
      onClose();
      router.push('/kvizi');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={() => phase === 'setup' && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,20,12,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--canvas)', borderRadius: 'var(--r-md)', width: '100%', maxWidth: '640px', padding: '22px 26px 24px', fontFamily: 'var(--font-sans)', boxShadow: '0 12px 40px rgba(0,0,0,.25)' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '26px', fontWeight: 400, margin: '0 0 4px', color: 'var(--ink)' }}>Generiraj kviz</h2>
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
              <Chip active={!fine} onClick={() => { setFine(false); setLockedB(new Set()); }}>3 stopnje</Chip>
              <Chip active={fine} onClick={() => { setFine(true); setLockedB(new Set()); }}>6 stopenj (Bloom)</Chip>
            </div>
            {classes.map(c => (
              <SliderRow key={c.id} label={c.label} info={`v filtru: ${availBloom[c.id] ?? 0}`} warn={(availBloom[c.id] ?? 0) === 0}
                value={bloomW[c.id] ?? 0} onChange={v => setBloomW(rebalance(bloomW, c.id, v, lockedB))}
                locked={lockedB.has(c.id)} canLock={classes.length - lockedB.size > 2 && !lockedB.has(c.id)} onToggleLock={() => toggleLock(lockedB, setLockedB, c.id)} />
            ))}
            {noBloom > 0 && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{noBloom} nalog v filtru nima Bloomove stopnje in se ne uporabi.</div>}

            {sectionLabel('Delež po obliki odgovora')}
            {ANSWER_GROUPS.map(k => (
              <SliderRow key={k.id} label={`${k.name}${k.quiz ? ' · kviz' : ''}`} info={`v filtru: ${availKind[k.id] ?? 0}`} warn={(kindW[k.id] ?? 0) > 0 && !availKind[k.id]}
                value={kindW[k.id] ?? 0} onChange={v => setKindW(rebalance(kindW as Record<AnswerKind, number>, k.id, v, lockedK))}
                locked={lockedK.has(k.id)} canLock={ANSWER_GROUPS.length - lockedK.size > 2 && !lockedK.has(k.id)} onToggleLock={() => toggleLock(lockedK, setLockedK, k.id)} />
            ))}

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
                {ANSWER_GROUPS.filter(k => plan.slots.some(s => s.kind === k.id)).map(k => `${k.name}: ${plan.slots.filter(s => s.kind === k.id).length}`).join(' · ')}
              </span>
              {needAi && <><br /><span style={{ color: 'var(--muted)' }}>Generiranje uporablja AI (plačljiv klic API na nalogo) in traja nekaj sekund na nalogo.</span></>}
            </div>

            {error && <p style={{ color: '#c0392b', fontSize: '12px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
              <button onClick={() => void build()} disabled={!valid || pool.length === 0}
                style={{ ...btn(true), padding: '8px 16px', opacity: valid && pool.length ? 1 : 0.45, cursor: valid && pool.length ? 'pointer' : 'not-allowed' }}>
                🧪 Generiraj kviz{plan.generated ? ` (generiram ${plan.generated})` : ''}
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
            <div style={{ ...tinyLabel, margin: '0 0 4px' }}>Naslov kviza</div>
            <input value={quizTitle} onChange={e => setQuizTitle(e.target.value)} style={{ ...input, width: '100%', marginBottom: '12px' }} />
            <p style={{ fontSize: '13px', color: 'var(--ink)', margin: '0 0 4px' }}>
              <b>Kviz: {got.length} {got.length === 1 ? 'naloga' : 'nalog'}</b>
              {pts > 0 && ` · ${String(pts).replace('.', ',')} točk`}{mins > 0 && ` · ${mins} min`}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
              Pregled: z odkljukanjem nalogo izločiš iz kviza. {nGen > 0 && `${nGen} generiranih še ni v bazi — shranijo se šele, ko kviz ustvariš (kot osnutki pod izvirno nalogo). Kviz se pojavi v seznamu Kvizi, kjer ga zaženeš ali natisneš.`}
            </p>
            {gaps.length > 0 && (
              <div style={{ background: '#fdf6e3', borderRadius: 'var(--r-sm)', padding: '8px 10px', fontSize: '12px', color: '#8a5a00', marginBottom: '10px', lineHeight: 1.5 }}>
                {gaps.length} {gaps.length === 1 ? 'mesto ni zapolnjeno' : 'mest ni zapolnjenih'}: {gaps[0].error}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {results.map((r, i) => {
                if (!r.task && !r.draft) return null;
                const t = item(r);
                const label = `${classes.find(c => c.id === r.slot.classId)?.id.replace(/^[lb]/, '') ?? '?'} · ${kindName(t.answer_kind)}${r.draft ? ' · AI (novo)' : ''}${r.slot.mismatch ? ' · približno' : ''}`;
                const asTask = t as Task;
                return (
                  <div key={i} style={{ border: `1px solid ${r.draft ? '#ecd9a8' : 'var(--hairline)'}`, borderRadius: 'var(--r-sm)', padding: '8px 10px', opacity: r.keep ? 1 : 0.45, background: r.draft ? '#fffdf6' : 'transparent' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--muted)', cursor: 'pointer', marginBottom: '4px' }}>
                      <input type="checkbox" checked={r.keep} onChange={e => setKeep(i, e.target.checked)} />
                      <b style={{ color: r.draft ? '#8a5a00' : 'var(--forest)' }}>{i + 1}.</b> {label}
                      <span style={{ flex: 1 }} />
                      <button type="button" onClick={e => { e.preventDefault(); void regenerate(i); }} disabled={regen !== null || saving}
                        title="Zamenja to nalogo z novo, generirano iz podobne (ista stopnja in oblika odgovora)"
                        style={{ ...btn(), padding: '2px 8px', fontSize: '11px', opacity: regen !== null ? 0.5 : 1 }}>
                        {regen === i ? 'Generiram …' : '🔄 Generiraj drugo'}
                      </button>
                    </label>
                    {r.draft ? (
                      <div style={{ fontSize: '13px', color: 'var(--ink)' }}>
                        <Rich html={t.body} />
                        {isChoice(t.answer_kind) && t.options && (
                          <ol style={{ margin: '4px 0', paddingLeft: '4px', listStyle: 'none', fontSize: '12px' }}>
                            {t.options.map((o, j) => <li key={o.id} style={{ fontWeight: correctIds(t).includes(o.id) ? 700 : 400, color: correctIds(t).includes(o.id) ? 'var(--green-ok)' : 'inherit' }}>{LETTERS[j]}) {o.text}</li>)}
                          </ol>
                        )}
                        <div style={{ fontSize: '12px', color: 'var(--body)', marginTop: '4px' }}>
                          <b>Odgovor:</b> <TaskAnswer task={asTask} />
                        </div>
                        {t.solution && <details style={{ fontSize: '12px', marginTop: '3px' }}><summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>rešitev</summary><Rich html={t.solution} /></details>}
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'var(--body)', lineHeight: 1.5 }}>{plain(t.body).slice(0, 160) + (plain(t.body).length > 160 ? ' …' : '')}</div>
                    )}
                  </div>
                );
              })}
            </div>
            {error && <p style={{ color: '#c0392b', fontSize: '12px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
              <button onClick={() => void confirmQuiz()} disabled={saving || got.length === 0 || !quizTitle.trim()}
                style={{ ...btn(true), padding: '8px 16px', opacity: saving || !got.length || !quizTitle.trim() ? 0.5 : 1 }}>
                {saving ? 'Shranjujem …' : `✓ Ustvari kviz (${got.length})`}
              </button>
              <button onClick={() => setPhase('setup')} disabled={saving} style={btn()}>← Nastavitve</button>
              <span style={{ flex: 1 }} />
              <button onClick={onClose} disabled={saving} style={btn()}>Zavrzi</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
