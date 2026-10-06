/**
 * Izvoz nalog v LaTeX (.tex) v obliki zbirke nalog (okolje `naloga` z oznakami), ki jo bere tudi uvoz.
 * Isti model (skupine, oznake, oštevilčenje) uporablja LaTeX-videz tiska (PrintTasks).
 */
import { BLOOM, KINDS, type Task } from './types';
import { chapterInfo, topicInfo } from './topics';
import { orderTasks, groupTasks, placeOf, type TaskGroup } from './order';

export const OPTION_LETTERS = ['a', 'b', 'c', 'č', 'd', 'e', 'f'];

// ───────────────────────── oznake (isti vir za tisk in izvoz) ─────────────────────────

export interface TaskMeta {
  un: string;
  poglavje: string;
  bloom: number | null;
  tip: string;
  tezavnost: number | null;
  predznanje: string;
  izbirno: boolean;
  slika: boolean;
  podnaloge: number;
  teme: string[];
}

const TIP_NAME: Record<string, string> = {
  racunska: 'računska', besedilna: 'besedilna', graficna: 'grafična', skica: 'skica', eksperimentalna: 'eksperimentalna', povezovanje: 'povezovanje',
};

export function tipOf(t: Pick<Task, 'kinds' | 'answer_kind'>): string {
  if (t.kinds.includes('racunska') && t.kinds.includes('besedilna')) return 'kombinirana';
  if (t.kinds.length) return TIP_NAME[t.kinds[0]] ?? KINDS.find(k => k.id === t.kinds[0])?.name ?? '';
  if (t.answer_kind === 'mc' || t.answer_kind === 'tf') return 'izbira';
  return '';
}

export function countSubtasks(html: string): number {
  return (html.match(/<p>\s*<b>[a-zčšž]\)<\/b>/g) ?? []).length;
}

export function metaOf(t: Task): TaskMeta {
  const p = placeOf(t);
  const topic = p.topicKey ? topicInfo(p.topicKey) : null;
  const chapter = p.chapterKey ? chapterInfo(p.chapterKey) : null;
  const tags = t.tags.filter(x => !/^predznanje /.test(x) && x !== 'izbirni standard' && x !== 'manjka slika');
  return {
    un: topic?.number ?? chapter?.number ?? '',
    poglavje: chapter?.title ?? '',
    bloom: t.bloom,
    tip: tipOf(t),
    tezavnost: t.difficulty,
    predznanje: t.tags.find(x => /^predznanje /.test(x))?.replace(/^predznanje /, '') ?? '',
    izbirno: t.tags.includes('izbirni standard'),
    slika: /<img\b/i.test(t.body) || t.tags.includes('manjka slika'),
    podnaloge: countSubtasks(t.body),
    teme: tags,
  };
}

/** Siva vrstica pod nalogo: »6.1 · Bloom 3 (Uporaba) · računska · težavnost 2 · predznanje: 4.5 · izbirni standard«. */
export function metaLine(t: Task): string {
  const m = metaOf(t);
  const parts: string[] = [];
  if (m.un) parts.push(m.un);
  if (m.bloom) parts.push(`Bloom ${m.bloom} (${BLOOM[m.bloom - 1].name})`);
  if (m.tip) parts.push(m.tip);
  if (m.tezavnost) parts.push(`težavnost ${m.tezavnost}`);
  if (m.predznanje) parts.push(`predznanje: ${m.predznanje}`);
  if (m.izbirno) parts.push('izbirni standard');
  return parts.join(' · ');
}

/** Besedilo odgovora (rešitev) kot navadno besedilo — za tisk z rešitvami in izvoz. */
export function correctText(t: Task): string {
  if ((t.answer_kind === 'mc' || t.answer_kind === 'tf') && t.options) {
    const i = t.options.findIndex(o => o.id === t.correct);
    return i >= 0 ? `${OPTION_LETTERS[i]}) ${t.options[i].text}` : '';
  }
  if (t.answer_kind === 'numeric' && t.correct) {
    return `${t.correct}${t.tolerance ? ` ± ${String(t.tolerance).replace('.', ',')}` : ''}${t.unit ? ` ${t.unit}` : ''}`;
  }
  return '';
}

// ───────────────────────── HTML → LaTeX ─────────────────────────

const TEXT_SYMBOLS: Record<string, string> = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#', '_': '\\_', '%': '\\%',
  '~': '\\textasciitilde{}', '^': '\\textasciicircum{}', '"': '\\textquotedbl{}',
  '\u00a0': '~', '\u2009': '\\,', '\u202f': '\\,', '…': '\\ldots{}', '–': '--', '—': '---',
  '°': '\\textdegree{}',
  '×': '$\\times$', '÷': '$\\div$', '±': '$\\pm$', '∓': '$\\mp$', '·': '$\\cdot$', '−': '$-$', '≈': '$\\approx$', '≠': '$\\neq$',
  '≤': '$\\leq$', '≥': '$\\geq$', '∞': '$\\infty$', '→': '$\\rightarrow$', '⇒': '$\\Rightarrow$', '←': '$\\leftarrow$', '↔': '$\\leftrightarrow$',
  '∆': '$\\Delta$', '√': '$\\sqrt{\\ }$', '∝': '$\\propto$', '∑': '$\\sum$',
};
const GREEK: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'varepsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ι: 'iota', κ: 'kappa', λ: 'lambda',
  μ: 'mu', 'µ': 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma', τ: 'tau', υ: 'upsilon', φ: 'varphi', χ: 'chi', ψ: 'psi', ω: 'omega',
  Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Ξ: 'Xi', Π: 'Pi', Σ: 'Sigma', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
};
for (const [ch, name] of Object.entries(GREEK)) TEXT_SYMBOLS[ch] = `$\\${name}$`;

/** Besedilo → LaTeX (znaki, ki jih TeX bere posebej, so ubežani; simboli → matematika). */
export function escapeTex(text: string): string {
  let out = '';
  for (const ch of text) out += TEXT_SYMBOLS[ch] ?? ch;
  return out;
}

const MATH_SYMBOLS: Record<string, string> = {
  '×': '\\times ', '÷': '\\div ', '±': '\\pm ', '∓': '\\mp ', '·': '\\cdot ', '−': '-', '≈': '\\approx ', '≠': '\\neq ', '≤': '\\leq ', '≥': '\\geq ',
  '∞': '\\infty ', '→': '\\rightarrow ', '⇒': '\\Rightarrow ', '←': '\\leftarrow ', '°': '^{\\circ}', '∆': '\\Delta ', '∝': '\\propto ', '∑': '\\sum ',
  '%': '\\%', '#': '\\#', '$': '\\$', '&': '\\&', '_': '\\_', '{': '\\{', '}': '\\}', '\\': '\\backslash ', '~': '\\sim ',
};
for (const [ch, name] of Object.entries(GREEK)) MATH_SYMBOLS[ch] = `\\${name} `;

function mathChars(text: string): string {
  let out = '';
  for (const ch of text.replace(/\s+/g, ' ')) {
    if (MATH_SYMBOLS[ch]) out += MATH_SYMBOLS[ch];
    else if (/[A-Za-z0-9+\-=()[\]/<>.,;:!?|' ]/.test(ch)) out += ch;
    else out += `\\text{${ch}}`;
  }
  return out;
}

function mathNode(n: Node): string {
  if (n.nodeType === Node.TEXT_NODE) return mathChars(n.textContent ?? '');
  if (n.nodeType !== Node.ELEMENT_NODE) return '';
  const el = n as Element;
  const kids = Array.from(el.childNodes);
  const inner = () => kids.map(mathNode).join('');
  const arg = (i: number) => `{${kids[i] ? mathNode(kids[i]) : ''}}`;
  switch (el.localName) {
    case 'mfrac': return `\\frac${arg(0)}${arg(1)}`;
    case 'msqrt': return `\\sqrt{${inner()}}`;
    case 'mroot': return `\\sqrt[${kids[1] ? mathNode(kids[1]) : ''}]{${kids[0] ? mathNode(kids[0]) : ''}}`;
    case 'msup': return `${arg(0)}^${arg(1)}`;
    case 'msub': return `${arg(0)}_${arg(1)}`;
    case 'msubsup': return `${arg(0)}_${arg(1)}^${arg(2)}`;
    case 'mi': { const t = el.textContent ?? ''; return t.length > 1 && /^[A-Za-z]+$/.test(t) ? `\\mathrm{${t}}` : mathChars(t); }
    case 'mspace': case 'annotation': return '';
    default: return inner();
  }
}

export interface TexImage { name: string; url: string }

interface Ctx { images: TexImage[]; nextImage: () => number }

const imgExt = (src: string) => {
  const m = src.match(/^data:image\/(png|jpe?g)/i) ?? src.match(/\.(png|jpe?g)(?:$|\?)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
};

function inline(n: Node, ctx: Ctx): string {
  if (n.nodeType === Node.TEXT_NODE) return escapeTex((n.textContent ?? '').replace(/[ \t\r\n]+/g, ' '));
  if (n.nodeType !== Node.ELEMENT_NODE) return '';
  const el = n as Element;
  const kids = () => Array.from(el.childNodes).map(c => inline(c, ctx)).join('');
  switch (el.localName) {
    case 'b': case 'strong': return `\\textbf{${kids()}}`;
    case 'i': case 'em': return `\\textit{${kids()}}`;
    case 'u': return `\\underline{${kids()}}`;
    case 'sub': return `\\textsubscript{${kids()}}`;
    case 'sup': return `\\textsuperscript{${kids()}}`;
    case 'br': return '\\newline{}';
    case 'math': return `$${mathNode(el)}$`;
    case 'img': {
      const src = el.getAttribute('src') ?? '';
      if (!src) return '';
      const name = `img/slika-${ctx.nextImage()}.${imgExt(src)}`;
      ctx.images.push({ name, url: src });
      return `\\slika{${name}}`;
    }
    default: return kids();
  }
}

function listEnv(el: Element, ctx: Ctx): string {
  const env = el.localName === 'ol' ? 'enumerate' : 'itemize';
  const items = Array.from(el.children).filter(c => c.localName === 'li')
    .map(li => `  \\item ${Array.from(li.childNodes).map(c => inline(c, ctx)).join('').trim()}`);
  return `\\begin{${env}}\n${items.join('\n')}\n\\end{${env}}`;
}

function tableEnv(el: Element, ctx: Ctx): string {
  const rows = Array.from(el.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => Array.from(c.childNodes).map(x => inline(x, ctx)).join('').trim()));
  const cols = Math.max(1, ...rows.map(r => r.length));
  const body = rows.map(r => `${[...r, ...Array(cols - r.length).fill('')].join(' & ')} \\\\ \\hline`).join('\n');
  return `\\begin{center}\n\\begin{tabular}{|${'l|'.repeat(cols)}}\n\\hline\n${body}\n\\end{tabular}\n\\end{center}`;
}

/** Očiščen HTML naloge → LaTeX (odstavki ločeni s prazno vrstico; a) b) → \podnaloga; sličice → \slika). */
export function htmlToTex(html: string, ctx: Ctx): string {
  if (typeof window === 'undefined' || !html.trim()) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out: string[] = [];
  let loose = '';
  const flushLoose = () => { if (loose.trim()) out.push(loose.trim()); loose = ''; };
  let idx = 0;
  for (const n of Array.from(doc.body.childNodes)) {
    const el = n.nodeType === Node.ELEMENT_NODE ? (n as Element) : null;
    const tag = el?.localName;
    if (tag === 'p' || tag === 'div') {
      flushLoose();
      const first = el!.firstElementChild;
      const sub = first?.localName === 'b' && first === el!.firstChild ? first.textContent?.match(/^([a-zčšž])\)$/) : null;
      if (sub) {
        const rest = Array.from(el!.childNodes).slice(1).map(c => inline(c, ctx)).join('').trim();
        out.push(`\\podnaloga{${sub[1]}}{${rest}}`);
      } else if (el!.childNodes.length === 1 && first?.localName === 'i' && idx > 0) {
        out.push(`\\opomba{${inline(first, ctx).replace(/^\\textit\{|\}$/g, '')}}`);
      } else {
        const t = Array.from(el!.childNodes).map(c => inline(c, ctx)).join('').trim();
        if (t) out.push(t);
      }
      idx++;
    } else if (tag === 'ul' || tag === 'ol') { flushLoose(); out.push(listEnv(el!, ctx)); idx++; }
    else if (tag === 'table') { flushLoose(); out.push(tableEnv(el!, ctx)); idx++; }
    else loose += inline(n, ctx);
  }
  flushLoose();
  // zaporedne podnaloge v sosednjih vrsticah (kot v zbirki), ostalo ločeno s prazno vrstico
  return out.reduce((acc, piece, i) => (i === 0 ? piece : `${acc}${piece.startsWith('\\podnaloga') && out[i - 1].startsWith('\\podnaloga') ? '\n' : '\n\n'}${piece}`), '');
}

// ───────────────────────── celotna datoteka .tex ─────────────────────────

export interface TexOptions {
  title: string;
  /** privzeto: oznake (6.1 · Bloom …) pod nalogami */
  withMeta: boolean;
  /** privzeto: rešitve pod nalogami */
  withSolutions: boolean;
}

export interface TexResult { tex: string; images: TexImage[]; count: number }

const keyVal = (k: string, v: string | number) => `${k}=${typeof v === 'number' || /^[\w.\u00c0-\u024f-]+$/.test(v) ? v : `{${escapeTex(v)}}`}`;

function preamble(o: TexOptions, subtitle: string, fileBase: string) {
  return String.raw`% !TEX program = xelatex
% ======================================================================
% ${o.title.replace(/[\r\n]+/g, ' ')}
% Izvoženo iz aplikacije Učni načrt (Baza nalog), ${new Date().toISOString().slice(0, 10)}.
% Prevajanje:  xelatex ${fileBase}.tex   (slike so v mapi img/)
%   - učitelj (z oznakami):        xelatex "\def\withmeta{1}\input{${fileBase}.tex}"
%   - učenci (brez oznak):         xelatex "\def\nometa{1}\input{${fileBase}.tex}"
%   - z rešitvami:                 xelatex "\def\withresitve{1}\input{${fileBase}.tex}"
%   - brez rešitev:                xelatex "\def\noresitve{1}\input{${fileBase}.tex}"
% Privzeto: oznake ${o.withMeta ? 'DA' : 'NE'}, rešitve ${o.withSolutions ? 'DA' : 'NE'}.
% ======================================================================
\documentclass[a4paper,11pt]{article}
\usepackage{fontspec}
\IfFileExists{slovene.ldf}{\usepackage[slovene]{babel}}{\IfFileExists{slovenian.ldf}{\usepackage[slovenian]{babel}}{}}
\usepackage[margin=2.2cm]{geometry}
\usepackage{xcolor}
\usepackage{pgfkeys}
\usepackage{needspace}
\usepackage{booktabs}
\usepackage{amsmath}
\usepackage{graphicx}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}

\newif\ifmeta \meta${o.withMeta ? 'true' : 'false'}
\ifdefined\nometa \metafalse\fi
\ifdefined\withmeta \metatrue\fi
\newif\ifresitve \resitve${o.withSolutions ? 'true' : 'false'}
\ifdefined\noresitve \resitvefalse\fi
\ifdefined\withresitve \resitvetrue\fi

% ---- ključi oznak naloge (enako kot v zbirki nalog) ----------------------
\pgfkeys{/naloga/.cd,
  id/.store in=\nlId, staroid/.store in=\nlStaro, poglavje/.store in=\nlPoglavje,
  un/.store in=\nlUn, izven6/.store in=\nlIzven, predznanje/.store in=\nlPred,
  izbirno/.store in=\nlIzb, bloom/.store in=\nlBloom, tip/.store in=\nlTip,
  tezavnost/.store in=\nlTez, podnaloge/.store in=\nlPod, slika/.store in=\nlSlika,
  teme/.store in=\nlTeme}

\newcommand{\bloomime}[1]{\ifcase#1\or Poznavanje\or Razumevanje\or Uporaba\or Analiza\or Vrednotenje\or Ustvarjanje\fi}
\newcommand{\podnaloga}[2]{\par\hangindent=2.2em\hangafter=1\hspace*{1.2em}\textbf{#1)}\ #2\par}
\newcommand{\opomba}[1]{\par\hspace*{1.2em}\textit{#1}\par}
\newcommand{\moznosti}[1]{\par\hspace*{1.2em}#1\par}
\newcommand{\slika}[1]{\IfFileExists{#1}{\begin{center}\includegraphics[width=\linewidth,height=6cm,keepaspectratio]{#1}\end{center}}{\fbox{\small slika: #1}}}
\newcommand{\resitev}[1]{\ifresitve\par\hspace*{1.2em}{\small\textbf{Rešitev:}\ #1}\par\fi}

\newif\iffirstpart
\newcommand{\metapart}[1]{\iffirstpart\firstpartfalse\else\ $\cdot$\ \fi #1}
\newcommand{\metaline}{\firstparttrue
  \ifx\nlUn\empty\else\metapart{\nlUn}\fi
  \ifx\nlBloom\empty\else\metapart{Bloom \nlBloom\ (\bloomime{\nlBloom})}\fi
  \ifx\nlTip\empty\else\metapart{\nlTip}\fi
  \ifx\nlTez\empty\else\metapart{težavnost \nlTez}\fi
  \ifx\nlPred\empty\else\metapart{predznanje: \nlPred}\fi
  \ifx\nlIzb\empty\else\metapart{izbirni standard}\fi}

\newenvironment{naloga}[1][]{%
  \Needspace{5\baselineskip}\medskip
  \def\nlId{}\def\nlStaro{}\def\nlPoglavje{}\def\nlUn{}\def\nlIzven{ne}\def\nlPred{}\def\nlIzb{}%
  \def\nlBloom{}\def\nlTip{}\def\nlTez{}\def\nlPod{}\def\nlSlika{}\def\nlTeme{}%
  \pgfkeys{/naloga/.cd,#1}%
  \par\noindent\textbf{\nlId.}\ \ignorespaces
}{%
  \par
  \ifmeta{\footnotesize\color{gray}\metaline\par}\fi
  \smallskip
}

\title{${escapeTex(o.title)}}
\author{${escapeTex(subtitle)}}
\date{}

\begin{document}
\maketitle
`;
}

/** Podnaslov lista (npr. »Fizika, 9. razred«) in oznaka razreda/predmeta pri poglavju, če list združuje več. */
export function sheetInfo(groups: TaskGroup[]) {
  const many = new Set(groups.map(g => `${g.predmet}|${g.grade ?? ''}`)).size > 1;
  const subjects = new Set(groups.map(g => g.predmet).filter(Boolean));
  const grades = new Set(groups.map(g => g.grade).filter(Boolean));
  return {
    subtitle: [subjects.size === 1 ? [...subjects][0] : '', grades.size === 1 ? `${[...grades][0]}. razred` : ''].filter(Boolean).join(', '),
    /** npr. »8. razred« ali »8. razred, Tehnika in tehnologija« (prazno, če je na listu samo ena skupina) */
    context: (g: TaskGroup) => (many && g.grade ? `${g.grade}. razred${subjects.size > 1 && g.predmet ? `, ${g.predmet}` : ''}` : ''),
  };
}

/** Razporedi naloge po poglavjih/podpoglavjih in jih zapiše v .tex (slike so seznam za mapo img/). */
export function buildTex(tasks: Task[], opts: TexOptions, fileBase = 'naloge'): TexResult {
  const ordered = orderTasks(tasks);
  const groups: TaskGroup[] = groupTasks(ordered);
  const images: TexImage[] = [];
  let imgN = 0;
  const ctx: Ctx = { images, nextImage: () => ++imgN };

  const info = sheetInfo(groups);
  const { subtitle } = info;

  let n = 0;
  const body: string[] = [];
  for (const g of groups) {
    const ctxLabel = info.context(g) ? ` (${info.context(g).replace('. razred', '.\\,razred')})` : '';
    body.push(`\n\\section*{${escapeTex(g.chapterTitle)}${ctxLabel}}\n`);
    for (const sub of g.topics) {
      if (sub.title) body.push(`\n\\subsection*{${escapeTex(sub.title)}}\n`);
      for (const t of sub.tasks) {
        n++;
        const m = metaOf(t);
        const keys = [
          keyVal('id', n),
          ...(m.poglavje ? [keyVal('poglavje', m.poglavje)] : []),
          ...(m.un ? [keyVal('un', m.un)] : []),
          ...(m.predznanje ? [keyVal('predznanje', m.predznanje)] : []),
          ...(m.izbirno ? [keyVal('izbirno', 'da')] : []),
          ...(m.bloom ? [keyVal('bloom', m.bloom)] : []),
          ...(m.tip ? [keyVal('tip', m.tip)] : []),
          ...(m.tezavnost ? [keyVal('tezavnost', m.tezavnost)] : []),
          keyVal('podnaloge', m.podnaloge),
          keyVal('slika', m.slika ? 'da' : 'ne'),
          ...(m.teme.length ? [keyVal('teme', m.teme.join(', '))] : []),
        ].join(', ');
        const parts = [htmlToTex(t.body, ctx)];
        if ((t.answer_kind === 'mc' || t.answer_kind === 'tf') && t.options?.length) {
          parts.push(`\\moznosti{${t.options.map((o, i) => `${OPTION_LETTERS[i]}) ${escapeTex(o.text)}`).join(', ')}}`);
        }
        const sol: string[] = [];
        const ct = correctText(t);
        if (ct) sol.push(escapeTex(ct));
        if (t.answer) sol.push(htmlToTex(t.answer, ctx).replace(/\n\n/g, ' \\newline{} '));
        if (t.solution) sol.push(htmlToTex(t.solution, ctx).replace(/\n\n/g, ' \\newline{} '));
        if (sol.length) parts.push(`\\resitev{${sol.join(' \\newline{} ')}}`);
        body.push(`\\begin{naloga}[${keys}]\n${parts.join('\n')}\n\\end{naloga}\n`);
      }
    }
  }
  const tex = `${preamble(opts, subtitle, fileBase)}${body.join('\n')}\n\\end{document}\n`;
  return { tex, images, count: n };
}
