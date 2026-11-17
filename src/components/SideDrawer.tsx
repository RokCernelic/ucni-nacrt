'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** širina stranskega okna (px): 46 % zaslona, med 380 in 620 */
const drawerWidth = () => Math.round(Math.max(380, Math.min(620, window.innerWidth * 0.46)));
/** na ozkih zaslonih okno stran prekrije (zožitev ne bi pustila prostora vsebini) */
const PUSH_MIN = 980;
const MS = 260;

/**
 * Stransko okno z desne (npr. urejevalnik naloge): pripelje se animirano in stran ZOŽI (vsebina se umakne levo),
 * ne prekrije je. Ob zaprtju se animirano umakne. Esc zapre.
 */
export default function SideDrawer({ open, onClose, title, subtitle, children }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  // ostane izrisano še med animacijo zapiranja
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [width, setWidth] = useState(600);

  useLayoutEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- animacija odpiranja: najprej izris, nato premik
      setMounted(true); setWidth(drawerWidth());
      // kratek zamik: brskalnik najprej izriše okno izven zaslona, nato ga animirano premakne
      const t = setTimeout(() => setShown(true), 30);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), MS);
    return () => clearTimeout(t);
  }, [open]);

  // zožitev strani: odmik na desni (body), z enako animacijo
  useEffect(() => {
    const root = document.documentElement;
    const push = shown && window.innerWidth >= PUSH_MIN;
    root.style.setProperty('--drawer-w', push ? `${width}px` : '0px');
    root.classList.toggle('has-drawer', push);
    return () => { root.style.setProperty('--drawer-w', '0px'); root.classList.remove('has-drawer'); };
  }, [shown, width]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onResize = () => setWidth(drawerWidth());
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, [open, onClose]);

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(
    <aside className="no-print side-drawer" aria-label="Urejevalnik"
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: `${width}px`, maxWidth: '100vw', zIndex: 250,
        background: 'var(--canvas)', borderLeft: '1px solid #c8d6e8', boxShadow: shown ? '-6px 0 24px rgba(0,0,0,0.14)' : 'none',
        display: 'flex', flexDirection: 'column', transform: shown ? 'translateX(0)' : 'translateX(100%)',
        transition: `transform ${MS}ms cubic-bezier(.2,.8,.2,1), box-shadow ${MS}ms` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid var(--hairline)', fontFamily: 'var(--font-sans)' }}>
        <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>{title}</strong>
        {subtitle && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{subtitle}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={onClose} title="Zapri (Esc)" style={{ width: '28px', height: '28px', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 40px' }}>{children}</div>
    </aside>,
    document.body,
  );
}
