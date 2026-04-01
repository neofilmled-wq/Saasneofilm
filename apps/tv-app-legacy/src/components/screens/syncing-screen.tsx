'use client';

import { LoadingSpinner } from '@/components/common/loading-spinner';
import { useDevice } from '@/providers/device-provider';

interface SyncingScreenProps {
  message?: string;
}

export function SyncingScreen({ message = 'Synchronisation du programme...' }: SyncingScreenProps) {
  const { screenId } = useDevice();

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8">
      <h1 className="text-5xl font-bold tracking-tight">
        <span className="text-primary">NEO</span>FILM
      </h1>

      <LoadingSpinner message={message} />

      {screenId && (
        <p className="text-lg text-muted-foreground">
          Ecran : {screenId}
        </p>
      )}
    </div>
  );
}
