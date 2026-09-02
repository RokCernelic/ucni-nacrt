'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCountdown } from '@/hooks/useCountdown';

function pad2(n: number) { return String(n).padStart(2, '0'); }

export default function FullscreenCountdown({ school, title, subtitle, backHref }: {
  school?: string;
  title: string;
  subtitle?: string;
  backHref: string;
}) {
  const cd = useCountdown(school);
  const [isFs, setIsFs] = useState(false);

  // Wake Lock — zaslon ostane prižgan, dokler je pogled odprt
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let released = false;
    const request = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && !released) lock = await wl.request('screen');
      } catch { /* ni podprto / zavrnjeno */ }
    };
    request();
    // wake lock se sprosti, ko je zavihek skrit — ob vrnitvi ga znova zahtevaj
    const onVis = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, []);

  // spremljaj stanje fullscreena
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const cornerBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px', color: 'rgba(255,255,255,0.75)',
    fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500,
    padding: '8px 14px', textDecoration: 'none', cursor: 'pointer',
  };

  const nowLabel = cd ? `${pad2(cd.now.getHours())}:${pad2(cd.now.getMinutes())}` : '';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500, background: 'var(--forest)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* zgornja vrstica: nazaj · ura/šola · fullscreen */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', gap: '12px' }}>
        <Link href={backHref} style={cornerBtn} title="Nazaj">← Nazaj</Link>
        <div style={{ textAlign: 'center', minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}{subtitle ? ` · ${subtitle}` : ''}
          </div>
          {nowLabel && (
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', color: 'rgba(255,255,255,0.5)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
              {nowLabel}
            </div>
          )}
        </div>
        <button onClick={toggleFs} style={cornerBtn} title={isFs ? 'Izhod iz celega zaslona' : 'Cel zaslon'}>
          {isFs ? '✕ Okno' : '⤢ Cel zaslon'}
        </button>
      </div>

      {/* sredina: velik odštevalnik */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 16px', textAlign: 'center' }}>
        {!cd ? null : cd.remaining !== null ? (
          <>
            <div style={{
              fontFamily: 'var(--font-serif)', fontWeight: 300, lineHeight: 0.95,
              fontSize: 'clamp(120px, 26vw, 460px)', fontVariantNumeric: 'tabular-nums',
              color: cd.inLesson ? '#bfe3c0' : '#fff',
            }}>
              {cd.clock}
            </div>
            <div style={{
              fontFamily: 'var(--font-sans)', fontWeight: 600,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              fontSize: 'clamp(16px, 3.2vw, 44px)',
              color: 'rgba(255,255,255,0.6)', marginTop: 'clamp(16px, 3vh, 48px)',
            }}>
              {cd.caption}
            </div>
          </>
        ) : (
          <div style={{
            fontFamily: 'var(--font-serif)', fontWeight: 300,
            fontSize: 'clamp(48px, 10vw, 160px)', color: 'rgba(255,255,255,0.55)',
          }}>
            Izven urnika
          </div>
        )}
      </div>
    </div>
  );
}
