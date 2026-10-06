'use client';

import { useEffect, useRef, useState } from 'react';
import { sanitizeRichHtml, plainToHtml } from '@/lib/richText';
import { downscaleImage } from '@/lib/quiz/image';

/**
 * Polje brez orodne vrstice, ki ob lepljenju ohrani obliko (Word, splet): nadpisano,
 * podpisano, krepko, tabele, MathML enačbe, slike. Vrednost je očiščen HTML.
 */
export default function RichField({ value, onChange, placeholder, minHeight = 56, onSubmit }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Ctrl/⌘ + Enter */
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // zunanja sprememba (npr. ponastavitev po dodajanju) — ne prepisuj med tipkanjem
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
  }, [value]);
  // obvestilo o neprilepljenih slikah izgine, ko se polje ponastavi (npr. po »Dodaj«)
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (!value && prevValue) setNotice(null);
  }

  const emit = () => { if (ref.current) onChange(ref.current.innerHTML); };

  const insert = (html: string) => {
    ref.current?.focus();
    // execCommand ohrani razveljavitev (Ctrl+Z) in mesto kazalca
    if (!document.execCommand('insertHTML', false, html) && ref.current) ref.current.innerHTML += html;
    emit();
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    setNotice(null);
    const cd = e.clipboardData;
    const html = cd.getData('text/html');
    const text = cd.getData('text/plain');
    const images = Array.from(cd.files).filter(f => f.type.startsWith('image/'));

    if (html) {
      const res = sanitizeRichHtml(html);
      let out = res.html;
      // Word enačbe/slike pride v HTML kot lokalne datoteke (file://), do katerih brskalnik ne more;
      // če je v odložišču tudi slika, jo uporabi namesto njih
      if (res.droppedImages && images.length) {
        const urls = await Promise.all(images.map(f => downscaleImage(f, 900, 0.85).catch(() => null)));
        out += urls.filter(Boolean).map(u => `<img src="${u}">`).join('');
      } else if (res.droppedImages) {
        setNotice('Nekaterih slik/enačb ni bilo mogoče prilepiti. Enačbo v Wordu kopiraj posebej (kot sliko) ali jo prilepi iz spleta.');
      }
      if (out) { insert(out); return; }
    }
    if (images.length) {
      const urls = await Promise.all(images.map(f => downscaleImage(f, 900, 0.85).catch(() => null)));
      insert(urls.filter(Boolean).map(u => `<img src="${u}">`).join(''));
      return;
    }
    if (text) insert(plainToHtml(text));
  };

  return (
    <div>
      <div
        ref={ref}
        className="rich-field"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        data-placeholder={placeholder}
        onInput={emit}
        onPaste={e => void onPaste(e)}
        onDrop={e => e.preventDefault()}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) { e.preventDefault(); onSubmit(); } }}
        style={{
          minHeight, boxSizing: 'border-box', fontFamily: 'var(--font-sans)', fontSize: '13px', lineHeight: 1.5,
          color: 'var(--body)', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)',
          padding: '8px 10px', outline: 'none', overflowWrap: 'anywhere',
        }}
      />
      {notice && <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#b7791f', margin: '4px 0 0' }}>{notice}</p>}
    </div>
  );
}
