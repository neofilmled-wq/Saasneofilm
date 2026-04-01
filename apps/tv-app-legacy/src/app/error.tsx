'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 40, color: '#fff', background: '#000', fontFamily: 'monospace', height: '100vh' }}>
      <h1 style={{ color: '#f44', marginBottom: 20 }}>Erreur client TV App</h1>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, marginBottom: 20 }}>
        {error.message}
        {'\n\n'}
        {error.stack}
      </pre>
      <button
        onClick={reset}
        style={{ padding: '10px 20px', background: '#333', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 4 }}
      >
        Réessayer
      </button>
    </div>
  );
}
