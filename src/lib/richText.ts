/**
 * Varno "obogateno besedilo" za prilepljeno vsebino (Word, splet): ohrani le oblikovanje,
 * ki je pomembno za vprašanja (nadpisano/podpisano, krepko/ležeče, sezname, tabele,
 * MathML enačbe, slike) — vse ostalo (skripte, sloge, razrede, dogodke) zavrže.
 */

const HTML_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 'sub', 'sup', 'br', 'p', 'div', 'span',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img',
]);
const MATH_TAGS = new Set([
  'math', 'semantics', 'annotation', 'mrow', 'mi', 'mn', 'mo', 'ms', 'mtext', 'mspace',
  'mfrac', 'msqrt', 'mroot', 'msup', 'msub', 'msubsup', 'mover', 'munder', 'munderover',
  'mtable', 'mtr', 'mtd', 'mfenced', 'menclose', 'mpadded', 'mphantom', 'mstyle',
]);
const MATH_ATTRS = new Set(['display', 'mathvariant', 'stretchy', 'fence', 'separator', 'accent', 'accentunder', 'linethickness', 'open', 'close', 'separators', 'notation', 'encoding', 'columnalign', 'rowalign']);
/** elementi, ki jih zavržemo skupaj z vsebino */
const DROP = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'iframe', 'object', 'embed', 'svg', 'template', 'xml']);

const safeImgSrc = (src: string) => /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src) || /^https:\/\//i.test(src);

export interface SanitizeResult { html: string; droppedImages: number }

export function sanitizeRichHtml(input: string): SanitizeResult {
  if (typeof window === 'undefined') return { html: '', droppedImages: 0 };
  // Wordovi pogojni komentarji (<!--[if …]> … <![endif]-->) in <o:p> ne sodijo v rezultat
  const cleaned = input
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!\[if[^\]]*\]>|<!\[endif\]>/gi, '');
  const doc = new DOMParser().parseFromString(cleaned, 'text/html');
  let droppedImages = 0;

  const walk = (node: Node, out: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) { out.appendChild(document.createTextNode(child.textContent ?? '')); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const tag = el.localName.toLowerCase();
      if (DROP.has(tag)) continue;

      if (MATH_TAGS.has(tag)) {
        const m = document.createElementNS('http://www.w3.org/1998/Math/MathML', tag);
        for (const a of Array.from(el.attributes)) if (MATH_ATTRS.has(a.name)) m.setAttribute(a.name, a.value);
        walk(el, m);
        out.appendChild(m);
        continue;
      }

      if (!HTML_TAGS.has(tag)) { walk(el, out); continue; } // neznan element: obdrži le vsebino

      if (tag === 'img') {
        const src = el.getAttribute('src') ?? '';
        if (!safeImgSrc(src)) { droppedImages++; continue; }
        const img = document.createElement('img');
        img.setAttribute('src', src);
        const alt = el.getAttribute('alt'); if (alt) img.setAttribute('alt', alt);
        out.appendChild(img);
        continue;
      }

      // Word pogosto označi nadpisano/podpisano/krepko le s slogom na <span>
      const style = (el.getAttribute('style') ?? '').toLowerCase();
      let target: Element = document.createElement(tag === 'span' ? 'span' : tag);
      if (tag === 'span') {
        if (/vertical-align:\s*super/.test(style)) target = document.createElement('sup');
        else if (/vertical-align:\s*sub/.test(style)) target = document.createElement('sub');
        else if (/font-weight:\s*(bold|[6-9]00)/.test(style)) target = document.createElement('b');
        else if (/font-style:\s*italic/.test(style)) target = document.createElement('i');
      }
      if (tag === 'td' || tag === 'th') {
        for (const a of ['colspan', 'rowspan']) { const v = el.getAttribute(a); if (v && /^\d+$/.test(v)) target.setAttribute(a, v); }
      }
      walk(el, target);
      // prazne ovojnice (span brez vsebine) izpusti
      if (target.localName === 'span' && !target.childNodes.length) continue;
      out.appendChild(target);
    }
  };

  const root = document.createElement('div');
  walk(doc.body, root);
  // odvečni prazni odstavki iz Worda
  root.querySelectorAll('p, div').forEach(p => { if (!p.textContent?.trim() && !p.querySelector('img, math, br')) p.remove(); });
  return { html: root.innerHTML.trim(), droppedImages };
}

export function plainToHtml(text: string): string {
  const esc = text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  return esc.replace(/\r?\n/g, '<br>');
}

/** Je vsebina (brez oznak) prazna? */
export function isRichEmpty(html: string): boolean {
  if (!html) return true;
  if (/<(img|math)\b/i.test(html)) return false;
  return !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}
