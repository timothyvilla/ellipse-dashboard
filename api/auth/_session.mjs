// src/AuthGate.jsx
// ─────────────────────────────────────────────────────────────────
// Wraps the whole app in a password gate — nothing renders until the
// session is valid, so the login page is the first thing anyone sees.
//
// The password is never stored client-side. It is POSTed once to
// /api/auth/login, which returns an httpOnly, Secure, SameSite=Lax
// cookie. Subsequent same-origin fetches to /api/* carry it
// automatically, so App.jsx needs no changes.
//
// "Remember me" (default on) → persistent 30-day cookie. Off → a
// session cookie that clears when the browser closes (honored by
// api/auth/login.mjs via the `remember` flag).
//
// Fails closed: if APP_PASSWORD / AUTH_SECRET aren't set on the server,
// this renders setup instructions rather than letting the app through.
// ─────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';

const C = {
  bg: '#07060c',
  card: '#100e1a',
  cardTop: '#141126',
  border: '#221e33',
  inputBg: '#15121f',
  inputBorder: '#2a2440',
  text: '#f3f1fb',
  muted: '#9d97b8',
  faint: '#6b6588',
  primary: '#8b5cf6',
  primaryHi: '#a855f7',
  grad: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
  pos: '#22d3a5',
  neg: '#f4557a',
  warn: '#f59e0b',
};

const shell = {
  position: 'relative',
  minHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: C.bg,
  color: C.text,
  padding: 24,
  overflow: 'hidden',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
};

const card = {
  position: 'relative',
  zIndex: 1,
  width: '100%',
  maxWidth: 400,
  background: `linear-gradient(180deg, ${C.cardTop} 0%, ${C.card} 60%)`,
  border: `1px solid ${C.border}`,
  borderRadius: 18,
  padding: 32,
  boxShadow: '0 24px 60px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset',
};

const STYLE = `
@keyframes ag-spin { to { transform: rotate(360deg); } }
@keyframes ag-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.ag-card { animation: ag-fade .35s ease both; }
.ag-input:focus { border-color: ${C.primary} !important; box-shadow: 0 0 0 3px rgba(139,92,246,0.18); }
.ag-btn { transition: filter .15s ease, transform .05s ease; }
.ag-btn:not(:disabled):hover { filter: brightness(1.08); }
.ag-btn:not(:disabled):active { transform: translateY(1px); }
.ag-eye { transition: color .15s ease; }
.ag-eye:hover { color: ${C.text} !important; }
.ag-check { accent-color: ${C.primary}; width: 15px; height: 15px; cursor: pointer; }
.ag-glow { position: absolute; border-radius: 50%; filter: blur(90px); pointer-events: none; }
`;

const Logo = ({ size = 44 }) => (
  <div style={{
    width: size, height: size, borderRadius: 13, background: C.grad,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 8px 24px -6px rgba(139,92,246,0.55)',
  }}>
    <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="12" rx="10" ry="5.5" stroke="#fff" strokeWidth="1.8" opacity="0.95" />
      <ellipse cx="12" cy="12" rx="5.5" ry="10" stroke="#fff" strokeWidth="1.8" opacity="0.55" />
      <circle cx="12" cy="12" r="1.8" fill="#fff" />
    </svg>
  </div>
);

const Spinner = ({ size = 16, color = '#fff' }) => (
  <span style={{
    display: 'inline-block', width: size, height: size, borderRadius: '50%',
    border: `2px solid ${color}`, borderTopColor: 'transparent',
    animation: 'ag-spin .7s linear infinite',
  }} />
);

const EyeIcon = ({ off }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {off ? (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    ) : (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

export default function AuthGate({ children }) {
  const [state, setState] = useState('checking'); // checking | locked | unconfigured | open | error
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const check = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) { setState('error'); return; }
      const data = await res.json();
      if (!data.configured) setState('unconfigured');
      else setState(data.authenticated ? 'open' : 'locked');
    } catch { setState('error'); }
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
        body: JSON.stringify({ password, remember }),
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

  const Background = () => (
    <>
      <div className="ag-glow" style={{ width: 420, height: 420, top: -120, left: -100, background: 'rgba(124,58,237,0.22)' }} />
      <div className="ag-glow" style={{ width: 380, height: 380, bottom: -140, right: -110, background: 'rgba(168,85,247,0.16)' }} />
    </>
  );

  if (state === 'checking') {
    return (
      <div style={shell}>
        <style>{STYLE}</style>
        <Background />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Logo />
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: C.faint, fontSize: 13.5 }}>
            <Spinner size={14} color={C.primary} /> Checking session…
          </div>
        </div>
      </div>
    );
  }

  if (state === 'unconfigured') {
    return (
      <div style={shell}>
        <style>{STYLE}</style>
        <Background />
        <div style={card} className="ag-card">
          <Logo />
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>Finish setup</div>
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
            <code style={{ color: C.muted }}>node -e "console.log(crypto.randomBytes(32).toString('hex'))"</code>
          </p>
          <button onClick={check} className="ag-btn" style={{
            width: '100%', padding: '11px 16px', borderRadius: 10, border: 'none',
            background: C.grad, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Re-check</button>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={shell}>
        <style>{STYLE}</style>
        <Background />
        <div style={card} className="ag-card">
          <Logo />
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>API routes unreachable</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: C.muted, marginBottom: 20 }}>
            <code style={{ color: C.text }}>/api/auth/session</code> did not return JSON. The
            serverless functions aren't running — locally use{' '}
            <code style={{ color: C.text }}>vercel dev</code> rather than{' '}
            <code style={{ color: C.text }}>vite dev</code>.
          </p>
          <button onClick={check} className="ag-btn" style={{
            width: '100%', padding: '11px 16px', borderRadius: 10,
            border: `1px solid ${C.inputBorder}`, background: 'transparent',
            color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Retry</button>
        </div>
      </div>
    );
  }

  // locked — the login page
  return (
    <div style={shell}>
      <style>{STYLE}</style>
      <Background />
      <form style={card} className="ag-card" onSubmit={submit}>
        <Logo />
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 18, marginBottom: 2, letterSpacing: '-0.01em' }}>Ellipse</h1>
        <p style={{ fontSize: 13, color: C.faint, marginBottom: 24 }}>Trading Dashboard</p>

        <label htmlFor="ellipse-password" style={{ display: 'block', fontSize: 12.5, color: C.muted, marginBottom: 7, fontWeight: 500 }}>
          Password
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id="ellipse-password"
            className="ag-input"
            type={showPw ? 'text' : 'password'}
            value={password}
            autoFocus
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%', padding: '12px 42px 12px 13px', borderRadius: 10,
              border: `1px solid ${error ? C.neg : C.inputBorder}`,
              background: C.inputBg, color: C.text, fontSize: 14, outline: 'none',
              transition: 'border-color .15s ease, box-shadow .15s ease',
            }}
          />
          <button
            type="button"
            aria-label={showPw ? 'Hide password' : 'Show password'}
            onClick={() => setShowPw((v) => !v)}
            className="ag-eye"
            style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: C.faint,
              padding: 6, display: 'flex', alignItems: 'center',
            }}
          >
            <EyeIcon off={showPw} />
          </button>
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 12, fontSize: 13, color: C.neg, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>⚠</span>{error}
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 13, color: C.muted, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" className="ag-check" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember me for 30 days
        </label>

        <button
          type="submit"
          disabled={busy || !password}
          className="ag-btn"
          style={{
            width: '100%', marginTop: 20, padding: '12px 16px', borderRadius: 10,
            border: 'none', background: busy || !password ? C.inputBorder : C.grad,
            color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: busy || !password ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          }}
        >
          {busy ? (<><Spinner /> Signing in…</>) : 'Sign in'}
        </button>

        <p style={{ marginTop: 20, fontSize: 11.5, lineHeight: 1.6, color: C.faint, textAlign: 'center' }}>
          Protected access. API routes and Supabase RLS are enforced server-side.
        </p>
      </form>
    </div>
  );
}
