import type { Question, QuizOption } from './types';
import { parseNumber, questionProblems } from './scoring';

/** Uvoz vprašanj iz navadnega besedila — format je opisan v public/primer-kviz.txt. */

export interface TextImportResult {
  title?: string;
  questions: Question[];
  errors: { line: number; message: string }[];
}

const uid = () => crypto.randomUUID();

const OPTION_RE = /^(\*)?\s*(?:[A-Fa-f][).]|[-•–])\s+(.*)$/;
const STAR_RE = /^\*\s*(.+)$/;
const NUMERIC_RE = /^=\s*(.+)$/;
const POINTS_RE = /^(?:točke|tocke|točk|tocka|točka)\s*:\s*(.+)$/i;
const TITLE_RE = /^naslov\s*:\s*(.+)$/i;
const NUMBERING_RE = /^\d+\s*[.)]\s+/;
const KEEP_RE = /\s*\[ohrani\]\s*$/i;

/** Prebere datoteko kot UTF-8; če ni veljaven UTF-8 (npr. star Beležnica), kot Windows-1250. */
export async function readTextFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1250').decode(buf);
  }
}

export function parseQuizText(text: string): TextImportResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const result: TextImportResult = { questions: [], errors: [] };

  // razdeli na bloke (ločene s prazno vrstico), zapomni si številke vrstic
  const blocks: { line: number; text: string }[][] = [];
  let cur: { line: number; text: string }[] = [];
  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (!t) { if (cur.length) { blocks.push(cur); cur = []; } return; }
    if (t.startsWith('#')) return;
    const title = t.match(TITLE_RE);
    if (title && !result.title && blocks.length === 0 && cur.length === 0) {
      result.title = title[1].trim();
      return;
    }
    cur.push({ line: i + 1, text: t });
  });
  if (cur.length) blocks.push(cur);

  for (const block of blocks) {
    const at = block[0].line;
    const fail = (message: string, line = at) => result.errors.push({ line, message });

    const promptLines: string[] = [];
    const options: QuizOption[] = [];
    const correctIdx: number[] = [];
    let numeric: { value: string; tolerance: number } | null = null;
    let points = 1;
    let bad = false;

    for (const { line, text: t } of block) {
      const pts = t.match(POINTS_RE);
      if (pts) {
        const n = parseNumber(pts[1]);
        if (n === null || n <= 0) { fail(`neveljavne točke »${pts[1]}«`, line); bad = true; }
        else points = n;
        continue;
      }
      const num = t.match(NUMERIC_RE);
      if (num) {
        const [valueRaw, tolRaw] = num[1].split(/±|\+\/-|\+-/).map(s => s.trim());
        const tol = tolRaw ? parseNumber(tolRaw) : 0;
        if (parseNumber(valueRaw) === null) { fail(`»${valueRaw}« ni število`, line); bad = true; }
        else if (tol === null || tol < 0) { fail(`neveljavna toleranca »${tolRaw}«`, line); bad = true; }
        else numeric = { value: valueRaw, tolerance: tol };
        continue;
      }
      const star = t.match(STAR_RE);
      const opt = t.match(OPTION_RE) ?? (star ? [t, '*', star[1]] : null);
      if (opt && promptLines.length > 0) {
        let optText = opt[2].trim();
        const keepPlace = KEEP_RE.test(optText);
        if (keepPlace) optText = optText.replace(KEEP_RE, '');
        if (opt[1]) correctIdx.push(options.length);
        options.push({ id: uid(), text: optText, ...(keepPlace ? { keepPlace: true } : {}) });
        continue;
      }
      if (options.length || numeric) { fail(`nepričakovana vrstica »${t}« za odgovori`, line); bad = true; continue; }
      promptLines.push(promptLines.length ? t : t.replace(NUMBERING_RE, ''));
    }
    if (bad) continue;

    const prompt = promptLines.join('\n');
    if (!prompt) { fail('manjka besedilo vprašanja'); continue; }
    if (numeric && options.length) { fail('vprašanje ima hkrati možnosti in številski odgovor (=)'); continue; }

    let q: Question;
    if (numeric) {
      q = { id: uid(), kind: 'numeric', prompt, points, correct: numeric.value, tolerance: numeric.tolerance };
    } else {
      if (options.length === 0) { fail('manjkajo možnosti (A), B) …) ali številski odgovor (= …)'); continue; }
      if (correctIdx.length === 0) { fail('nobena možnost ni označena z * kot pravilna'); continue; }
      if (correctIdx.length > 1) { fail('z * je lahko označena le ena možnost'); continue; }
      if (options.length > 6) { fail('največ 6 možnosti'); continue; }
      q = { id: uid(), kind: 'mc', prompt, points, options, correct: options[correctIdx[0]].id };
    }
    const problems = questionProblems(q);
    if (problems.length) { fail(problems.join(', ')); continue; }
    result.questions.push(q);
  }
  return result;
}
