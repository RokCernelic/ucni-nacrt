import { htmlToPlain } from './toQuiz';
import { topicInfo, chapterInfo, topicsOf, chaptersOf } from './topics';
import { KINDS, correctIds, LETTERS, type Task } from './types';

const KIND_WORD: Record<string, string> = { racunska: 'računska', besedilna: 'besedilna', graficna: 'grafična', skica: 'skica', eksperimentalna: 'eksperimentalna', povezovanje: 'povezovanje' };

/** Besedilo v eni vrstici (prazne vrstice v uvozu ločijo naloge). */
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/ {2,}/g, ' ').trim();
/** Večvrstično besedilo brez praznih vrstic (podnaloge a), b) … ostanejo vsaka v svoji vrstici). */
const noBlank = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
const num = (v: number) => String(v).replace('.', ',');

/**
 * Naloge → besedilna datoteka v obliki, ki jo uvozi »Uvozi .txt« (glej public/primer-naloge.txt): besedilo, podnaloge,
 * možnosti (*pravilna), številski odgovor (= vrednost ± toleranca enota) in vsi metapodatki kot oznake pod nalogo
 * (Tema, Standardi, Bloom, Težavnost, Tip, Ključniki, Rešitev, Postopek, Točke, Čas, Vir, Stanje) — ob uvozu se obnovijo.
 * Slike in oblikovanje se ne izvozijo (le besedilo; enačbe kot navadno besedilo).
 */
export function tasksToTxt(tasks: Task[]): string {
  const curricula = [...new Set(tasks.map(t => t.curriculum).filter((c): c is string => !!c))];
  const out: string[] = [];
  const hasImages = tasks.some(t => /<img\b/i.test(t.body) || /<img\b/i.test(t.solution ?? ''));
  out.push(`Predmet: ${curricula.length === 1 ? curricula[0] : 'fizika'}`, '');
  out.push(`# Izvoz iz baze nalog (${tasks.length}) — datoteko lahko znova uvoziš z »Uvozi .txt«.`);
  if (curricula.length > 1) out.push('# Naloge več predmetov: oznaka Tema je zato zapisana s polnim ključem.');
  if (hasImages) out.push('# Slike niso izvožene; pri nalogah s slikami jo dodaj po uvozu.');
  out.push('');

  // Številka podpoglavja / poglavja ali (če ni enolična oziroma je več predmetov) poln ključ.
  const topicRef = (key: string): string => {
    const t = topicInfo(key);
    if (!t) return key;
    const unique = topicsOf(t.curriculum).filter(x => x.number === t.number).length === 1;
    return curricula.length === 1 && unique ? t.number : key;
  };
  const chapterRef = (key: string): string => {
    const c = chapterInfo(key);
    if (!c) return key;
    const unique = chaptersOf(c.curriculum).filter(x => x.number === c.number).length === 1;
    return curricula.length === 1 && unique ? c.number : key;
  };

  tasks.forEach((t, i) => {
    const lines: string[] = [];
    const body = noBlank(htmlToPlain(t.body)).split('\n');
    lines.push(`${i + 1}. ${body[0] ?? ''}`, ...body.slice(1));

    if ((t.answer_kind === 'mc' || t.answer_kind === 'multi' || t.answer_kind === 'tf') && t.options?.length) {
      const right = new Set(correctIds(t));
      t.options.forEach((o, k) => {
        const mark = right.has(o.id) ? '*' : '';
        lines.push(t.answer_kind === 'tf' ? `${mark}- ${oneLine(o.text)}` : `${mark}${LETTERS[k]}) ${oneLine(o.text)}`);
      });
    } else if (t.answer_kind === 'numeric' && t.correct) {
      lines.push(`= ${t.correct}${t.tolerance ? ` ± ${num(t.tolerance)}` : ''}${t.unit ? ` ${t.unit}` : ''}`);
    }

    const topic = t.topics[0] ? topicRef(t.topics[0]) : t.chapters[0] ? chapterRef(t.chapters[0]) : '';
    if (topic) lines.push(`Tema: ${topic}`);
    if (t.standards.length) lines.push(`Standardi: ${t.standards.join(', ')}`);
    if (t.bloom) lines.push(`Bloom: ${t.bloom}`);
    if (t.difficulty) lines.push(`Težavnost: ${t.difficulty}`);
    const kinds = t.kinds.map(k => KIND_WORD[k] ?? KINDS.find(x => x.id === k)?.name ?? k);
    if (kinds.length) lines.push(`Tip: ${kinds.join(', ')}`);
    const tags = t.tags.filter(x => !x.startsWith('kviz:'));
    if (tags.length) lines.push(`Ključniki: ${tags.join(', ')}`);
    const ans = t.answer ? oneLine(htmlToPlain(t.answer)) : '';
    if (ans && t.answer_kind !== 'numeric') lines.push(`Rešitev: ${ans}`);
    const sol = t.solution ? oneLine(htmlToPlain(t.solution)) : '';
    if (sol) lines.push(`Postopek: ${sol}`);
    if (t.points && t.points !== 1) lines.push(`Točke: ${num(t.points)}`);
    if (t.minutes) lines.push(`Čas: ${t.minutes}`);
    if (t.source && t.source !== 'lastna') lines.push(`Vir: ${t.source}`);
    if (t.status === 'draft') lines.push('Stanje: osnutek');
    out.push(...lines, '');
  });
  return out.join('\n');
}

/** Prenese izbrane naloge kot .txt (ime: »YYYY MM DD Naloge (N).txt«). */
export function downloadTasksTxt(tasks: Task[]) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const name = `${d.getFullYear()} ${p(d.getMonth() + 1)} ${p(d.getDate())} Naloge (${tasks.length}).txt`;
  const url = URL.createObjectURL(new Blob(['﻿' + tasksToTxt(tasks)], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
