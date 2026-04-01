'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTokensFromCallback } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const refresh = searchParams.get('refresh');
    const isNew = searchParams.get('isNew') === 'true';
    const oauthError = searchParams.get('error');

    if (oauthError) {
      setError('Échec de la connexion OAuth. Veuillez réessayer.');
      setTimeout(() => router.push('/login?error=oauth_failed'), 2000);
      return;
    }

    if (!token || !refresh) {
      setError('Paramètres manquants.');
      setTimeout(() => router.push('/login'), 2000);
      return;
    }

    setTokensFromCallback(token, refresh, isNew)
      .then(() => {
        if (isNew) {
          router.push('/partner/onboarding');
        } else {
          router.push('/partner/screens');
        }
      })
      .catch(() => {
        setError('Échec de l\'authentification.');
        setTimeout(() => router.push('/login'), 2000);
      });
  }, [searchParams, setTokensFromCallback, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Connexion en cours...</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
