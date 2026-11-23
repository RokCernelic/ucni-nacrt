'use client';

import TaskEditor from '@/components/tasks/TaskEditor';
import type { Task, TaskDraft } from '@/lib/tasks/types';
import type { Question } from '@/lib/quiz/types';
import { questionToDraft, quizTag } from '@/lib/tasks/fromQuestion';
import { tasksToQuestions } from '@/lib/tasks/toQuiz';
import SideDrawer from '@/components/SideDrawer';
import GeneratePanel, { type GenMode } from '@/components/tasks/GeneratePanel';

/** Vprašanje kviza iz (shranjene) naloge; ohrani id vprašanja in razmike na listu. */
export function questionFromTask(task: Task, prev?: Question): Question {
  const nq = tasksToQuestions([task]).questions[0];
  if (!prev) return nq;
  const out = { ...nq, id: prev.id } as Question;
  if (prev.gapAfter != null) out.gapAfter = prev.gapAfter;
  if (prev.half) out.half = true;
  if (out.kind !== 'mc' && prev.kind === out.kind && prev.space != null) out.space = prev.space;
  return out;
}

/**
 * Stranski panel z urejevalnikom naloge (isti kot v bazi nalog) za vprašanje na listu A4.
 * Privzeto shranjevanje zamenja izvirno nalogo v bazi (sprememba se pokaže v vseh kvizih z njo);
 * »Shrani kot novo različico« naredi kopijo pod izvirnikom in jo poveže s tem vprašanjem.
 */
export default function QuestionTaskDrawer({ open, editorKey, question, number, task, quizId, save, onSaved, onClose, generate, onGenerated }: {
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
  /** okno »✨ Generiraj« namesto urejevalnika */
  generate?: boolean;
  /** generirana naloga je shranjena v bazo: 'complete' = dopolnjena ta naloga, sicer nova naloga (pod izvirno) */
  onGenerated?: (saved: Task, mode: GenMode) => void;
}) {
  const tag = quizTag(quizId);
  const initial: TaskDraft | undefined = task ?? (question && (question.prompt.trim() || question.image) ? questionToDraft(question, { tag }) : question ? { ...questionToDraft(question, { tag }), body: '' } : undefined);
  /** nova naloga: brez id-ja in časovnih žigov izvirnika */
  const withoutId = (d: TaskDraft): TaskDraft => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = d as TaskDraft & { created_at?: string; updated_at?: string };
    void _id; void _c; void _u;
    return rest;
  };

  const withTag = (d: TaskDraft): TaskDraft => ({ ...d, tags: [...new Set([...d.tags, tag])] });

  if (generate && initial) {
    return (
      <SideDrawer open={open} onClose={onClose} title={`✨ Generiraj iz naloge${number != null ? ` ${number}` : ''}`}
        subtitle="nova naloga se shrani v bazo nalog in doda v kviz za to nalogo">
        <GeneratePanel key={editorKey} source={initial} onCancel={onClose}
          onSave={async (d, mode) => {
            const saved = mode === 'complete'
              ? (task ? await save({ ...d, id: task.id, parent_id: task.parent_id }) : await save(withTag(withoutId(d))))
              : await save(withTag({ ...withoutId(d), parent_id: task ? task.parent_id ?? task.id : null }));
            onGenerated?.(saved, mode);
          }} />
      </SideDrawer>
    );
  }

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
