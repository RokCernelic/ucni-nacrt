'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTasks } from '@/hooks/useTasks';
import { useTaskSelection } from '@/hooks/useTaskSelection';
import { orderTasks } from '@/lib/tasks/order';
import PrintTasks from './PrintTasks';
import { btn, input } from './ui';

/**
 * Globalna vrstica izbora: vidna povsod, ko je kaj obkljukano (baza nalog, učni načrt …).
 * Tisk / .tex / strnjeno zajamejo vse izbrane naloge, ne glede na poglavje.
 */
export default function GlobalPrintBar() {
  const { user } = useAuth();
  const { tasks, loaded } = useTasks();
  const { selected, setMany } = useTaskSelection();
  const [title, setTitle] = useState('Učni list');

  const onSheet = orderTasks(tasks.filter(t => selected.has(t.id)));
  if (!user || !loaded || onSheet.length === 0) return null;

  return (
    <>
      <div style={{ height: '70px' }} className="no-print" aria-hidden />
      <div className="no-print" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 900, background: 'var(--canvas)', borderTop: '1px solid var(--hairline)',
        boxShadow: '0 -4px 18px rgba(0,0,0,.08)', padding: '10px 16px',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontFamily: 'var(--font-sans)' }}>
          <span style={{ fontSize: '13px', color: 'var(--forest)', fontWeight: 600 }}>Izbrano: {onSheet.length}</span>
          <button onClick={() => setMany(onSheet.map(t => t.id), false)} title="Počisti ves izbor" style={{ ...btn(), padding: '3px 9px', fontSize: '11px' }}>× počisti</button>
          <span style={{ flex: 1 }} />
          <input value={title} onChange={e => setTitle(e.target.value)} title="Naslov učnega lista" style={{ ...input, width: '170px', padding: '4px 8px' }} />
          <PrintTasks tasks={onSheet} title={title} />
        </div>
      </div>
    </>
  );
}
