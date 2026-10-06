'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useTasks } from '@/hooks/useTasks';
import { useTaskSelection } from '@/hooks/useTaskSelection';
import { BLOOM, type BloomLevel } from '@/lib/tasks/types';
import TaskList from '@/components/tasks/TaskList';
import PrintTasks from '@/components/tasks/PrintTasks';
import { Chip, tinyLabel } from '@/components/tasks/ui';

/** Učni načrt → podpoglavje → Vprašanja in naloge: naloge iz baze, povezane s tem podpoglavjem. */
export default function TopicQuestions({ topicKey, title }: { topicKey: string; title: string }) {
  const { user, loading } = useAuth();
  const { tasks, loaded, error } = useTasks();
  const { selected, setMany } = useTaskSelection();
  const [filter, setFilter] = useState<Set<BloomLevel>>(new Set());

  if (loading) return null;
  if (!user) return <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', margin: 0 }}>Za naloge se <Link href="/login" style={{ color: 'var(--forest)' }}>prijavite</Link>.</p>;
  if (!loaded) return <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', margin: 0 }}>Nalagam …</p>;

  const mine = tasks.filter(t => t.topics.includes(topicKey));
  const visible = filter.size ? mine.filter(t => t.bloom && filter.has(t.bloom)) : mine;
  const chosen = visible.filter(t => selected.has(t.id));
  const allOn = visible.length > 0 && chosen.length === visible.length;
  const toggleFilter = (l: BloomLevel) => setFilter(prev => { const n = new Set(prev); if (n.has(l)) n.delete(l); else n.add(l); return n; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontFamily: 'var(--font-sans)' }}>
      {error && <p style={{ fontSize: '12px', color: '#c0392b', margin: 0 }}>{error}</p>}
      {mine.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={allOn} onChange={e => setMany(visible.map(t => t.id), e.target.checked)} />
            izberi vse{filter.size ? ' (v filtru)' : ''}
          </label>
          <PrintTasks tasks={chosen} title={title} />
          <span style={{ flex: 1 }} />
          <span style={tinyLabel}>Filter:</span>
          {BLOOM.map(b => <Chip key={b.level} square active={filter.has(b.level)} color={b.color} title={`${b.level} · ${b.name} — ${b.hint}`} onClick={() => toggleFilter(b.level)}>{b.level}</Chip>)}
        </div>
      )}
      <TaskList tasks={visible} fixedTopic={topicKey} showTopics={false}
        emptyText={mine.length ? 'Ni nalog v izbranem filtru.' : undefined} />
      <Link href="/kvizi/naloge" style={{ fontSize: '11px', color: 'var(--muted)', alignSelf: 'flex-start' }}>Vse naloge → Kvizi · Baza nalog</Link>
    </div>
  );
}
