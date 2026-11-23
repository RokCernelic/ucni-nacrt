/**
 * Okrogel gumb za razpri / skrij, kot pri poglavjih učnega načrta: temno zelen s puščico,
 * zaključeno (`done`) svetlejše zeleno s kljukico.
 */
export default function RoundToggle({ open, done, size = 28 }: { open: boolean; done?: boolean; size?: number }) {
  return (
    <span style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', flexShrink: 0, background: done ? 'var(--green-ok)' : 'var(--forest)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', transition: 'background 0.3s' }}>
      {done ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none' }}>
          <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/** Ozadje in barva naslova zaključene vrstice (kot obkljukano poglavje / podpoglavje). */
export const DONE_BG = '#f4fbf4';
