'use client';

import TaskEditor from '@/components/tasks/TaskEditor';
import type { Task, TaskDraft } from '@/lib/tasks/types';
import type { Question } from '@/lib/quiz/types';
import { questionToDraft, quizTag } from '@/lib/tasks/fromQuestion';
import { tasksToQuestions } from '@/lib/tasks/toQuiz';
import SideDrawer from '@/components/SideDrawer';

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
export default function QuestionTaskDrawer({ open, editorKey, question, number, task, quizId, save, onSaved, onClose }: {
  open: boolean;
  /** ključ urejevalnika (nov ob vsakem odprtju) */
  editorKey: string;
  /** null = nova naloga */
  question: Question | null;
  number: number | null;
  task?: Task;
  quizId: string;
  save: (d: TaskDraft) => Promise<Task>;
  onSaved: (saved: Task) => void;
  onClose: () => void;
}) {
  const tag = quizTag(quizId);
  const initial: TaskDraft | undefined = task ?? (question && (question.prompt.trim() || question.image) ? questionToDraft(question, { tag }) : question ? { ...questionToDraft(question, { tag }), body: '' } : undefined);
  /** nova naloga: brez id-ja in časovnih žigov izvirnika */
  const withoutId = (d: TaskDraft): TaskDraft => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = d as TaskDraft & { created_at?: string; updated_at?: string };
    void _id; void _c; void _u;
    return rest;
  };

  return (
    <SideDrawer open={open} onClose={onClose} title={number != null ? `Naloga ${number}` : 'Nova naloga'}
      subtitle={task ? 'sprememba se shrani v bazo nalog in v vse kvize s to nalogo' : 'naloga se shrani v bazo nalog in v ta kviz'}>
        <TaskEditor key={editorKey} initial={initial}
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
    </SideDrawer>
  );
}
