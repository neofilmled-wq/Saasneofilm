'use client';

import { useEffect } from 'react';
import { Button } from '@neofilm/ui';

export default function UsersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[UsersPage Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12">
      <h2 className="text-lg font-semibold text-destructive">Erreur sur la page Utilisateurs</h2>
      <p className="text-sm text-muted-foreground max-w-md text-center">{error.message}</p>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}
