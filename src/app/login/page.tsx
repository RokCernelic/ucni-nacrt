'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [pending, startTransition] = useTransition();
  const { signIn, signUp } = useAuth();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      if (mode === 'login') {
        const err = await signIn(email, password);
        if (err) {
          setError('Napačen e-poštni naslov ali geslo.');
        } else {
          router.push('/fizika');
          router.refresh();
        }
      } else {
        const err = await signUp(email, password);
        if (err) {
          setError(err.message);
        } else {
          setRegistered(true);
        }
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
        {/* Title */}
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--forest)',
          margin: '0 0 6px',
          lineHeight: 1,
        }}>
          Učni načrt
        </h1>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          color: 'var(--muted)',
          margin: '0 0 28px',
        }}>
          {mode === 'login' ? 'Prijavite se v svoj račun.' : 'Ustvarite nov račun.'}
        </p>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '1px solid var(--hairline)' }}>
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); setRegistered(false); }}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: mode === m ? '2px solid var(--forest)' : '2px solid transparent',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: mode === m ? 600 : 400,
                color: mode === m ? 'var(--ink)' : 'var(--muted)',
                padding: '0 0 10px',
                marginRight: '20px',
                cursor: 'pointer',
                marginBottom: '-1px',
              }}
            >
              {m === 'login' ? 'Prijava' : 'Registracija'}
            </button>
          ))}
        </div>

        {registered ? (
          <div style={{
            background: '#f0faf4',
            border: '1px solid #a8d5b5',
            borderRadius: '8px',
            padding: '16px',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: '#2d6a4f',
            lineHeight: 1.55,
          }}>
            <strong>Preverite e-pošto.</strong><br />
            Poslali smo vam potrditveno sporočilo na <em>{email}</em>. Kliknite na povezavo v e-pošti, da aktivirate račun.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                E-pošta
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                style={{
                  border: '1px solid var(--hairline)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  color: 'var(--ink)',
                  background: 'var(--canvas)',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--forest)'}
                onBlur={e => e.target.style.borderColor = 'var(--hairline)'}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Geslo
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={{
                  border: '1px solid var(--hairline)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  color: 'var(--ink)',
                  background: 'var(--canvas)',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--forest)'}
                onBlur={e => e.target.style.borderColor = 'var(--hairline)'}
              />
              {mode === 'register' && (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)' }}>
                  Najmanj 6 znakov.
                </span>
              )}
            </div>

            {error && (
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: '#c0392b', margin: 0 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              style={{
                background: 'var(--forest)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '11px 0',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: pending ? 'not-allowed' : 'pointer',
                opacity: pending ? 0.7 : 1,
                marginTop: '4px',
                transition: 'opacity 0.15s',
              }}
            >
              {pending ? '…' : mode === 'login' ? 'Prijava' : 'Registracija'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
