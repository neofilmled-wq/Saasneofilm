'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Bell, Database, Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Switch, Skeleton } from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { adminApi } from '@/lib/admin-api';

export default function SettingsPage() {
  const queryClient = useQueryClient();

  // Form state
  const [platformName, setPlatformName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [defaultCommission, setDefaultCommission] = useState('');

  // Fetch settings
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => adminApi.getSettings(),
  });

  const settings = settingsQuery.data?.data ?? null;

  // Pre-fill form from fetched settings
  useEffect(() => {
    if (settings) {
      setPlatformName(settings.platformName ?? '');
      setSupportEmail(settings.supportEmail ?? '');
      setDefaultCommission(settings.defaultCommission ?? '');
    }
  }, [settings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => adminApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Paramètres sauvegardés avec succès');
    },
    onError: (error: Error) => {
      toast.error(`Erreur lors de la sauvegarde : ${error.message}`);
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      platformName,
      supportEmail,
      defaultCommission,
    });
  };

  const isLoading = settingsQuery.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paramètres"
        description="Configuration globale de la plateforme"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* General */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5" />
              Général
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <Skeleton className="h-10 w-32" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="platform-name">Nom de la plateforme</Label>
                  <Input
                    id="platform-name"
                    value={platformName}
                    onChange={(e) => setPlatformName(e.target.value)}
                    placeholder="NeoFilm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="support-email">Email support</Label>
                  <Input
                    id="support-email"
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    placeholder="support@neofilm.io"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default-commission">Commission par défaut (%)</Label>
                  <Input
                    id="default-commission"
                    type="number"
                    value={defaultCommission}
                    onChange={(e) => setDefaultCommission(e.target.value)}
                    placeholder="30"
                  />
                </div>
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Sauvegarder
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5" />
              Sécurité
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Authentification 2FA obligatoire</p>
                <p className="text-xs text-muted-foreground">Pour tous les comptes admin</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Verrouillage après 5 tentatives</p>
                <p className="text-xs text-muted-foreground">Protection contre le brute-force</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Expiration des sessions</p>
                <p className="text-xs text-muted-foreground">Déconnexion après 24h d'inactivité</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Alertes appareils hors ligne</p>
                <p className="text-xs text-muted-foreground">Email + notification in-app</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Nouvelles inscriptions partenaires</p>
                <p className="text-xs text-muted-foreground">Notification lors d'un nouveau partenaire</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Campagnes en attente de validation</p>
                <p className="text-xs text-muted-foreground">Alerte quand une campagne attend l'approbation</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* System */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="h-5 w-5" />
              Système
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Version API</p>
              <p className="text-sm text-muted-foreground font-mono">v1.0.0</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Base de données</p>
              <p className="text-sm text-muted-foreground font-mono">PostgreSQL 16</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Cache</p>
              <p className="text-sm text-muted-foreground font-mono">Redis 7</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Stockage</p>
              <p className="text-sm text-muted-foreground font-mono">S3 / MinIO</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
