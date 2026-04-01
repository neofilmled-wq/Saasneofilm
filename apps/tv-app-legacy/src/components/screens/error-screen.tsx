'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDevice } from '@/providers/device-provider';

interface ErrorScreenProps {
  message?: string | null;
}

export function ErrorScreen({ message }: ErrorScreenProps) {
  const { fetchSchedule } = useDevice();
  const [retryIn, setRetryIn] = useState(10);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(async () => {
    try {
      await fetchSchedule();
    } catch {
      // Exponential backoff: 10s, 20s, 40s, max 60s
      const next = Math.min(10 * Math.pow(2, attempt + 1), 60);
      setAttempt((a) => a + 1);
      setRetryIn(next);
    }
  }, [fetchSchedule, attempt]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRetryIn((r) => {
        if (r <= 1) {
          retry();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [retry]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8">
      <AlertTriangle className="h-20 w-20 text-destructive" />

      <h2 className="text-4xl font-bold">Erreur</h2>

      <p className="max-w-md text-center text-xl text-muted-foreground">
        {message || 'Impossible de se connecter au serveur'}
      </p>

      {retryIn > 0 && (
        <p className="text-lg text-muted-foreground">
          Nouvelle tentative dans{' '}
          <span className="font-mono text-foreground">{retryIn}s</span>
        </p>
      )}

      <p className="text-sm text-muted-foreground">Tentative #{attempt + 1}</p>
    </div>
  );
}
