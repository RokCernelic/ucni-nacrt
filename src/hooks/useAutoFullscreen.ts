'use client';

import { useEffect } from 'react';

type FsDoc = Document & { webkitFullscreenElement?: Element | null };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/**
 * Samodejno preklopi napravo v celozaslonski način, brez posebnega gumba.
 * Brskalniki dovolijo requestFullscreen() le kot odziv na uporabnikov dotik/klik —
 * zato poslušamo VSAK dotik na strani (ne le prvega): prvi dotik (npr. prva številka
 * PIN-kode) takoj preklopi v cel zaslon, vsak naslednji dotik pa ga povrne, če ga je
 * medtem prekinil sistem (npr. iPadova poteza za preklop aplikacij).
 */
export function useAutoFullscreen() {
  useEffect(() => {
    const requestFs = () => {
      const doc = document as FsDoc;
      if (document.fullscreenElement || doc.webkitFullscreenElement) return;
      const el = document.documentElement as FsEl;
      const p = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.();
      Promise.resolve(p).catch(() => { /* ni podprto ali zavrnjeno — stran deluje naprej brez celega zaslona */ });
    };
    document.addEventListener('pointerdown', requestFs, { passive: true });
    return () => document.removeEventListener('pointerdown', requestFs);
  }, []);

  // Zaslon naj ne ugasne med kvizom (enak vzorec kot FullscreenCountdown).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let released = false;
    const request = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && !released) lock = await wl.request('screen');
      } catch { /* ni podprto / zavrnjeno */ }
    };
    void request();
    const onVis = () => { if (document.visibilityState === 'visible') void request(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, []);
}
