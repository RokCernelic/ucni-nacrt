import {
  AlignmentType, BorderStyle, Document, ImageRun, Math as DocxMath, MathFraction, MathRadical, MathRoundBrackets, MathRun, MathSubScript,
  MathSubSuperScript, MathSuperScript, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TabStopType, TextRun, WidthType,
  type MathComponent, type ParagraphChild,
} from 'docx';
import type { Quiz } from '@/lib/quiz/types';
import type { Task } from '@/lib/tasks/types';
import { itemsFromQuiz, itemsFromTasks, layoutSheet, type PrintItem, type SheetItem } from '@/lib/quiz/printSheet';
import { sanitizeRichHtml } from '@/lib/richText';
import { optHtml } from '@/lib/optText';
import { htmlToPlain } from '@/lib/tasks/toQuiz';

/**
 * Kviz kot Wordov dokument (.docx), ki ga lahko urejaš: glava (razred, datum, ime), naloge v enakem vrstnem redu in
 * s številkami kot na listu A4 (izbirne najprej), možnosti A), B) …, prazne vrstice za odgovor pri prostih nalogah
 * in na koncu stran z rešitvami. Besedilo nalog obdrži oblikovanje, tabele, slike in formule (MathML → Wordove enačbe).
 */

const FONT = 'Arial';
const SIZE = 22;                                   // 11 pt (v pol-točkah)
const PAGE_TEXT_MM = 180;                          // A4, robovi 15 mm
const mmTw = (v: number) => Math.round(v * 56.7);  // mm → twips
const mmPx = (v: number) => (v * 96) / 25.4;       // mm → px (96 dpi; docx meri slike v px)

type Style = { bold?: boolean; italics?: boolean; underline?: boolean; sub?: boolean; sup?: boolean };
type Img = { data: Uint8Array; type: 'png' | 'jpg' | 'gif'; w: number; h: number };
type Block = Paragraph | Table;

const run = (text: string, s: Style = {}, size = SIZE) => new TextRun({
  text, font: FONT, size, bold: s.bold, italics: s.italics, underline: s.underline ? {} : undefined, subScript: s.sub, superScript: s.sup,
});

/* ---------- slike ---------- */

async function loadImage(src: string): Promise<Img | null> {
  try {
    const blob = await (await fetch(src)).blob();
    const url = URL.createObjectURL(blob);
    try {
      const el = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
      const w = el.naturalWidth || 300, h = el.naturalHeight || 200;
      const t = blob.type.toLowerCase();
      if (t === 'image/png' || t === 'image/jpeg' || t === 'image/gif') {
        return { data: new Uint8Array(await blob.arrayBuffer()), type: t === 'image/png' ? 'png' : t === 'image/gif' ? 'gif' : 'jpg', w, h };
      }
      // webp ipd.: Word ga ne prikaže → pretvori v PNG
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(el, 0, 0);
      const png = await new Promise<Blob | null>(ok => c.toBlob(ok, 'image/png'));
      return png ? { data: new Uint8Array(await png.arrayBuffer()), type: 'png', w, h } : null;
    } finally { URL.revokeObjectURL(url); }
  } catch { return null; }
}

/* ---------- formule (MathML → Word) ---------- */

function mathOf(n: Node): MathComponent[] {
  if (n.nodeType === Node.TEXT_NODE) { const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim(); return t ? [new MathRun(t)] : []; }
  if (n.nodeType !== Node.ELEMENT_NODE) return [];
  const el = n as Element;
  const kids = Array.from(el.children);
  const all = () => Array.from(el.childNodes).flatMap(mathOf);
  const k = (i: number) => (kids[i] ? mathOf(kids[i]) : []);
  switch (el.localName) {
    case 'mi': case 'mn': case 'mo': case 'mtext': case 'ms': { const t = el.textContent ?? ''; return t ? [new MathRun(t)] : []; }
    case 'mspace': return [new MathRun(' ')];
    case 'annotation': return [];
    case 'semantics': return k(0);
    case 'mfrac': return [new MathFraction({ numerator: k(0), denominator: k(1) })];
    case 'msqrt': return [new MathRadical({ children: all() })];
    case 'mroot': return [new MathRadical({ children: k(0), degree: k(1) })];
    case 'msup': return [new MathSuperScript({ children: k(0), superScript: k(1) })];
    case 'msub': return [new MathSubScript({ children: k(0), subScript: k(1) })];
    case 'msubsup': return [new MathSubSuperScript({ children: k(0), subScript: k(1), superScript: k(2) })];
    case 'mfenced': return [new MathRoundBrackets({ children: all() })];
    case 'mtr': return [...kids.flatMap((c, i) => (i ? [new MathRun('  '), ...mathOf(c)] : mathOf(c)))];
    case 'mtable': return kids.flatMap((c, i) => (i ? [new MathRun(';  '), ...mathOf(c)] : mathOf(c)));
    default: return all(); // math, mrow, mstyle, mpadded, mover, munder …
  }
}

/* ---------- HTML → odstavki in tabele ---------- */

const BLOCK = new Set(['p', 'div', 'ul', 'ol', 'li', 'table', 'tr', 'thead', 'tbody']);
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: '888888' };

/**
 * Pretvori (očiščen) HTML v bloke. `prefix`: teksti pred prvim odstavkom (številka naloge); `indent`: levi zamik (mm);
 * `imgs`: naložene slike po src; `imgW`: širine slik (mm) iz urejevalnika lista, po vrsti slik.
 */
function htmlBlocks(html: string, o: { prefix?: ParagraphChild[]; indent?: number; imgs: Map<string, Img>; imgW?: (number | undefined)[]; maxW?: number }): Block[] {
  const root = new DOMParser().parseFromString(`<div>${sanitizeRichHtml(html).html}</div>`, 'text/html').body.firstElementChild!;
  const out: Block[] = [];
  let runs: ParagraphChild[] = [];
  let prefix = o.prefix ?? [];
  let imgIndex = 0;
  let listPrefix: string | null = null;
  const maxW = o.maxW ?? PAGE_TEXT_MM - (o.indent ?? 0);

  const flush = (force = false) => {
    const has = runs.length > 0;
    if (!has && !force) return;
    const lead: ParagraphChild[] = [...prefix, ...(listPrefix ? [run(listPrefix)] : [])];
    prefix = []; listPrefix = null;
    out.push(new Paragraph({ children: [...lead, ...runs], spacing: { after: 60 }, indent: o.indent ? { left: mmTw(o.indent) } : undefined }));
    runs = [];
  };

  const inline = (n: Node, s: Style) => {
    if (n.nodeType === Node.TEXT_NODE) {
      let t = (n.textContent ?? '').replace(/\s+/g, ' ');
      if (!runs.length && !prefix.length) t = t.replace(/^ /, '');
      if (t) runs.push(run(t, s));
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    const tag = el.localName;
    if (tag === 'math') { const m = mathOf(el); if (m.length) runs.push(new DocxMath({ children: m })); return; }
    if (tag === 'br') { runs.push(new TextRun({ break: 1 })); return; }
    if (tag === 'img') {
      const img = o.imgs.get(el.getAttribute('src') ?? '');
      const wantMm = o.imgW?.[imgIndex++];
      if (!img) return;
      const wMm = Math.min(maxW, wantMm ?? Math.min(maxW, (img.w * 25.4) / 96, 120));
      const w = mmPx(wMm), h = (w * img.h) / img.w;
      runs.push(new ImageRun({ type: img.type, data: img.data, transformation: { width: Math.round(w), height: Math.round(h) } }));
      return;
    }
    if (BLOCK.has(tag) || tag === 'td' || tag === 'th') { block(el, s); return; }
    const ns: Style = { ...s };
    if (tag === 'b' || tag === 'strong') ns.bold = true;
    if (tag === 'i' || tag === 'em') ns.italics = true;
    if (tag === 'u') ns.underline = true;
    if (tag === 'sub') ns.sub = true;
    if (tag === 'sup') ns.sup = true;
    el.childNodes.forEach(c => inline(c, ns));
  };

  const block = (el: Element, s: Style) => {
    const tag = el.localName;
    if (tag === 'table') {
      flush();
      if (prefix.length) flush(true);
      const rows = Array.from(el.querySelectorAll(':scope > tr, :scope > thead > tr, :scope > tbody > tr'));
      if (!rows.length) return;
      const nCols = Math.max(...rows.map(r => Array.from(r.children).reduce((n, c) => n + (Number(c.getAttribute('colspan')) || 1), 0)));
      const colW = maxW / Math.max(1, nCols);
      out.push(new Table({
        width: { size: mmTw(maxW), type: WidthType.DXA },
        indent: o.indent ? { size: mmTw(o.indent), type: WidthType.DXA } : undefined,
        borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder, insideHorizontal: cellBorder, insideVertical: cellBorder },
        rows: rows.map(r => new TableRow({
          children: Array.from(r.children).map(c => {
            const span = Number(c.getAttribute('colspan')) || 1;
            const inner = htmlBlocks(c.innerHTML, { imgs: o.imgs, maxW: colW * span - 2 });
            const kids = inner.length ? inner : [new Paragraph({ children: [] })];
            return new TableCell({
              columnSpan: span > 1 ? span : undefined,
              width: { size: mmTw(colW * span), type: WidthType.DXA },
              margins: { top: 40, bottom: 40, left: 80, right: 80 },
              children: kids,
            });
          }),
        })),
      }));
      out.push(new Paragraph({ children: [], spacing: { after: 60 } }));
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      flush();
      let i = 0;
      for (const li of Array.from(el.children)) {
        if (li.localName !== 'li') { block(li, s); continue; }
        i++;
        flush();
        listPrefix = tag === 'ol' ? `${i}. ` : '• ';
        li.childNodes.forEach(c => inline(c, s));
        flush(true);
      }
      return;
    }
    // p, div, li, td … : nov odstavek
    flush();
    el.childNodes.forEach(c => inline(c, s));
    flush();
  };

  root.childNodes.forEach(c => inline(c, {}));
  flush();
  if (prefix.length) flush(true);
  return out;
}

/* ---------- dokument ---------- */

const imgSrcs = (html: string) => [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map(m => m[1].replace(/&amp;/g, '&'));

const numPrefix = (n: number) => [run(`${n}. `, { bold: true })];

function choiceBlocks(c: SheetItem<PrintItem>, imgs: Map<string, Img>): Block[] {
  const blocks = htmlBlocks(c.item.html, { prefix: numPrefix(c.n), imgs, imgW: c.item.imgs?.map(x => x?.w) });
  const optRuns = (text: string) => inlineRuns(optHtml(text));
  const plain = (t: string) => t.replace(/<[^>]*>/g, '');
  const inlineOpts = c.options.length > 0 && c.options.every(x => plain(x.text).length <= 18) && c.options.reduce((n, x) => n + plain(x.text).length, 0) <= 56;
  if (inlineOpts) {
    blocks.push(new Paragraph({
      indent: { left: mmTw(6) }, spacing: { after: 60 },
      tabStops: c.options.map((_, i) => ({ type: TabStopType.LEFT, position: mmTw(6 + ((PAGE_TEXT_MM - 6) / c.options.length) * i) })).slice(1),
      children: c.options.flatMap((x, i) => [...(i ? [new TextRun({ text: '\t', font: FONT, size: SIZE })] : []), run(`${x.letter}) `, { bold: true }), ...optRuns(x.text)]),
    }));
  } else {
    for (const x of c.options) blocks.push(new Paragraph({ indent: { left: mmTw(6) }, spacing: { after: 40 }, children: [run(`${x.letter}) `, { bold: true }), ...optRuns(x.text)] }));
  }
  return blocks;
}

/** Vrstični HTML (možnost) → teksti z oblikovanjem. */
function inlineRuns(html: string): ParagraphChild[] {
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild!;
  const out: ParagraphChild[] = [];
  const walk = (n: Node, s: Style) => {
    if (n.nodeType === Node.TEXT_NODE) { const t = (n.textContent ?? '').replace(/\s+/g, ' '); if (t) out.push(run(t, s)); return; }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (n as Element).localName;
    const ns: Style = { ...s, ...(tag === 'b' || tag === 'strong' ? { bold: true } : {}), ...(tag === 'i' || tag === 'em' ? { italics: true } : {}),
      ...(tag === 'u' ? { underline: true } : {}), ...(tag === 'sub' ? { sub: true } : {}), ...(tag === 'sup' ? { sup: true } : {}) };
    n.childNodes.forEach(c => walk(c, ns));
  };
  walk(root, {});
  return out;
}

/** Kviz → .docx (vrstni red in številke kot na listu A4: izbirne najprej; vedno s stranjo rešitev). */
export function buildQuizDocx(quiz: Quiz, tasksById?: Map<string, Task>): Promise<Blob> {
  return buildSheetDocx({ title: quiz.title || 'Kviz', items: itemsFromQuiz(quiz, tasksById), choiceFirst: true, hidePoints: !!quiz.sheet?.hidePoints, solutions: true });
}

/** Izbrane naloge iz baze → .docx (vrstni red kot pri tisku; `solutions`: stran z rešitvami na koncu). */
export function buildTasksDocx(tasks: Task[], title: string, solutions: boolean): Promise<Blob> {
  return buildSheetDocx({ title: title || 'Naloge', items: itemsFromTasks(tasks, htmlToPlain), choiceFirst: false, hidePoints: false, solutions });
}

/** Naloge v podanem vrstnem redu (brez »izbirne najprej«), oštevilčene po vrsti. */
function renumber(list: SheetItem<PrintItem>[], items: PrintItem[]): SheetItem<PrintItem>[] {
  const pos = new Map(items.map((it, i) => [it.id, i]));
  return [...list].sort((a, b) => (pos.get(a.item.id) ?? 0) - (pos.get(b.item.id) ?? 0)).map((c, i) => ({ ...c, n: i + 1 }));
}

async function buildSheetDocx(o: { title: string; items: PrintItem[]; choiceFirst: boolean; hidePoints: boolean; solutions: boolean }): Promise<Blob> {
  const { items, hidePoints } = o;
  const quiz = { title: o.title };
  const layout = layoutSheet(items, null, { questions: false, options: false });
  const all = o.choiceFirst ? [...layout.choice, ...layout.free] : renumber([...layout.choice, ...layout.free], items);
  const total = items.reduce((n, i) => n + (i.points || 0), 0);
  const pts = (p: number) => String(p).replace('.', ',');

  // slike naložimo vnaprej (pretvorba je nato sinhrona)
  const imgs = new Map<string, Img>();
  const srcs = new Set(all.flatMap(c => [...imgSrcs(c.item.html), ...(c.item.solution ? imgSrcs(c.item.solution) : [])]));
  await Promise.all([...srcs].map(async s => { const i = await loadImage(s); if (i) imgs.set(s, i); }));

  const right = mmTw(PAGE_TEXT_MM);
  const body: Block[] = [
    new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: right }], children: [run('Razred: ________'), new TextRun({ text: '\t', font: FONT }), run('Datum: ____________')] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 160 }, children: [run(quiz.title || 'Kviz', { bold: true }, 30)] }),
    new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: right }], spacing: { after: 240 },
      children: [run('Ime in priimek: ______________________________'), ...(hidePoints ? [] : [new TextRun({ text: '\t', font: FONT }), run(`Točke: ______ / ${pts(total)}`)])] }),
  ];

  for (const c of all) {
    const ptsRun: ParagraphChild[] = hidePoints ? [] : [run(`(${pts(c.item.points)} t.) `, { italics: true }, 18)];
    if (c.item.choice) {
      const bl = choiceBlocks(c, imgs);
      body.push(...bl);
      if (!hidePoints) body.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: ptsRun, spacing: { after: 0 } }));
    } else {
      body.push(...htmlBlocks(c.item.html, { prefix: numPrefix(c.n), imgs, imgW: c.item.imgs?.map(x => x?.w) }));
      // prostor za odgovor: prazne vrstice (≈ 7 mm na vrstico)
      const lines = Math.max(1, Math.round((c.item.space || 15) / 7));
      for (let i = 0; i < lines; i++) body.push(new Paragraph({ children: [], spacing: { after: 0 } }));
      if (!hidePoints) body.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(`___ / ${pts(c.item.points)} t.`, { italics: true }, 18)] }));
    }
    body.push(new Paragraph({ children: [], spacing: { after: 120 } }));
  }

  // rešitve
  if (o.solutions) {
    body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(new Paragraph({ spacing: { after: 200 }, children: [run(`Rešitve — ${quiz.title || 'Kviz'}`, { bold: true }, 28)] }));
    for (const c of all) {
      const letters = c.options.filter(x => c.item.correct.includes(x.id)).map(x => x.letter).join(', ');
      const ans = c.item.choice ? letters || '—' : c.item.answerText ?? '';
      body.push(new Paragraph({ spacing: { after: 40 }, children: [run(`${c.n}. `, { bold: true }), ...(ans ? [run(ans, { bold: c.item.choice })] : [])] }));
      if (c.item.solution) body.push(...htmlBlocks(c.item.solution, { imgs, indent: 6 }));
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{ properties: { page: { margin: { top: mmTw(15), bottom: mmTw(15), left: mmTw(15), right: mmTw(15) } } }, children: body }],
  });
  return Packer.toBlob(doc);
}
