// src/ErrorBoundary.jsx
// ─────────────────────────────────────────────────────────────────
// Catches render/lifecycle errors so a single throw doesn't blank the
// whole app to a white screen. Shows the message and offers a reload.
// ─────────────────────────────────────────────────────────────────
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // console.error survives the production build (see vite.config.js
    // terserOptions.pure_funcs — only log/debug are stripped).
    console.error('[Ellipse] Uncaught render error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#07060c', color: '#f3f1fb', padding: 24,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}>
        <div style={{
          width: '100%', maxWidth: 520, background: '#100e1a',
          border: '1px solid #221e33', borderRadius: 16, padding: 32,
        }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Something broke while rendering
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#9d97b8', marginBottom: 16 }}>
            Your data is safe — this is a display error. Reloading usually clears it.
          </p>
          <pre style={{
            background: '#15121f', border: '1px solid #2a2440', borderRadius: 10,
            padding: 14, fontSize: 12, color: '#f4557a', overflowX: 'auto',
            whiteSpace: 'pre-wrap', marginBottom: 20,
          }}>
            {String(error?.message || error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              width: '100%', padding: '11px 16px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
