'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@neofilm/ui';
import { useAuth } from '@/providers/auth-provider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export default function VerifyEmailPage() {
  const { user } = useAuth();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    if (!user?.email) return;
    setResending(true);
    try {
      await fetch(`${API_URL}/auth/email/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      setResent(true);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
            <Mail className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle className="text-xl">Vérifiez votre email</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Nous avons envoyé un lien de vérification à{' '}
            <span className="font-medium text-foreground">{user?.email || 'votre adresse email'}</span>.
          </p>
          <p className="text-sm text-muted-foreground">
            Cliquez sur le lien dans l&apos;email pour activer votre compte. Vérifiez aussi vos spams.
          </p>
          <div className="pt-4 space-y-2">
            <Button variant="outline" className="w-full" onClick={handleResend} disabled={resending || resent}>
              {resent ? 'Email renvoyé !' : resending ? 'Envoi...' : 'Renvoyer l\'email'}
            </Button>
            <Link href="/login">
              <Button variant="ghost" className="w-full">
                Retour à la connexion
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
