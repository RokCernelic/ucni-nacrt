'use client';

import { useMemo, useState } from 'react';
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
  const [curr, setCurr] = useState('');
  const [grade, setGrade] = useState('');
  const [topic, setTopic] = useState('');
  const [diff, setDiff] = useState<Set<Difficulty>>(new Set());
  const [bloom, setBloom] = useState<Set<BloomLevel>>(new Set());
  const [kinds, setKinds] = useState<Set<TaskKind>>(new Set());
  const [aks, setAks] = useState<Set<AnswerKind>>(new Set());
  const [source, setSource] = useState('');
  const [status, setStatus] = useState<'' | 'verified' | 'draft'>('');
  const [onlyMin, setOnlyMin] = useState(false);
  const [noTopic, setNoTopic] = useState(false);
  const [sheetTitle, setSheetTitle] = useState('Učni list');

  const topicOptions = useMemo(() => (curr ? topicsOf(curr) : []).filter(t => !grade || String(t.grade) === grade), [curr, grade]);
  const grades = useMemo(() => Array.from(new Set((curr ? topicsOf(curr) : []).map(t => t.grade).filter(Boolean))) as number[], [curr]);

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return tasks.filter((t: Task) => {
      if (words.length) {
        const hay = `${plain(t.body)} ${plain(t.answer)} ${plain(t.solution)} ${t.tags.join(' ').toLowerCase()} ${(t.options ?? []).map(o => o.text).join(' ').toLowerCase()}`;
        if (!words.every(w => hay.includes(w))) return false;
      }
      if (curr && t.curriculum !== curr && !t.topics.some(k => k.startsWith(`${curr}:`))) return false;
      if (grade && !t.topics.some(k => String(topicInfo(k)?.grade) === grade)) return false;
      if (topic && !t.topics.includes(topic)) return false;
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
  }, [tasks, q, curr, grade, topic, diff, bloom, kinds, aks, source, status, onlyMin, noTopic]);

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

  const selectedInView = filtered.filter(t => selected.has(t.id));
  const allSelected = filtered.length > 0 && selectedInView.length === filtered.length;
  const anyFilter = q || curr || grade || topic || diff.size || bloom.size || kinds.size || aks.size || source || status || onlyMin || noTopic;
  const reset = () => { setQ(''); setCurr(''); setGrade(''); setTopic(''); setDiff(new Set()); setBloom(new Set()); setKinds(new Set()); setAks(new Set()); setSource(''); setStatus(''); setOnlyMin(false); setNoTopic(false); };

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
                <select value={curr} onChange={e => { setCurr(e.target.value); setGrade(''); setTopic(''); }} style={input}>
                  <option value="">vsi predmeti</option>
                  {allCurricula().map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {curr && (
                  <select value={grade} onChange={e => { setGrade(e.target.value); setTopic(''); }} style={input}>
                    <option value="">vsi razredi</option>
                    {grades.map(g => <option key={g} value={g}>{g}. razred</option>)}
                  </select>
                )}
                {curr && (
                  <select value={topic} onChange={e => setTopic(e.target.value)} style={{ ...input, maxWidth: '260px' }}>
                    <option value="">vsa podpoglavja</option>
                    {topicOptions.map(t => <option key={t.key} value={t.key}>{t.grade ? `${t.grade}. r · ` : ''}{t.number} {t.title}</option>)}
                  </select>
                )}
              </div>
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
            {loaded && <TaskList tasks={filtered} emptyText={anyFilter ? 'Ni nalog, ki ustrezajo filtrom.' : 'Baza je še prazna. Dodaj prvo nalogo.'} />}
          </>
        )}
      </div>
    </div>
  );
}
