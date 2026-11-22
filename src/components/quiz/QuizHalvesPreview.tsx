'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { HalvesPages, useHalvesPlan, findOrder } from './HalvesSheet';
import type { Sheet } from './QuizSheetParts';
import { itemsFromQuiz, layoutSheet, sheetToken } from '@/lib/quiz/printSheet';
import { questionsLabel } from '@/lib/quiz/format';
import type { Quiz, ImgLayout } from '@/lib/quiz/types';
import type { Task } from '@/lib/tasks/types';

/**
 * Pogled »Dva testa na en A4« v urejevalniku kviza: tako bo videti natis dveh testov na list (zgoraj in spodaj,
 * sprednja in hrbtna stran), z vzorčnim imenom in QR kodo. Vprašanja, ki se ne prilegajo, so našteta spodaj.
 */
export default function QuizHalvesPreview({ quiz, tasksById, onOpen, activeId, onSpacing, onImg }: { quiz: Quiz; tasksById: Map<string, Task>; onOpen: (questionId: string) => void; activeId: string | null; onSpacing: (questionId: string, kind: 'gap' | 'space', mm: number | null) => void; onImg: (questionId: string, index: number, layout: ImgLayout | null) => void }) {
  const items = useMemo(() => itemsFromQuiz(quiz, tasksById), [quiz, tasksById]);
  const { plan, node } = useHalvesPlan(items, true, true, quiz.title);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(sheetToken('00000000-0000-0000-0000-000000000000', 'predogled'), { margin: 0, width: 240, errorCorrectionLevel: 'M' })
      .then(u => { if (alive) setQr(u); });
    return () => { alive = false; };
  }, []);

  const sheet = useMemo<Sheet | null>(() => {
    if (!plan) return null;
    const kept = items.filter(i => plan.keptIds.has(i.id));
    const order = findOrder(kept, plan.m, true, null);
    if (!order) return null;
    return { key: 'dva-testa', name: 'IME IN PRIIMEK', qr, layout: layoutSheet(kept, null, { questions: false, options: false, order }) };
  }, [plan, items, qr]);

  return (
    <div>
      {node}
      {!plan || !sheet ? (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--muted)', margin: '8px 0' }}>
          {plan && !sheet ? 'Vprašanj ni mogoče razporediti na polovico lista — zmanjšaj število nalog.' : 'Merim vprašanja …'}
        </p>
      ) : (
        <>
          {plan.droppedItems.length > 0 && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: '#8a5a00', background: '#fdf6e3', border: '1px solid #ecd9a8', borderRadius: 'var(--r-sm)', padding: '8px 12px', margin: '0 0 12px' }}>
              Na polovico lista se prilega {plan.kept} od {plan.total} vprašanj. Ne prilega se: {questionsLabel(plan.droppedItems.length)} — {plan.droppedItems.map(i => `»${i.prompt.slice(0, 40)}${i.prompt.length > 40 ? '…' : ''}«`).join(', ')}. Pri tisku dveh testov na list bodo izpuščena.
            </p>
          )}
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)', margin: '0 0 10px' }}>
            Merilo 1 : 1. Prva stran je sprednja, druga hrbtna stran lista; zgoraj en test, spodaj drug. Ime, datum in QR koda so vzorec. Klik na nalogo jo odpre, črtkane ločilne črte povlečeš za razmik.
          </p>
          <div style={{ overflowX: 'auto', margin: '0 -32px', padding: '4px 0 8px' }}>
            <div className="pqz-preview pqz-ed pqz-halves-ed" style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
              <HalvesPages sheets={[sheet, sheet]} plan={plan} title={quiz.title} placeholder edit={{ onOpen, activeId, onSpacing, onImg }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
