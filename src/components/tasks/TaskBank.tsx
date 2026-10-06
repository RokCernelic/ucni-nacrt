'use client';

import { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useTasks } from '@/hooks/useTasks';
import { useTaskSelection } from '@/hooks/useTaskSelection';
import { BLOOM, DIFFICULTY, KINDS, ANSWER_KINDS, SOURCES, type Task, type BloomLevel, type Difficulty, type TaskKind, type AnswerKind } from '@/lib/tasks/types';
import { allCurricula, topicsOf, topicInfo, hasMinimalStandard } from '@/lib/tasks/topics';
import TaskList from './TaskList';
import { plural } from '@/lib/quiz/format';
import PrintTasks from './PrintTasks';
import ImportTasks from './ImportTasks';
import { plainKey } from '@/lib/tasks/import';
import { Chip, tinyLabel, input, btn } from './ui';

const plain = (html: string | null) => (html ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').toLowerCase();
const toggleIn = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <span style={{ ...tinyLabel, minWidth: '78px' }}>{label}</span>
      {children}
    </div>
  );
}

export default function TaskBank() {
  const { user, loading } = useAuth();
  const { tasks, loaded, error, removeMany } = useTasks();
  const { selected, setMany } = useTaskSelection();

  const [q, setQ] = useState('');
  const [currs, setCurrs] = useState<Set<string>>(new Set());
  const [grades, setGrades] = useState<Set<number>>(new Set());
  const [chapters, setChapters] = useState<Set<string>>(new Set());
  const [topicSel, setTopicSel] = useState<Set<string>>(new Set());
  const [diff, setDiff] = useState<Set<Difficulty>>(new Set());
  const [bloom, setBloom] = useState<Set<BloomLevel>>(new Set());
  const [kinds, setKinds] = useState<Set<TaskKind>>(new Set());
  const [aks, setAks] = useState<Set<AnswerKind>>(new Set());
  const [source, setSource] = useState('');
  const [status, setStatus] = useState<'' | 'verified' | 'draft'>('');
  const [onlyMin, setOnlyMin] = useState(false);
  const [noTopic, setNoTopic] = useState(false);
  const [sheetTitle, setSheetTitle] = useState('Učni list');

  // ponudba filtrov učnega načrta: vsak naslednji nivo le v okviru izbranega
  const allTopics = useMemo(() => allCurricula().flatMap(c => topicsOf(c.id)), []);
  const gradeOptions = useMemo(() => Array.from(new Set(allTopics.filter(t => !currs.size || currs.has(t.curriculum)).map(t => t.grade).filter((g): g is number => !!g))).sort((a, b) => b - a), [allTopics, currs]);
  const inScope = useMemo(() => allTopics.filter(t => (!currs.size || currs.has(t.curriculum)) && (!grades.size || (t.grade !== null && grades.has(t.grade)))), [allTopics, currs, grades]);
  const chapterOptions = useMemo(() => {
    const m = new Map<string, { key: string; label: string; grade: number | null; predmet: string }>();
    for (const t of inScope) if (!m.has(t.chapterKey)) m.set(t.chapterKey, { key: t.chapterKey, label: t.chapter, grade: t.grade, predmet: t.predmet });
    return [...m.values()];
  }, [inScope]);
  const topicOptions = useMemo(() => inScope.filter(t => chapters.has(t.chapterKey)), [inScope, chapters]);

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return tasks.filter((t: Task) => {
      if (words.length) {
        const hay = `${plain(t.body)} ${plain(t.answer)} ${plain(t.solution)} ${t.tags.join(' ').toLowerCase()} ${(t.options ?? []).map(o => o.text).join(' ').toLowerCase()}`;
        if (!words.every(w => hay.includes(w))) return false;
      }
      if (currs.size && !(t.curriculum && currs.has(t.curriculum)) && !t.topics.some(k => currs.has(k.split(':')[0]))) return false;
      if (grades.size && !t.topics.some(k => { const g = topicInfo(k)?.grade; return g != null && grades.has(g); })) return false;
      if (chapters.size && !t.topics.some(k => { const c = topicInfo(k)?.chapterKey; return !!c && chapters.has(c); })) return false;
      if (topicSel.size && !t.topics.some(k => topicSel.has(k))) return false;
      if (diff.size && !(t.difficulty && diff.has(t.difficulty))) return false;
      if (bloom.size && !(t.bloom && bloom.has(t.bloom))) return false;
      if (kinds.size && !t.kinds.some(k => kinds.has(k))) return false;
      if (aks.size && !aks.has(t.answer_kind)) return false;
      if (source && t.source !== source) return false;
      if (status && t.status !== status) return false;
      if (onlyMin && !hasMinimalStandard(t.standards, t.topics)) return false;
      if (noTopic && t.topics.length) return false;
      return true;
    });
  }, [tasks, q, currs, grades, chapters, topicSel, diff, bloom, kinds, aks, source, status, onlyMin, noTopic]);

  // dvojniki (enako besedilo) — npr. po dvakratnem uvozu iste datoteke; obdrži najstarejšo
  const duplicates = useMemo(() => {
    const seen = new Map<string, Task>();
    const extra: string[] = [];
    for (const t of [...tasks].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const k = plainKey(t.body);
      if (seen.has(k)) extra.push(t.id); else seen.set(k, t);
    }
    return extra;
  }, [tasks]);
  const [dedupBusy, setDedupBusy] = useState(false);
  const dedup = async () => {
    if (!confirm(`Odstranim ${duplicates.length} podvojenih nalog (enako besedilo)? Od vsake ostane najstarejša.`)) return;
    setDedupBusy(true);
    try { await removeMany(duplicates); setMany(duplicates, false); } finally { setDedupBusy(false); }
  };

  // vrstni red podpoglavij kot v učnem načrtu (po predmetih, razredih, poglavjih)
  const topicOrder = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const c of allCurricula()) for (const t of topicsOf(c.id)) m.set(t.key, n++);
    return m;
  }, []);
  const primaryTopic = useCallback((t: Task) => [...t.topics].sort((a, b) => (topicOrder.get(a) ?? 1e9) - (topicOrder.get(b) ?? 1e9))[0] ?? '', [topicOrder]);
  const ordered = useMemo(() => [...filtered].sort((a, b) =>
    (topicOrder.get(primaryTopic(a)) ?? 1e9) - (topicOrder.get(primaryTopic(b)) ?? 1e9) || a.created_at.localeCompare(b.created_at)),
  [filtered, topicOrder, primaryTopic]);
  // poglavje → podpoglavja → naloge (naloga z več podpoglavji je pri prvem)
  const groups = useMemo(() => {
    const out: { chapter: string; topics: { key: string; title: string; tasks: Task[] }[] }[] = [];
    for (const t of ordered) {
      const key = primaryTopic(t);
      const info = key ? topicInfo(key) : null;
      const chapter = info ? `${info.grade ? `${info.grade}. razred · ` : ''}${info.chapter}` : 'Brez podpoglavja';
      let g = out[out.length - 1];
      if (!g || g.chapter !== chapter) { g = { chapter, topics: [] }; out.push(g); }
      let sub = g.topics[g.topics.length - 1];
      if (!sub || sub.key !== key) { sub = { key, title: info ? `${info.number} ${info.title}` : '', tasks: [] }; g.topics.push(sub); }
      sub.tasks.push(t);
    }
    return out;
  }, [ordered, primaryTopic]);

  const selectedInView = ordered.filter(t => selected.has(t.id));
  const allSelected = filtered.length > 0 && selectedInView.length === filtered.length;
  const anyFilter = q || currs.size || grades.size || chapters.size || topicSel.size || diff.size || bloom.size || kinds.size || aks.size || source || status || onlyMin || noTopic;
  const reset = () => { setQ(''); setCurrs(new Set()); setGrades(new Set()); setChapters(new Set()); setTopicSel(new Set()); setDiff(new Set()); setBloom(new Set()); setKinds(new Set()); setAks(new Set()); setSource(''); setStatus(''); setOnlyMin(false); setNoTopic(false); };

  if (loading) return null;

  return (
    <div>
      <div style={{ background: 'var(--forest)', padding: '28px 32px 24px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 6px' }}>Kvizi</p>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px,4vw,48px)', fontWeight: 300, color: '#fff', lineHeight: 1 }}>Baza nalog</h1>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '1000px', margin: '0 auto', padding: '24px 32px 80px', fontFamily: 'var(--font-sans)' }}>
        {!user ? (
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>Za bazo nalog se <Link href="/login" style={{ color: 'var(--forest)', fontWeight: 500 }}>prijavite</Link>.</p>
        ) : (
          <>
            {/* filtri */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Išči po besedilu, rešitvi, ključnikih …" style={{ ...input, flex: '1 1 260px' }} />
              </div>
              <Row label="Predmet">
                {allCurricula().map(c => (
                  <Chip key={c.id} active={currs.has(c.id)} onClick={() => { setCurrs(toggleIn(currs, c.id)); setChapters(new Set()); setTopicSel(new Set()); }}>{c.name}</Chip>
                ))}
              </Row>
              <Row label="Razred">
                {gradeOptions.map(g => (
                  <Chip key={g} active={grades.has(g)} onClick={() => { setGrades(toggleIn(grades, g)); setChapters(new Set()); setTopicSel(new Set()); }}>{g}. razred</Chip>
                ))}
              </Row>
              <Row label="Poglavje">
                {chapterOptions.map(c => (
                  <Chip key={c.key} active={chapters.has(c.key)} title={`${c.predmet}${c.grade ? ` · ${c.grade}. razred` : ''}`}
                    onClick={() => { const next = toggleIn(chapters, c.key); setChapters(next); setTopicSel(new Set([...topicSel].filter(k => next.has(topicInfo(k)?.chapterKey ?? '')))); }}>
                    {c.label}
                  </Chip>
                ))}
              </Row>
              {topicOptions.length > 0 && (
                <Row label="Podpoglavje">
                  {topicOptions.map(t => <Chip key={t.key} active={topicSel.has(t.key)} onClick={() => setTopicSel(toggleIn(topicSel, t.key))}>{t.number} {t.title}</Chip>)}
                </Row>
              )}
              <Row label="Težavnost">{DIFFICULTY.map(d => <Chip key={d.level} active={diff.has(d.level)} color={d.color} onClick={() => setDiff(toggleIn(diff, d.level))}>{d.name}</Chip>)}</Row>
              <Row label="Bloom">{BLOOM.map(b => <Chip key={b.level} active={bloom.has(b.level)} color={b.color} title={b.hint} onClick={() => setBloom(toggleIn(bloom, b.level))}>{b.level} · {b.name}</Chip>)}</Row>
              <Row label="Vrsta">{KINDS.map(k => <Chip key={k.id} active={kinds.has(k.id)} onClick={() => setKinds(toggleIn(kinds, k.id))}>{k.name}</Chip>)}</Row>
              <Row label="Odgovor">{ANSWER_KINDS.map(a => <Chip key={a.id} active={aks.has(a.id)} onClick={() => setAks(toggleIn(aks, a.id))}>{a.name}{a.quiz ? ' ·kviz' : ''}</Chip>)}</Row>
              <Row label="Ostalo">
                <select value={source} onChange={e => setSource(e.target.value)} style={{ ...input, padding: '3px 6px', fontSize: '12px' }}>
                  <option value="">vsi viri</option>
                  {SOURCES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <Chip active={status === 'verified'} onClick={() => setStatus(status === 'verified' ? '' : 'verified')}>preverjene</Chip>
                <Chip active={status === 'draft'} color="#b7791f" onClick={() => setStatus(status === 'draft' ? '' : 'draft')}>osnutki</Chip>
                <Chip active={onlyMin} onClick={() => setOnlyMin(!onlyMin)} title="Naloge, ki preverjajo vsaj en minimalni standard znanja">minimalni standardi (M)</Chip>
                <Chip active={noTopic} onClick={() => setNoTopic(!noTopic)} title="Naloge, ki še niso povezane z učnim načrtom">brez podpoglavja</Chip>
                {anyFilter && <button onClick={reset} style={{ ...btn(), padding: '3px 9px', fontSize: '11px' }}>počisti filtre</button>}
              </Row>
            </div>

            {/* izbor + tisk */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {loaded ? <>{anyFilter ? `${filtered.length} od ${tasks.length} nalog` : `${tasks.length} ${plural(tasks.length, 'naloga', 'nalogi', 'naloge', 'nalog')}`}</> : 'Nalagam …'}
              </span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={allSelected} disabled={!filtered.length} onChange={e => setMany(filtered.map(t => t.id), e.target.checked)} />
                izberi vse{anyFilter ? ' (v filtru)' : ''}
              </label>
              <ImportTasks />
              {duplicates.length > 0 && (
                <button onClick={() => void dedup()} disabled={dedupBusy}
                  style={{ ...btn(), color: '#b7791f', borderColor: '#ecd9a8', opacity: dedupBusy ? 0.5 : 1 }}>
                  {dedupBusy ? 'Odstranjujem …' : `⚠ ${duplicates.length} dvojnikov — odstrani`}
                </button>
              )}
              <span style={{ flex: 1 }} />
              <input value={sheetTitle} onChange={e => setSheetTitle(e.target.value)} title="Naslov učnega lista" style={{ ...input, width: '170px', padding: '4px 8px' }} />
              <PrintTasks tasks={selectedInView} title={sheetTitle} />
            </div>

            {error && <p style={{ color: '#c0392b', fontSize: '13px' }}>{error}</p>}
            {loaded && (
              <>
                <TaskList tasks={[]} emptyText={anyFilter && !ordered.length ? 'Ni nalog, ki ustrezajo filtrom.' : !tasks.length ? 'Baza je še prazna. Dodaj prvo nalogo.' : undefined} />
                {(() => {
                  let n = 0;
                  return groups.map(g => (
                    <section key={g.chapter} style={{ marginTop: '26px' }}>
                      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', fontWeight: 400, color: 'var(--ink)', margin: '0 0 10px', borderBottom: '1px solid var(--hairline)', paddingBottom: '6px' }}>
                        {g.chapter}
                      </h2>
                      {g.topics.map(sub => {
                        const start = n; n += sub.tasks.length;
                        return (
                          <div key={sub.key || 'none'} style={{ marginBottom: '18px' }}>
                            {sub.title && (
                              <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: 'var(--forest)', margin: '0 0 8px' }}>
                                {sub.title} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· {sub.tasks.length}</span>
                              </h3>
                            )}
                            <TaskList tasks={sub.tasks} hideTopic={sub.key} showAdd={false} startIndex={start} />
                          </div>
                        );
                      })}
                    </section>
                  ));
                })()}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
