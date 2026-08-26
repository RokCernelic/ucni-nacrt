import type { Predmet, Poglavje, Standard } from '@/types/curriculum';

const stripBold = (s: string) => s.replace(/\*\*/g, '');

/** Zavije besedilo na ~width znakov; nadaljevalne vrstice dobijo `indent`. */
function wrap(s: string, indent: string, width = 100): string {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) { lines.push(line); line = w; }
    else line = (line ? line + ' ' : '') + w;
  }
  if (line) lines.push(line);
  return lines.map((l, i) => (i === 0 ? '' : indent) + l).join('\n');
}

function stdTags(s: Standard): string {
  const t: string[] = [];
  if (s.minimalni) t.push('M');
  if (s.izbirni) t.push('I');
  if (s.shared) t.push('S');
  return t.length ? '  [' + t.join(',') + ']' : '';
}

function chapterNumber(predmet: Predmet, poglavje: Poglavje, gradeCounters: Record<number, number>): number {
  const continuous = predmet.continuousNumbering ?? false;
  if (continuous) return predmet.poglavja.indexOf(poglavje) + 1;
  const r = poglavje.razred ?? 0;
  gradeCounters[r] = (gradeCounters[r] ?? 0) + 1;
  return gradeCounters[r];
}

/** Pretvori učni načrt v besedilo (LDN-oblika). */
export function curriculumToText(predmet: Predmet): string {
  const L: string[] = [];
  const bar = '='.repeat(60);
  L.push(bar);
  L.push('UČNI NAČRT — ' + predmet.naslov.toUpperCase());
  L.push(predmet.opis);
  L.push(bar);
  L.push('');
  L.push('');

  const gradeCounters: Record<number, number> = {};
  let lastRazred: number | null = null;

  predmet.poglavja.forEach((poglavje, ci) => {
    const razred = poglavje.razred ?? 0;
    if (razred !== lastRazred) {
      if (lastRazred !== null) { L.push(''); }
      L.push('────────────────────────────────────────');
      L.push('  ' + razred + '. RAZRED');
      L.push('────────────────────────────────────────');
      L.push('');
      lastRazred = razred;
    } else if (ci > 0) {
      // dodatni presledek med poglavji istega razreda
      L.push('');
    }

    const num = chapterNumber(predmet, poglavje, gradeCounters);

    L.push('POGLAVJE ' + num + ': ' + poglavje.naslov);
    L.push('');
    if (poglavje.opis) {
      L.push('Opis poglavja:');
      for (const para of poglavje.opis.split('\n\n')) {
        L.push('  ' + wrap(para, '  '));
      }
      L.push('');
    }

    poglavje.podpoglavja.forEach((pp) => {
      const idx = poglavje.podpoglavja.indexOf(pp) + 1;
      const ure = pp.privzeteUre ?? 1;
      L.push('  ── ' + num + '.' + idx + ' ' + pp.naslov + (pp.izbirna ? '  (izbirno)' : '') + ' (št. predvidenih ur: ' + ure + ')');

      if (pp.cilji && pp.cilji.length) {
        L.push('     CILJI:');
        for (const c of pp.cilji) {
          L.push('       (' + c.tip + ') ' + wrap(c.text, '           '));
        }
        L.push('     ');
      }
      if (pp.standardi && pp.standardi.length) {
        L.push('     STANDARDI ZNANJA:');
        for (const s of pp.standardi) {
          L.push('       - ' + wrap(stripBold(s.text), '         ') + stdTags(s));
        }
        L.push('     ');
      }
      if (pp.noviPojmi && pp.noviPojmi.length) {
        L.push('     NOVI POJMI: ' + wrap(pp.noviPojmi.join(', '), '                 '));
      }
      L.push('');
      L.push('');
    });
  });

  L.push('');
  L.push('Legenda oznak standardov:  [M] minimalni · [I] izbirni · [S] skupni');
  L.push('Legenda ciljev:  (O) obvezni · (I) izbirni');
  L.push('');
  return L.join('\n');
}

/** Sproži prenos besedilne datoteke v brskalniku. */
export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
