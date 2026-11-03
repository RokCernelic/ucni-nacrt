'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuizLibrary } from '@/hooks/useQuizLibrary';
import { tasksToQuestions } from '@/lib/tasks/toQuiz';
import { useAuth } from '@/hooks/useAuth';
import { useTasks } from '@/hooks/useTasks';
import { useTaskSelection } from '@/hooks/useTaskSelection';
import { orderTasks } from '@/lib/tasks/order';
import PrintQuizDialog from '@/components/quiz/PrintQuizDialog';
import { itemsFromTasks } from '@/lib/quiz/printSheet';
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
  const router = useRouter();
  const [quizPrint, setQuizPrint] = useState<string | null>(null);
  const lib = useQuizLibrary();

  const onSheet = orderTasks(tasks.filter(t => selected.has(t.id)));
  if (!user || !loaded || onSheet.length === 0) return null;

  const { questions, skipped } = tasksToQuestions(onSheet);
  const makeQuiz = () => {
    if (!questions.length) return;
    const note = skipped.length ? `\n\n${skipped.length} ${skipped.length === 1 ? 'naloga ni primerna' : 'nalog ni primernih'} za kviz (odprte, kratek odgovor, več možnosti ali brez pravilnega odgovora) in ${skipped.length === 1 ? 'je izpuščena' : 'so izpuščene'}.` : '';
    const name = window.prompt(`Naslov novega kviza (${questions.length} vprašanj)?${note}`, title === 'Učni list' ? 'Nov kviz' : title);
    if (name === null) return;
    try {
      const id = lib.createQuizFrom(name, questions);
      router.push(`/kvizi/${id}`);
    } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); }
  };

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
          <button onClick={() => setQuizPrint(crypto.randomUUID())}
            title="Natisne vse izbrane naloge kot kviz: izbirne v obrazcu s krogci na vrhu, ostale pod njimi; po želji list za vsakega učenca z QR kodo"
            style={{ ...btn(), padding: '5px 10px' }}>🧾 Natisni kviz</button>
          <button onClick={makeQuiz} disabled={!questions.length}
            title={questions.length ? 'Iz izbranih nalog (izbirne, drži/ne drži, številske) naredi nov kviz v zavihku Kvizi' : 'Med izbranimi ni nalog, primernih za kviz (izbirne, drži/ne drži, številske s pravilnim odgovorom)'}
            style={{ ...btn(), padding: '5px 10px', opacity: questions.length ? 1 : 0.45, cursor: questions.length ? 'pointer' : 'not-allowed' }}>
            🎯 Ustvari kviz ({questions.length})
          </button>
        </div>
      </div>
      {quizPrint && <PrintQuizDialog items={itemsFromTasks(onSheet)} title={title === 'Učni list' ? 'Kviz' : title} jobId={quizPrint} onClose={() => setQuizPrint(null)} />}
    </>
  );
}
