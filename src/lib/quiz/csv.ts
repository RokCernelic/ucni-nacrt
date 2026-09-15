import type { Quiz, Question } from './types';
import { scoreAnswers } from './scoring';
import { formatNumber } from './format';

function csvField(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export interface ResultRow {
  name: string;
  participated: boolean;
  answers: Record<string, string | undefined>;
}

/** Za izbirna vprašanja pretvori id izbrane možnosti v njeno besedilo (berljiv izvoz). */
function answerLabel(q: Question, value: string | undefined): string {
  if (!value) return '';
  if (q.kind === 'mc') return q.options.find(o => o.id === value)?.text ?? value;
  return value;
}

/** Izvoz rezultatov seje v CSV (podpičje — privzet ločevalnik za Excel v slovenski postavitvi). */
export function sessionResultsCsv(quiz: Pick<Quiz, 'questions'>, rows: ResultRow[]): string {
  const header = ['Ime', 'Sodeloval', 'Točke', 'Od', '%', 'Pravilno', 'Narobe', 'Brez',
    ...quiz.questions.map((_, i) => `V${i + 1}`)];
  const lines = [header.map(csvField).join(';')];
  for (const r of rows) {
    const sc = scoreAnswers(quiz, r.answers);
    lines.push([
      r.name, r.participated ? 'da' : 'ne',
      formatNumber(sc.points), formatNumber(sc.maxPoints), formatNumber(sc.percent),
      String(sc.correct), String(sc.wrong), String(sc.unanswered),
      ...quiz.questions.map(q => answerLabel(q, r.answers[q.id])),
    ].map(csvField).join(';'));
  }
  return lines.join('\r\n');
}

/** Sproži prenos CSV datoteke (BOM na začetku, da Excel pravilno prepozna UTF-8/šumnike). */
export function downloadCsv(filename: string, content: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Varno ime datoteke iz naslova kviza/razreda. */
export function safeFilename(...parts: string[]): string {
  return parts.filter(Boolean).join('-').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // odstrani naglase (š,č,ž -> s,c,z)
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'kviz';
}
