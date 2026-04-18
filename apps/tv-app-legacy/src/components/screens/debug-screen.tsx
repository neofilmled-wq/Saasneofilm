'use client';

import { useCallback, useEffect, useState } from 'react';
import { TV_CONFIG } from '@/lib/constants';

interface DiagnosticResult {
  label: string;
  status: 'ok' | 'warn' | 'error' | 'loading';
  detail: string;
}

/**
 * NeoFilmDebugScreen — Diagnostic overlay for TV black screen debugging.
 *
 * Shows real-time status of: backend, catalogue, ads, network, localStorage,
 * WebSocket, and WebView capabilities.
 */
export function NeoFilmDebugScreen({ onClose }: { onClose?: () => void }) {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [running, setRunning] = useState(true);

  const updateResult = useCallback((index: number, update: Partial<DiagnosticResult>) => {
    setResults((prev) => prev.map((r, i) => (i === index ? { ...r, ...update } : r)));
  }, []);

  useEffect(() => {
    const diagnostics: DiagnosticResult[] = [
      { label: 'Backend API', status: 'loading', detail: 'Vérification...' },
      { label: 'Auth Token', status: 'loading', detail: 'Vérification...' },
      { label: 'Device Info', status: 'loading', detail: 'Vérification...' },
      { label: 'TV Config', status: 'loading', detail: 'Vérification...' },
      { label: 'Channels (TNT)', status: 'loading', detail: 'Vérification...' },
      { label: 'Ads Endpoint', status: 'loading', detail: 'Vérification...' },
      { label: 'WebSocket', status: 'loading', detail: 'Vérification...' },
      { label: 'Network', status: 'loading', detail: 'Vérification...' },
      { label: 'LocalStorage', status: 'loading', detail: 'Vérification...' },
      { label: 'WebView Caps', status: 'loading', detail: 'Vérification...' },
    ];
    setResults(diagnostics);

    const token = localStorage.getItem('neofilm_device_token');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const run = async () => {
      // 1. Backend API health
      try {
        const res = await fetch(`${TV_CONFIG.API_URL}/health`, { signal: AbortSignal.timeout(5000) });
        updateResult(0, res.ok
          ? { status: 'ok', detail: `${TV_CONFIG.API_URL} → ${res.status}` }
          : { status: 'error', detail: `HTTP ${res.status}` });
      } catch (e) {
        updateResult(0, { status: 'error', detail: `Injoignable: ${(e as Error).message}` });
      }

      // 2. Auth Token
      if (token) {
        updateResult(1, { status: 'ok', detail: `Token présent (${token.substring(0, 12)}...)` });
      } else {
        updateResult(1, { status: 'error', detail: 'Aucun token — device non appairé' });
      }

      // 3. Device Info (/tv/me)
      if (token) {
        try {
          const res = await fetch(`${TV_CONFIG.API_URL}/tv/me`, { headers, signal: AbortSignal.timeout(5000) });
          if (res.ok) {
            const json = await res.json();
            const data = json?.data ?? json;
            updateResult(2, { status: 'ok', detail: `paired=${data.paired}, screen=${data.screenId || 'none'}` });
          } else {
            updateResult(2, { status: 'error', detail: `HTTP ${res.status} — token invalide?` });
          }
        } catch (e) {
          updateResult(2, { status: 'warn', detail: `Réseau: ${(e as Error).message}` });
        }
      } else {
        updateResult(2, { status: 'warn', detail: 'Skip — pas de token' });
      }

      // 4. TV Config
      if (token) {
        try {
          const res = await fetch(`${TV_CONFIG.API_URL}/tv/bootstrap`, { headers, signal: AbortSignal.timeout(8000) });
          if (res.ok) {
            const json = await res.json();
            const data = json?.data ?? json;
            const mods = data.config?.enabledModules?.join(', ') || 'aucun';
            const chCount = data.channels?.length ?? 0;
            const actCount = data.activities?.length ?? 0;
            updateResult(3, { status: 'ok', detail: `Modules: ${mods} | ${chCount} chaînes, ${actCount} activités` });
          } else {
            updateResult(3, { status: 'error', detail: `HTTP ${res.status}` });
          }
        } catch (e) {
          updateResult(3, { status: 'warn', detail: `${(e as Error).message}` });
        }
      } else {
        updateResult(3, { status: 'warn', detail: 'Skip — pas de token' });
      }

      // 5. Channels
      if (token) {
        try {
          const res = await fetch(`${TV_CONFIG.API_URL}/tv/channels`, { headers, signal: AbortSignal.timeout(5000) });
          if (res.ok) {
            const json = await res.json();
            const data = json?.data ?? json;
            const channels = Array.isArray(data) ? data : [];
            const withStream = channels.filter((c: any) => c.streamUrl);
            updateResult(4, { status: channels.length > 0 ? 'ok' : 'warn', detail: `${channels.length} chaînes (${withStream.length} avec stream)` });
          } else {
            updateResult(4, { status: 'error', detail: `HTTP ${res.status}` });
          }
        } catch (e) {
          updateResult(4, { status: 'warn', detail: `${(e as Error).message}` });
        }
      } else {
        updateResult(4, { status: 'warn', detail: 'Skip — pas de token' });
      }

      // 6. Ads endpoint
      if (token) {
        try {
          const res = await fetch(`${TV_CONFIG.API_URL}/tv/ads?trigger=POWER_ON`, { headers, signal: AbortSignal.timeout(5000) });
          if (res.ok) {
            const json = await res.json();
            const data = json?.data ?? json;
            const count = data.ads?.length ?? 0;
            updateResult(5, { status: 'ok', detail: `${count} ads disponibles` });
          } else {
            updateResult(5, { status: res.status === 404 ? 'warn' : 'error', detail: `HTTP ${res.status}` });
          }
        } catch (e) {
          updateResult(5, { status: 'warn', detail: `${(e as Error).message}` });
        }
      } else {
        updateResult(5, { status: 'warn', detail: 'Skip — pas de token' });
      }

      // 7. WebSocket
      try {
        const wsUrl = TV_CONFIG.WS_URL.replace(/^http/, 'ws');
        const ws = new WebSocket(`${wsUrl}/socket.io/?EIO=4&transport=websocket`);
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => { ws.close(); reject(new Error('timeout 5s')); }, 5000);
          ws.onopen = () => { clearTimeout(timeout); ws.close(); resolve(); };
          ws.onerror = () => { clearTimeout(timeout); reject(new Error('connexion refusée')); };
        });
        updateResult(6, { status: 'ok', detail: `${TV_CONFIG.WS_URL} → connecté` });
      } catch (e) {
        updateResult(6, { status: 'error', detail: `${(e as Error).message}` });
      }

      // 8. Network
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      updateResult(7, {
        status: online ? 'ok' : 'error',
        detail: online ? 'navigator.onLine = true' : 'HORS LIGNE',
      });

      // 9. LocalStorage
      const keys = ['neofilm_device_token', 'neofilm_device_id', 'neofilm_screen_id', 'neofilm_schedule_cache'];
      const present = keys.filter((k) => localStorage.getItem(k));
      updateResult(8, {
        status: present.length >= 2 ? 'ok' : 'warn',
        detail: `${present.length}/${keys.length} clés: ${present.join(', ') || 'aucune'}`,
      });

      // 10. WebView Capabilities
      const caps: string[] = [];
      if (typeof window !== 'undefined') {
        if ('serviceWorker' in navigator) caps.push('SW');
        if ('MediaSource' in window) caps.push('MSE');
        const ua = navigator.userAgent;
        if (ua.includes('NEOFILM-TV')) caps.push('NeoFilm-UA');
        if (ua.includes('AndroidTV') || ua.includes('Android TV')) caps.push('AndroidTV');
        const v = document.createElement('video');
        if (v.canPlayType('application/vnd.apple.mpegurl')) caps.push('NativeHLS');
        if (v.canPlayType('video/mp4')) caps.push('MP4');
      }
      updateResult(9, { status: caps.length >= 2 ? 'ok' : 'warn', detail: caps.join(', ') || 'aucune' });

      setRunning(false);
    };

    run();
  }, [updateResult]);

  const statusIcon = (s: DiagnosticResult['status']) => {
    switch (s) {
      case 'ok': return '🟢';
      case 'warn': return '🟡';
      case 'error': return '🔴';
      case 'loading': return '⏳';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0, left: 0,
        zIndex: 99998,
        background: 'rgba(0,0,0,0.95)',
        color: '#fff',
        fontFamily: 'monospace',
        padding: '2em',
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5em' }}>
        <div>
          <h1 style={{ fontSize: '1.5em', fontWeight: 700 }}>
            <span style={{ color: '#3b82f6' }}>NEO</span>FILM — Diagnostic
          </h1>
          <p style={{ fontSize: '0.8em', opacity: 0.6, marginTop: '0.3em' }}>
            {running ? 'Tests en cours...' : 'Diagnostic terminé'} | {new Date().toLocaleString('fr-FR')}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5em 1.5em',
              fontSize: '0.9em',
              cursor: 'pointer',
            }}
          >
            Fermer
          </button>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333' }}>
            <th style={{ textAlign: 'left', padding: '0.5em', width: '3em' }}></th>
            <th style={{ textAlign: 'left', padding: '0.5em', width: '12em' }}>Module</th>
            <th style={{ textAlign: 'left', padding: '0.5em' }}>Détail</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #222' }}>
              <td style={{ padding: '0.5em', fontSize: '1.2em' }}>{statusIcon(r.status)}</td>
              <td style={{ padding: '0.5em', fontWeight: 600 }}>{r.label}</td>
              <td style={{ padding: '0.5em', opacity: 0.8, wordBreak: 'break-all' }}>{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: '2em', padding: '1em', background: '#111', borderRadius: '8px', fontSize: '0.75em' }}>
        <p><strong>Env:</strong> API={TV_CONFIG.API_URL} | WS={TV_CONFIG.WS_URL}</p>
        <p><strong>UA:</strong> {typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}</p>
        <p><strong>Screen:</strong> {typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight} (dpr=${window.devicePixelRatio})` : 'N/A'}</p>
      </div>
    </div>
  );
}
