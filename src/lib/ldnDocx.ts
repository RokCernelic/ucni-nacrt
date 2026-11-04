import {
  AlignmentType, BorderStyle, Document, Footer, HeightRule, Packer, PageNumber, PageOrientation, Paragraph, ShadingType, Table, TableCell,
  TableBorders, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';
import type { Cilj, Standard } from '@/types/curriculum';

/** Letna priprava kot Wordov dokument (.docx): naslovna stran + tabela z ponavljajočo se glavo in »STRAN x OD y« v nogi. */

export interface LdnDocxData {
  fields: { school: string; subject: string; cls: string; year: string; teacher: string; hours: string; date: string };
  cols: { cilji: boolean; standardi: boolean; pojmi: boolean };
  chaps: {
    num: number; title: string; hours: number;
    noviPojmi?: string[]; standardi?: Standard[];
    rows: { num: string; title: string; hours: number; custom: boolean; color?: string; izbirna?: boolean; noviPojmi?: string[]; cilji?: Cilj[]; standardi?: Standard[] }[];
  }[];
  total: number;
  unassigned: number | null;
}

const FONT = 'Arial';
const GREEN = '0A2E0E';
const GREEN_LIGHT = 'DCEBDD';
const mm = (v: number) => Math.round(v * 56.7); // mm → twips
const PAGE_W = 267;                              // A4 ležeče, robovi 15 mm

const line = { style: BorderStyle.SINGLE, size: 4, color: '777777' };
const borders = { top: line, bottom: line, left: line, right: line };

const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number; color?: string; sup?: boolean } = {}) =>
  new TextRun({ text, font: FONT, bold: o.bold, italics: o.italics, size: o.size ?? 17, color: o.color, superScript: o.sup });

/** svetla podlaga iz barve enote (#rrggbb → ~13 % barve na belem) */
function tint(hex: string | undefined): string | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * 0.13).toString(16).padStart(2, '0');
  return (mix((n >> 16) & 255) + mix((n >> 8) & 255) + mix(n & 255)).toUpperCase();
}

function stdRuns(s: Standard, size: number): TextRun[] {
  const out: TextRun[] = [run('– ', { size })];
  const italics = !!s.izbirni;
  if (s.text.includes('**')) {
    s.text.split('**').forEach((p, i) => { if (p) out.push(run(p, { bold: i % 2 === 1, italics, size })); });
  } else out.push(run(s.text, { bold: !!s.minimalni, italics, size }));
  if (s.minimalni) out.push(run(' M', { bold: true, size: size - 2, color: '2C6E3A', sup: true }));
  if (s.izbirni) out.push(run(' (I)', { size: size - 2, color: '2C6E3A', bold: true }));
  if (s.shared) out.push(run(' (S)', { size: size - 2, color: '2C6E3A', bold: true }));
  return out;
}

const para = (children: TextRun[], after = 40) => new Paragraph({ children, spacing: { after, line: 240 }, indent: { left: 170, hanging: 170 } });
const plain = (children: TextRun[], after = 0) => new Paragraph({ children, spacing: { after, line: 240 } });

function cell(width: number, content: Paragraph[], fill?: string, span?: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, columnSpan: span, borders, verticalAlign: VerticalAlign.TOP,
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
    shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
    children: content.length ? content : [new Paragraph({ children: [] })],
  });
}

export function buildLdnDocx(d: LdnDocxData): Promise<Blob> {
  const { cols } = d;
  // širine stolpcev (mm) kot pri natisu
  const wNum = 10, wTema = 42, wUre = 11;
  const wCilji = cols.cilji ? (cols.standardi ? 74 : PAGE_W - wNum - wTema - wUre) : 0;
  const wStd = cols.standardi ? PAGE_W - wNum - wTema - wUre - wCilji : 0;
  const W = { num: mm(wNum), tema: mm(wTema), ure: mm(wUre), cilji: mm(wCilji), std: mm(wStd) };
  const widths = [W.num, W.tema, W.ure, ...(cols.cilji ? [W.cilji] : []), ...(cols.standardi ? [W.std] : [])];
  const restSpan = Number(cols.cilji) + Number(cols.standardi);

  const head = new TableRow({
    tableHeader: true, cantSplit: true,
    children: [
      ['Št.', W.num], ['Učna tema', W.tema], ['Ure', W.ure],
      ...(cols.cilji ? [['Cilji', W.cilji] as [string, number]] : []),
      ...(cols.standardi ? [['Standardi znanja', W.std] as [string, number]] : []),
    ].map(([t, w]) => cell(w as number, [plain([run(t as string, { bold: true, color: 'FFFFFF' })])], GREEN)),
  });

  const pojmi = (list?: string[]) => (cols.pojmi && list?.length
    ? [new Paragraph({ children: [run('Novi pojmi: ', { bold: true, size: 16 }), run(list.join(', '), { size: 16 })], spacing: { before: 160, after: 0 } })]
    : []);

  const rows: TableRow[] = [head];
  for (const c of d.chaps) {
    rows.push(new TableRow({
      cantSplit: true,
      children: [
        cell(W.num, [plain([run(String(c.num), { bold: true, size: 19 })])], GREEN_LIGHT),
        cell(W.tema, [plain([run(c.title, { bold: true, size: 19 })]), ...pojmi(c.noviPojmi)], GREEN_LIGHT),
        cell(W.ure, [plain([run(String(c.hours), { bold: true, size: 19 })])], GREEN_LIGHT),
        ...(cols.cilji ? [cell(W.cilji, [], GREEN_LIGHT)] : []),
        ...(cols.standardi ? [cell(W.std, (c.standardi ?? []).map(s => para(stdRuns(s, 17))), GREEN_LIGHT)] : []),
      ],
    }));
    for (const r of c.rows) {
      const fill = r.custom ? tint(r.color) : undefined;
      const it = r.custom;
      rows.push(new TableRow({
        cantSplit: true,
        children: [
          cell(W.num, [plain([run(r.num, { italics: it })])], fill),
          cell(W.tema, [plain([run(r.title, { italics: it }), ...(r.izbirna ? [run(' (izbirna)', { size: 14, color: '2C6E3A', bold: true })] : [])]), ...pojmi(r.noviPojmi)], fill),
          cell(W.ure, [plain([run(String(r.hours), { italics: it })])], fill),
          ...(cols.cilji ? [cell(W.cilji, (r.cilji ?? []).map(ci => para([run('– ', {}), run(ci.text, {}), ...(ci.tip === 'I' ? [run(' (I)', { size: 14, color: '2C6E3A', bold: true })] : [])])), fill)] : []),
          ...(cols.standardi ? [cell(W.std, (r.standardi ?? []).map(s => para(stdRuns(s, 17))), fill)] : []),
        ],
      }));
    }
  }
  const sumRow = (label: string, val: number, note: string) => new TableRow({
    cantSplit: true,
    children: [
      cell(W.num, [], GREEN_LIGHT),
      cell(W.tema, [plain([run(label, { bold: true })])], GREEN_LIGHT),
      cell(W.ure, [plain([run(String(val), { bold: true })])], GREEN_LIGHT),
      ...(restSpan ? [cell(widths.slice(3).reduce((a, b) => a + b, 0), [plain([run(note, { size: 15, color: '555555' })])], GREEN_LIGHT, restSpan)] : []),
    ],
  });
  rows.push(sumRow('Skupaj ur', d.total, 'M – minimalni standard · I – izbirni cilj / standard · S – skupni standard'));
  if (d.unassigned !== null) rows.push(sumRow('Nerazporejene ure', d.unassigned, 'Ure so namenjene utrjevanju, ustnemu spraševanju in izvedbi dnevov dejavnosti'));

  const table = new Table({ rows, width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED });

  // naslovna stran
  const f = d.fields;
  const info = (label: string, value: string) => new TableRow({
    height: { value: mm(12), rule: HeightRule.ATLEAST },
    children: [
      new TableCell({ width: { size: mm(40), type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } }, verticalAlign: VerticalAlign.BOTTOM, children: [plain([run(label, { size: 24, color: '555555' })], 40)] }),
      new TableCell({ width: { size: mm(110), type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } }, verticalAlign: VerticalAlign.BOTTOM, children: [plain([run(value, { size: 24, bold: true })], 40)] }),
    ],
  });
  const noB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const sign = (label: string) => new TableCell({
    width: { size: mm(75), type: WidthType.DXA }, borders: { top: noB, left: noB, right: noB, bottom: noB },
    children: [new Paragraph({ children: [], spacing: { before: 700 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } } }), plain([run(label, { size: 20, color: '444444' })])],
  });
  const gap = new TableCell({ width: { size: mm(30), type: WidthType.DXA }, borders: { top: noB, left: noB, right: noB, bottom: noB }, children: [new Paragraph({ children: [] })] });

  const cover = [
    new Paragraph({ children: [new TextRun({ text: 'Letna priprava', font: FONT, size: 68, color: GREEN })], spacing: { before: 900, after: 500 }, border: { bottom: { style: BorderStyle.SINGLE, size: 36, color: GREEN, space: 6 } } }),
    new Table({
      width: { size: mm(150), type: WidthType.DXA }, columnWidths: [mm(40), mm(110)], layout: TableLayoutType.FIXED, borders: TableBorders.NONE,
      rows: [info('Šola', f.school), info('Predmet', f.subject), info('Razred', f.cls), info('Šolsko leto', f.year), info('Učitelj(ica)', f.teacher), info('Število ur', f.hours), info('Datum', f.date)],
    }),
    new Paragraph({ children: [], spacing: { after: 600 } }),
    new Table({
      width: { size: mm(180), type: WidthType.DXA }, columnWidths: [mm(75), mm(30), mm(75)], layout: TableLayoutType.FIXED, borders: TableBorders.NONE,
      rows: [new TableRow({ children: [sign('Podpis učitelja(ice)'), gap, sign('Podpis ravnatelja(ice)')] })],
    }),
  ];

  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'STRAN ', font: FONT, size: 14, color: '444444' }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 14, color: '444444' }),
        new TextRun({ text: ' OD ', font: FONT, size: 14, color: '444444' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 14, color: '444444' }),
      ],
    })],
  });
  const page = { size: { orientation: PageOrientation.LANDSCAPE, width: mm(210), height: mm(297) }, margin: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15), footer: mm(7) } };

  const doc = new Document({
    creator: 'Učni načrt', title: 'Letna priprava',
    styles: { default: { document: { run: { font: FONT, size: 17 } } } },
    sections: [
      { properties: { page }, footers: { default: footer }, children: cover },
      { properties: { page }, footers: { default: footer }, children: [table] },
    ],
  });
  return Packer.toBlob(doc);
}
