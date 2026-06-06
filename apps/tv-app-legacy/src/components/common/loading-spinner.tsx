'use client';

interface LoadingSpinnerProps {
  message?: string;
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Branded loading screen — uses the official neofilm-wordmark.png so the
 * "loader" looks identical to the boot splash injected by layout.tsx.
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
      <img
        src={`${BASE_PATH}/neofilm-wordmark.png`}
        alt="NEOFILM"
        style={{ width: '24rem', maxWidth: '50vw', height: 'auto' }}
      />
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
