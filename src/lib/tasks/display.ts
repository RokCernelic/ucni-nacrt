/**
 * Prikaz nalog »vstavljanje besed« (gap) in »povezovanje« (match).
 *
 * Vstavljanje besed: manjkajoča beseda ali besedna zveza je v besedilu naloge zapisana v dvojnih oglatih oklepajih,
 * npr. »Enota za silo je [[newton]].« Učenec vidi črto (________), učitelj in rešitve pa besedo.
 *
 * Povezovanje: pari v `options` — `text` = pojem v levem stolpcu, `match` = pripadajoči pojem v desnem stolpcu;
 * vrstica s praznim `text` je dodaten (odvečen) pojem le v desnem stolpcu. Levi stolpec je oštevilčen (1, 2, 3 …),
 * desni označen s črkami (A, B, C …) v premešanem (a stalnem) vrstnem redu; učenec ob številko vpiše črko.
 */
import type { TaskOption } from './types';

const GAP_RE = /\[\[([\s\S]*?)\]\]/g;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = (h: string) => h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type T = { answer_kind: string; body: string; options: TaskOption[] | null };

/** Manjkajoče besede v vrstnem redu, kot so v besedilu. */
export const gapWords = (body: string): string[] => [...body.matchAll(GAP_RE)].map(m => plain(m[1])).filter(Boolean);

/** Črta namesto manjkajoče besede (dolžina malo daljša od besede, da ne izda odgovora). */
const blank = (w: string) => '_'.repeat(Math.max(10, Math.min(30, Math.round(plain(w).length * 1.6))));

/** Pari za povezovanje (z obema stranema) in desni stolpec (s črkami, premešan, a vedno enako). */
export function matchColumns(options: TaskOption[] | null) {
  const all = (options ?? []).filter(o => o.text.trim() || o.match?.trim());
  const pairs = all.filter(o => o.text.trim() && o.match?.trim());
  const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const right = all.filter(o => o.match?.trim()).sort((a, b) => hash(a.id) - hash(b.id) || a.id.localeCompare(b.id))
    .map((o, i) => ({ id: o.id, text: o.match!.trim(), letter: LET[i] ?? '?' }));
  const left = pairs.map((o, i) => ({ id: o.id, text: o.text.trim(), n: i + 1, letter: right.find(r => r.id === o.id)?.letter ?? '?' }));
  return { left, right };
}

function matchTable(options: TaskOption[] | null, solved: boolean): string {
  const { left, right } = matchColumns(options);
  if (!left.length) return '';
  const rows = Math.max(left.length, right.length);
  let html = '<table><tbody>';
  for (let i = 0; i < rows; i++) {
    const l = left[i], r = right[i];
    html += `<tr><td>${l ? `${l.n}. ${esc(l.text)}` : ''}</td><td>${l ? (solved ? `<b>${l.letter}</b>` : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;') : ''}</td><td>${r ? `${r.letter}) ${esc(r.text)}` : ''}</td></tr>`;
  }
  return html + '</tbody></table>';
}

/**
 * HTML naloge za prikaz: pri vstavljanju besed črte namesto manjkajočih besed (`solved`: besede krepko podčrtane),
 * pri povezovanju besedilo + tabela s stolpcema (`solved`: vpisane pravilne črke). Ostale oblike: besedilo, kot je.
 */
export function taskHtml(t: T, solved = false): string {
  if (t.answer_kind === 'gap') return t.body.replace(GAP_RE, (_, w: string) => (solved ? `<b><u>${w}</u></b>` : blank(w)));
  if (t.answer_kind === 'match') return t.body + matchTable(t.options, solved);
  return t.body;
}

/** Rešitev kot besedilo: manjkajoče besede oz. pari »1 – C, 2 – A …«; za ostale oblike null. */
export function autoAnswerText(t: T): string | null {
  if (t.answer_kind === 'gap') { const w = gapWords(t.body); return w.length ? w.join('; ') : null; }
  if (t.answer_kind === 'match') { const { left } = matchColumns(t.options); return left.length ? left.map(l => `${l.n} – ${l.letter}`).join(', ') : null; }
  return null;
}

/**
 * Besedilo naloge za vstavljanje besed brez oznak [[…]] (npr. ko AI pozabi oklepaje): manjkajoče besede `words` vstavi
 * namesto črt (___ ali …) po vrsti, sicer obda prvo pojavitev besede v besedilu (izven HTML oznak). Če oznake že so, vrne nespremenjeno.
 */
export function ensureGapMarkers(body: string, words: string[]): string {
  if (GAP_RE.test(body)) { GAP_RE.lastIndex = 0; return body; }
  GAP_RE.lastIndex = 0;
  const ws = words.map(w => w.trim()).filter(Boolean);
  if (!ws.length) return body;
  let out = body, i = 0;
  // 1) črte / tri pike namesto manjkajočih besed
  out = out.replace(/_{3,}|\.{3,}|…/g, m => (i < ws.length ? `[[${ws[i++]}]]` : m));
  if (i === ws.length) return out;
  // 2) preostale besede: prva pojavitev v besedilu (ne znotraj oznak)
  for (const w of ws.slice(i)) {
    const re = new RegExp(`(^|>)([^<]*?)(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
    if (re.test(out)) out = out.replace(re, (_, a: string, b: string, c: string) => `${a}${b}[[${c}]]`);
  }
  return out;
}
