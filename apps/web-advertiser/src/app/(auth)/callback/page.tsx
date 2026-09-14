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
    const code = searchParams.get('code');
    const oauthError = searchParams.get('error');

    if (oauthError) {
      setError('Échec de la connexion OAuth. Veuillez réessayer.');
      setTimeout(() => router.push('/login?error=oauth_failed'), 2000);
      return;
    }

    if (!code) {
      setError('Paramètres manquants.');
      setTimeout(() => router.push('/login'), 2000);
      return;
    }

    // Exchange the one-time code for JWTs (tokens travel in the POST body,
    // never in the URL / logs / Referer). audit M1
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
    (async () => {
      const res = await fetch(`${apiBase}/auth/oauth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error('exchange failed');
      const json = await res.json();
      const payload = json?.data ?? json; // unwrap TransformInterceptor envelope
      const { accessToken, refreshToken, isNew } = payload;
      if (!accessToken || !refreshToken) throw new Error('missing tokens');
      await setTokensFromCallback(accessToken, refreshToken, !!isNew);
      router.push(isNew ? '/onboarding' : '/campaigns');
    })().catch(() => {
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
