'use client';

import { useEffect, useRef, useState } from 'react';
import { sanitizeRichHtml, plainToHtml } from '@/lib/richText';
import { downscaleImage } from '@/lib/quiz/image';

/**
 * Polje brez orodne vrstice, ki ob lepljenju ohrani obliko (Word, splet): nadpisano,
 * podpisano, krepko, tabele, MathML enačbe, slike. Vrednost je očiščen HTML.
 */
export default function RichField({ value, onChange, placeholder, minHeight = 56, onSubmit, allowImage = false }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Ctrl/⌘ + Enter */
  onSubmit?: () => void;
  /** gumb »Slika« (npr. fizikalne skice) */
  allowImage?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // zadnji položaj kazalca v polju — gumb »Slika« vzame fokus, slika pa naj gre tja, kjer si pisal
  const lastRange = useRef<Range | null>(null);
  const rememberRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) lastRange.current = sel.getRangeAt(0).cloneRange();
  };
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
    const r = lastRange.current;
    if (r && ref.current?.contains(r.startContainer)) {
      const sel = window.getSelection();
      sel?.removeAllRanges(); sel?.addRange(r);
    }
    // execCommand ohrani razveljavitev (Ctrl+Z) in mesto kazalca
    if (!document.execCommand('insertHTML', false, html) && ref.current) ref.current.innerHTML += html;
    emit();
  };

  const insertImages = async (files: File[]) => {
    const urls = await Promise.all(files.map(f => downscaleImage(f, 1000, 0.85).catch(() => null)));
    const ok = urls.filter(Boolean);
    if (ok.length < files.length) setNotice('Slike ni bilo mogoče prebrati.');
    if (ok.length) insert(ok.map(u => `<img src="${u}">`).join(''));
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
      const out = res.html;
      // Word enačbe/slike pride v HTML kot lokalne datoteke (file://), do katerih brskalnik ne more;
      // če je v odložišču tudi slika, jo uporabi namesto njih
      if (res.droppedImages && images.length) {
        if (out) insert(out);
        await insertImages(images);
        return;
      } else if (res.droppedImages) {
        setNotice('Nekaterih slik/enačb ni bilo mogoče prilepiti. Enačbo v Wordu kopiraj posebej (kot sliko) ali jo prilepi iz spleta.');
      }
      if (out) { insert(out); return; }
    }
    if (images.length) { await insertImages(images); return; }
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
        onDrop={e => {
          e.preventDefault();
          const imgs = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
          if (imgs.length) void insertImages(imgs);
        }}
        onKeyUp={rememberRange}
        onMouseUp={rememberRange}
        onBlur={rememberRange}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) { e.preventDefault(); onSubmit(); } }}
        style={{
          minHeight, boxSizing: 'border-box', fontFamily: 'var(--font-sans)', fontSize: '13px', lineHeight: 1.5,
          color: 'var(--body)', background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)',
          padding: '8px 10px', outline: 'none', overflowWrap: 'anywhere',
        }}
      />
      {allowImage && (
        <>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
            title="Vstavi sliko (npr. fizikalno skico) na mesto kazalca — lahko jo tudi prilepiš ali povlečeš v polje"
            style={{ marginTop: '4px', fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--forest)', background: 'transparent', border: '1px dashed var(--hairline)', borderRadius: 'var(--r-sm)', padding: '3px 9px', cursor: 'pointer' }}>
            🖼 Slika
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) void insertImages(fs); }} />
        </>
      )}
      {notice && <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#b7791f', margin: '4px 0 0' }}>{notice}</p>}
    </div>
  );
}
