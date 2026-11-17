'use client';

import { useEffect } from 'react';
import TaskEditor from '@/components/tasks/TaskEditor';
import type { Task, TaskDraft } from '@/lib/tasks/types';
import type { Question } from '@/lib/quiz/types';
import { questionToDraft, quizTag } from '@/lib/tasks/fromQuestion';
import { tasksToQuestions } from '@/lib/tasks/toQuiz';

/** Vprašanje kviza iz (shranjene) naloge; ohrani id vprašanja in razmike na listu. */
export function questionFromTask(task: Task, prev?: Question): Question {
  const nq = tasksToQuestions([task]).questions[0];
  if (!prev) return nq;
  const out = { ...nq, id: prev.id } as Question;
  if (prev.gapAfter != null) out.gapAfter = prev.gapAfter;
  if (out.kind !== 'mc' && prev.kind === out.kind && prev.space != null) out.space = prev.space;
  return out;
}

/**
 * Stranski panel z urejevalnikom naloge (isti kot v bazi nalog) za vprašanje na listu A4.
 * Privzeto shranjevanje zamenja izvirno nalogo v bazi (sprememba se pokaže v vseh kvizih z njo);
 * »Shrani kot novo različico« naredi kopijo pod izvirnikom in jo poveže s tem vprašanjem.
 */
export default function QuestionTaskDrawer({ question, number, task, quizId, save, onSaved, onClose }: {
  /** null = nova naloga */
  question: Question | null;
  number: number | null;
  task?: Task;
  quizId: string;
  save: (d: TaskDraft) => Promise<Task>;
  onSaved: (saved: Task) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tag = quizTag(quizId);
  const initial: TaskDraft | undefined = task ?? (question && (question.prompt.trim() || question.image) ? questionToDraft(question, { tag }) : question ? { ...questionToDraft(question, { tag }), body: '' } : undefined);
  /** nova naloga: brez id-ja in časovnih žigov izvirnika */
  const withoutId = (d: TaskDraft): TaskDraft => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = d as TaskDraft & { created_at?: string; updated_at?: string };
    void _id; void _c; void _u;
    return rest;
  };

  return (
    <aside className="no-print" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(600px, 46vw)', minWidth: '360px', zIndex: 250, background: 'var(--canvas)', borderLeft: '1px solid #c8d6e8', boxShadow: '-6px 0 24px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid var(--hairline)', fontFamily: 'var(--font-sans)' }}>
        <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>{number != null ? `Naloga ${number}` : 'Nova naloga'}</strong>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          {task ? 'sprememba se shrani v bazo nalog in v vse kvize s to nalogo' : 'naloga se shrani v bazo nalog in v ta kviz'}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={onClose} title="Zapri (Esc)" style={{ width: '28px', height: '28px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 40px' }}>
        <TaskEditor key={question?.id ?? 'nova'} initial={initial}
          saveLabel={task ? 'Zamenjaj originalno nalogo' : 'Shrani v bazo in kviz'}
          onCancel={onClose}
          onSave={async d => {
            const saved = task ? await save({ ...d, id: task.id }) : await save({ ...withoutId(d), tags: [...new Set([...d.tags, tag])] });
            onSaved(saved);
          }}
          altSave={task ? {
            label: 'Shrani kot novo različico',
            title: 'Izvirna naloga ostane nespremenjena; v bazi nastane kopija pod njo, ta kviz pa uporablja kopijo',
            onSave: async d => {
              const saved = await save({ ...withoutId(d), parent_id: task.parent_id ?? task.id, tags: [...new Set([...d.tags, tag])] });
              onSaved(saved);
            },
          } : undefined} />
      </div>
    </aside>
  );
}
