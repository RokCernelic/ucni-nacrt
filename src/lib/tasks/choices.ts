import type { TaskDraft } from './types';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const LETTER = /^\s*([A-Fa-f])\s*[).]\s*([\s\S]*)$/;

/**
 * Loči besedilo naloge na vprašanje in zaključni seznam možnosti »A) … B) … C) …« (zaporedni odstavki
 * od A naprej, vsaj dve). Vrne null, če takega seznama ni. Deluje le v brskalniku (DOMParser).
 */
export function splitChoices(html: string): { stem: string; options: string[] } | null {
  if (typeof window === 'undefined' || !html) return null;
  const root = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const blocks = Array.from(root.childNodes).filter(n => !(n.nodeType === 3 && !(n.textContent ?? '').trim()));
  const letters = blocks.map(b => LETTER.exec((b.textContent ?? '').trim()));
  // najdi začetek niza: A, B, C … do konca
  for (let i = 0; i < blocks.length - 1; i++) {
    if (letters[i]?.[1].toUpperCase() !== 'A') continue;
    let ok = true;
    for (let j = i; j < blocks.length; j++) {
      if (letters[j]?.[1].toUpperCase() !== 'ABCDEF'[j - i]) { ok = false; break; }
    }
    if (!ok || blocks.length - i < 2) continue;
    const stem = blocks.slice(0, i).map(b => (b instanceof Element ? b.outerHTML : (b.textContent ?? ''))).join('');
    if (!stem.replace(/<[^>]*>/g, '').trim()) return null; // brez vprašanja ne razdeljuj
    return { stem, options: letters.slice(i).map(m => (m?.[2] ?? '').trim()) };
  }
  return null;
}

/** Možnosti A–D v besedilu so že tudi v poljih za možnosti → vrne nalogo brez podvojenega seznama v besedilu (sicer null). */
export function stripDuplicateChoices<T extends Pick<TaskDraft, 'answer_kind' | 'options' | 'body'>>(t: T): T | null {
  if (t.answer_kind !== 'mc' || !t.options?.length) return null;
  const sp = splitChoices(t.body);
  if (!sp || sp.options.length !== t.options.length) return null;
  if (!sp.options.every((o, i) => norm(o) === norm(t.options![i].text))) return null;
  return { ...t, body: sp.stem };
}
