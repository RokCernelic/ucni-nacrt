'use client';

import { useEffect, useState } from 'react';

/**
 * Povečava slik: klik na sliko v besedilu naloge (.rich-content, tudi na natisnjenem listu v urejevalniku) jo odpre
 * čez cel zaslon. Klik na sliko preklopi med »prilagodi zaslonu« in pravo velikostjo; klik ob sliko ali Esc zapre.
 * Slike v urejevalniku besedila (contenteditable) niso zajete — tam klik izbere sliko za urejanje.
 */
export default function ImageZoom() {
  const [src, setSrc] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const img = e.target instanceof HTMLImageElement ? e.target : null;
      if (!img || !img.closest('.rich-content, .pqz-q') || img.closest('[contenteditable="true"]')) return;
      // ne odpri naloge / ne sproži drugih klikov (npr. na listu A4)
      e.preventDefault(); e.stopPropagation();
      setSrc(img.currentSrc || img.src); setFull(false);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setSrc(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [src]);

  if (!src) return null;
  return (
    <div className="no-print" role="dialog" aria-label="Povečana slika" onClick={() => setSrc(null)}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(15,20,18,0.86)', overflow: 'auto', display: 'flex', alignItems: full ? 'flex-start' : 'center', justifyContent: full ? 'flex-start' : 'center', padding: '24px', cursor: 'zoom-out' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" onClick={e => { e.stopPropagation(); setFull(f => !f); }}
        style={full
          ? { maxWidth: 'none', maxHeight: 'none', margin: 'auto', background: '#fff', cursor: 'zoom-out', boxShadow: '0 8px 40px rgba(0,0,0,.5)' }
          : { maxWidth: '94vw', maxHeight: '90vh', objectFit: 'contain', background: '#fff', cursor: 'zoom-in', boxShadow: '0 8px 40px rgba(0,0,0,.5)', borderRadius: '4px' }} />
      <span style={{ position: 'fixed', top: '14px', right: '18px', color: 'rgba(255,255,255,0.8)', fontFamily: 'var(--font-sans)', fontSize: '12px' }}>
        {full ? 'prava velikost' : 'prilagojeno zaslonu'} · klik na sliko: {full ? 'prilagodi' : 'prava velikost'} · Esc ali klik ob sliko: zapri
      </span>
    </div>
  );
}
