'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const { updatePassword } = useAuth();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Gesli se ne ujemata.');
      return;
    }
    startTransition(async () => {
      const err = await updatePassword(password);
      if (err) {
        setError(err.message);
      } else {
        setDone(true);
        setTimeout(() => router.push('/fizika'), 2000);
      }
    });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--surface, #f4f2ee)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
    }}>
      <div style={{
        background: 'var(--canvas)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--r-lg)',
        padding: '40px 40px 36px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 400, color: 'var(--forest)', margin: '0 0 6px', lineHeight: 1 }}>
          Novo geslo
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--muted)', margin: '0 0 28px' }}>
          Vnesite novo geslo za vaš račun.
        </p>

        {done ? (
          <div style={{ background: '#f0faf4', border: '1px solid #a8d5b5', borderRadius: '8px', padding: '16px', fontFamily: 'var(--font-sans)', fontSize: '13px', color: '#2d6a4f', lineHeight: 1.55 }}>
            <strong>Geslo je posodobljeno.</strong><br />
            Preusmerjamo vas…
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Novo geslo
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                style={{ border: '1px solid var(--hairline)', borderRadius: '6px', padding: '10px 14px', fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--ink)', background: 'var(--canvas)', outline: 'none', transition: 'border-color 0.15s' }}
                onFocus={e => e.target.style.borderColor = 'var(--forest)'}
                onBlur={e => e.target.style.borderColor = 'var(--hairline)'}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Potrdi geslo
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                style={{ border: '1px solid var(--hairline)', borderRadius: '6px', padding: '10px 14px', fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--ink)', background: 'var(--canvas)', outline: 'none', transition: 'border-color 0.15s' }}
                onFocus={e => e.target.style.borderColor = 'var(--forest)'}
                onBlur={e => e.target.style.borderColor = 'var(--hairline)'}
              />
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)' }}>
                Najmanj 6 znakov.
              </span>
            </div>

            {error && (
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: '#c0392b', margin: 0 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              style={{ background: 'var(--forest)', color: '#fff', border: 'none', borderRadius: '6px', padding: '11px 0', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 600, cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1, marginTop: '4px', transition: 'opacity 0.15s' }}
            >
              {pending ? '…' : 'Shrani geslo'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
