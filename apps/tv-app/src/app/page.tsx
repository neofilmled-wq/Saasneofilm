'use client';

import { Component, useEffect, useState, type ReactNode } from 'react';
import { TvShell } from '@/components/layout/tv-shell';
import { NeoFilmDebugScreen } from '@/components/screens/debug-screen';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[TV ErrorBoundary]', error);
  }
  render() {
    if (this.state.error) {
      return (
        <div
          data-neofilm-ready
          style={{
            position: 'fixed', inset: 0, padding: 40,
            color: '#fff', background: '#0a0a0f', fontFamily: 'monospace',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: '2em', fontWeight: 700, marginBottom: '0.5em' }}>
            <span style={{ color: '#3b82f6' }}>NEO</span>FILM
          </div>
          <h1 style={{ color: '#f87171', fontSize: '1.3em', marginBottom: '0.5em' }}>Erreur client</h1>
          <pre style={{
            whiteSpace: 'pre-wrap', fontSize: 13, maxWidth: '80vw', overflow: 'auto',
            background: '#111', padding: '1em', borderRadius: '8px', maxHeight: '40vh',
          }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1.5em', background: '#3b82f6', color: '#fff', border: 'none',
              borderRadius: '8px', padding: '0.7em 2em', fontSize: '1em', cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Secret debug trigger: press 'd' key 5 times within 3 seconds.
 */
function useDebugTrigger() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const presses: number[] = [];
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'd' && e.key !== 'D') return;
      const now = Date.now();
      presses.push(now);
      // Keep only presses within last 3s
      while (presses.length > 0 && now - presses[0] > 3000) presses.shift();
      if (presses.length >= 5) {
        presses.length = 0;
        setShow((s) => !s);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { showDebug: show, closeDebug: () => setShow(false) };
}

export default function TVPage() {
  const { showDebug, closeDebug } = useDebugTrigger();

  return (
    <ErrorBoundary>
      <TvShell />
      {showDebug && <NeoFilmDebugScreen onClose={closeDebug} />}
    </ErrorBoundary>
  );
}
