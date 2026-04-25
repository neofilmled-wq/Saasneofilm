'use client';

import { useState, useEffect } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@neofilm/ui';
import { Save, User, MapPin, Phone, Mail, Globe } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingState } from '@/components/ui/loading-state';
import { usePartnerProfile, useUpsertPartnerProfile } from '@/hooks/use-partner-profile';
import { BannerUpload } from '@/components/profile/banner-upload';

export default function ProfilePage() {
  const { data: profile, isLoading } = usePartnerProfile();
  const upsert = useUpsertPartnerProfile();

  const [form, setForm] = useState({
    companyName: '',
    contactEmail: '',
    contactPhone: '',
    logoUrl: '',
    bannerUrl: '',
    address: '',
    city: '',
    postCode: '',
    country: 'FR',
    timezone: 'Europe/Paris',
    latitude: '',
    longitude: '',
  });

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate form when profile loads
  useEffect(() => {
    if (profile) {
      setForm({
        companyName: profile.companyName ?? '',
        contactEmail: profile.contactEmail ?? '',
        contactPhone: profile.contactPhone ?? '',
        logoUrl: profile.logoUrl ?? '',
        bannerUrl: (profile as any).bannerUrl ?? '',
        address: profile.address ?? '',
        city: profile.city ?? '',
        postCode: profile.postCode ?? '',
        country: profile.country ?? 'FR',
        timezone: profile.timezone ?? 'Europe/Paris',
        latitude: profile.latitude != null ? String(profile.latitude) : '',
        longitude: profile.longitude != null ? String(profile.longitude) : '',
      });
    }
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    try {
      await upsert.mutateAsync({
        ...form,
        latitude: form.latitude ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude ? parseFloat(form.longitude) : undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message ?? 'Erreur lors de la sauvegarde');
    }
  }

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Profil partenaire"
        description="Informations de votre société diffusées sur la plateforme"
      />

      {/* Verification badge */}
      {profile?.isVerified && (
        <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--success))]/10 px-4 py-1.5 text-sm text-[hsl(var(--success))] font-medium">
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--success))]" />
          Compte vérifié
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company */}
        <Card className="rounded-2xl card-elevated">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Identité
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="companyName">Nom de société</Label>
              <Input
                id="companyName"
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                placeholder="NeoFilm Cinémas"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="logoUrl">URL du logo</Label>
              <Input
                id="logoUrl"
                value={form.logoUrl}
                onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                placeholder="https://..."
              />
              {form.logoUrl && (
                <img
                  src={form.logoUrl}
                  alt="Logo"
                  className="h-16 w-auto rounded border object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label>Bannière (affichée en bas des écrans TV)</Label>
              <BannerUpload
                value={form.bannerUrl}
                onChange={(url) => setForm((f) => ({ ...f, bannerUrl: url ?? '' }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card className="rounded-2xl card-elevated">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="contactEmail">Email de contact</Label>
              <Input
                id="contactEmail"
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                placeholder="contact@societe.fr"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contactPhone">
                <Phone className="inline h-3 w-3 mr-1" />
                Téléphone
              </Label>
              <Input
                id="contactPhone"
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                placeholder="+33 1 23 45 67 89"
              />
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card className="rounded-2xl card-elevated">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Adresse principale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="address">Adresse</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="12 rue du Cinéma"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="city">Ville</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Paris"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="postCode">Code postal</Label>
                <Input
                  id="postCode"
                  value={form.postCode}
                  onChange={(e) => setForm((f) => ({ ...f, postCode: e.target.value }))}
                  placeholder="75001"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="latitude">Latitude</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                  placeholder="48.8566"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="longitude">Longitude</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                  placeholder="2.3522"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card className="rounded-2xl card-elevated">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Préférences
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <Label htmlFor="timezone">Fuseau horaire</Label>
              <select
                id="timezone"
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              >
                <option value="Europe/Paris">Europe/Paris (UTC+1/+2)</option>
                <option value="Europe/London">Europe/London (UTC+0/+1)</option>
                <option value="America/New_York">America/New_York (UTC-5/-4)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2.5">{error}</p>
        )}

        {saved && (
          <p className="text-sm text-[hsl(var(--success))] bg-[hsl(var(--success))]/10 rounded-xl px-4 py-2.5">
            Profil sauvegardé avec succès.
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={upsert.isPending} className="rounded-xl">
            <Save className="mr-2 h-4 w-4" />
            {upsert.isPending ? 'Sauvegarde…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </div>
  );
}
