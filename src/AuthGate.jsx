// src/AuthGate.jsx
// ─────────────────────────────────────────────────────────────────
// Wraps the app in a password gate.
//
// The password is never stored client-side. It is POSTed once to
// /api/auth/login, which returns an httpOnly, Secure, SameSite=Lax
// cookie. Subsequent same-origin fetches to /api/* carry it
// automatically, so App.jsx needs no changes.
//
// Fails closed: if APP_PASSWORD / AUTH_SECRET aren't set on the server,
// this renders setup instructions rather than letting the app through.
// ─────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';

const C = {
  bg: '#07060c',
  card: '#100e1a',
  border: '#221e33',
  inputBg: '#15121f',
  inputBorder: '#2a2440',
  text: '#f3f1fb',
  muted: '#9d97b8',
  faint: '#6b6588',
  primary: '#8b5cf6',
  grad: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
  neg: '#f4557a',
  warn: '#f59e0b',
};

const shell = {
  minHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: C.bg,
  color: C.text,
  padding: 24,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
};

const card = {
  width: '100%',
  maxWidth: 400,
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  padding: 32,
};

export default function AuthGate({ children }) {
  const [state, setState] = useState('checking'); // checking | locked | unconfigured | open | error
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const check = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        // The serverless functions aren't reachable — typically `vite dev`
        // instead of `vercel dev`. Don't silently unlock; say so.
        setState('error');
        return;
      }
      const data = await res.json();
      if (!data.configured) setState('unconfigured');
      else setState(data.authenticated ? 'open' : 'locked');
    } catch {
      setState('error');
    }
  };

  useEffect(() => { check(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setPassword('');
        setState('open');
      } else {
        setError(data.msg || 'Sign-in failed.');
      }
    } catch {
      setError('Could not reach the server.');
    }
    setBusy(false);
  };

  if (state === 'open') return children;

  if (state === 'checking') {
    return (
      <div style={shell}>
        <div style={{ color: C.faint, fontSize: 14 }}>Checking session…</div>
      </div>
    );
  }

  if (state === 'unconfigured') {
    return (
      <div style={shell}>
        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Finish setup</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: C.muted, marginBottom: 16 }}>
            Ellipse is locked until a password is configured on the server. Add these two
            environment variables in <strong style={{ color: C.text }}>Vercel → Settings →
            Environment Variables</strong>, then redeploy:
          </p>
          <pre style={{
            background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 10,
            padding: 14, fontSize: 12.5, color: C.text, overflowX: 'auto', marginBottom: 16,
          }}>
{`APP_PASSWORD = <the password you'll type here>
AUTH_SECRET  = <a long random string>`}
          </pre>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: C.faint, marginBottom: 20 }}>
            Generate a secret with:{' '}
            <code style={{ color: C.muted }}>
              node -e "console.log(crypto.randomBytes(32).toString('hex'))"
            </code>
          </p>
          <button onClick={check} style={{
            width: '100%', padding: '11px 16px', borderRadius: 10, border: 'none',
            background: C.grad, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            Re-check
          </button>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={shell}>
        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>API routes unreachable</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: C.muted, marginBottom: 20 }}>
            <code style={{ color: C.text }}>/api/auth/session</code> did not return JSON. The
            serverless functions aren't running — locally use{' '}
            <code style={{ color: C.text }}>vercel dev</code> rather than{' '}
            <code style={{ color: C.text }}>vite dev</code>.
          </p>
          <button onClick={check} style={{
            width: '100%', padding: '11px 16px', borderRadius: 10,
            border: `1px solid ${C.inputBorder}`, background: 'transparent',
            color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // locked
  return (
    <div style={shell}>
      <form style={card} onSubmit={submit}>
        <div style={{
          width: 40, height: 40, borderRadius: 11, background: C.grad,
          marginBottom: 18, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontWeight: 700, color: '#fff',
        }}>
          E
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Ellipse</h1>
        <p style={{ fontSize: 13.5, color: C.muted, marginBottom: 22 }}>
          Enter your password to continue.
        </p>

        <label htmlFor="ellipse-password" style={{
          display: 'block', fontSize: 12.5, color: C.muted, marginBottom: 7,
        }}>
          Password
        </label>
        <input
          id="ellipse-password"
          type="password"
          value={password}
          autoFocus
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: '100%', padding: '11px 13px', borderRadius: 10,
            border: `1px solid ${error ? C.neg : C.inputBorder}`,
            background: C.inputBg, color: C.text, fontSize: 14, outline: 'none',
          }}
        />

        {error && (
          <div role="alert" style={{ marginTop: 12, fontSize: 13, color: C.neg }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          style={{
            width: '100%', marginTop: 18, padding: '11px 16px', borderRadius: 10,
            border: 'none', background: busy || !password ? C.inputBorder : C.grad,
            color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: busy || !password ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p style={{ marginTop: 18, fontSize: 11.5, lineHeight: 1.6, color: C.faint }}>
          This gate protects the API routes only. Make sure Supabase RLS is enabled as
          well — see <code>supabase/rls_lockdown.sql</code>.
        </p>
      </form>
    </div>
  );
}
