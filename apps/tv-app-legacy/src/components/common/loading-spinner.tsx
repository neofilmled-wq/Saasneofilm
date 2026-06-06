'use client';

interface LoadingSpinnerProps {
  message?: string;
}

/**
 * Boot-style loading screen — same inline NEOFILM logo + red animated bar as
 * the very first paint splash (layout.tsx). This replaces the old circular
 * spinner so the user never sees a design discontinuity between phases:
 * head-script splash → React-shell loader → SmartTvDisplay config loader.
 */
export function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2rem',
        color: '#fff',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.125rem',
          fontWeight: 800,
          letterSpacing: '0.05em',
          fontSize: '4rem',
          lineHeight: 1,
          textShadow: '0 4px 32px rgba(230, 57, 70, 0.35)',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '1.125rem',
            height: '3.75rem',
            background: 'linear-gradient(180deg, #E63946, #b71c2c)',
            borderRadius: '0.25rem',
            boxShadow: '0 0 2rem rgba(230, 57, 70, 0.6)',
          }}
        />
        <span>
          NEO<span style={{ color: '#E63946' }}>FILM</span>
        </span>
      </div>
      {message && (
        <div
          style={{
            fontSize: '0.875rem',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, 0.55)',
          }}
        >
          {message}
        </div>
      )}
      <div
        style={{
          width: '4rem',
          height: '3px',
          background: '#E63946',
          borderRadius: '2px',
          boxShadow: '0 0 14px rgba(230, 57, 70, 0.6)',
          animation: 'neo-loading-pulse 1.5s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes neo-loading-pulse {
          0%, 100% { opacity: 0.3; width: 4rem; }
          50%      { opacity: 1;   width: 8rem; }
        }
      `}</style>
    </div>
  );
}
