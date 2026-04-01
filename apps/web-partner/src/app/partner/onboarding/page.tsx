'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@neofilm/ui';
import { cn } from '@neofilm/ui';
import { Building2, MapPin, Users, CheckCircle2, ArrowRight, ArrowLeft, Plus, Trash2, Tv } from 'lucide-react';

type Step = 'welcome' | 'org_info' | 'add_sites' | 'invite_team' | 'complete';

const STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: 'welcome', label: 'Bienvenue', icon: Tv },
  { key: 'org_info', label: 'Organisation', icon: Building2 },
  { key: 'add_sites', label: 'Sites', icon: MapPin },
  { key: 'invite_team', label: 'Équipe', icon: Users },
  { key: 'complete', label: 'Terminé', icon: CheckCircle2 },
];

const orgSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  contactEmail: z.string().email('Email invalide'),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().min(1),
  siretNumber: z.string().optional(),
  vatNumber: z.string().optional(),
});

type OrgFormValues = z.infer<typeof orgSchema>;

interface SiteEntry {
  name: string;
  address: string;
  city: string;
  category: string;
}

interface InviteEntry {
  email: string;
  role: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [sites, setSites] = useState<SiteEntry[]>([{ name: '', address: '', city: '', category: 'hotel' }]);
  const [invites, setInvites] = useState<InviteEntry[]>([]);

  const orgForm = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: { name: '', contactEmail: '', country: 'FR' },
  });

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const next = () => {
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEPS.length) setStep(STEPS[nextIdx].key);
  };

  const prev = () => {
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) setStep(STEPS[prevIdx].key);
  };

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => {
          const StepIcon = s.icon;
          const isActive = i === stepIndex;
          const isDone = i < stepIndex;
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className={cn('h-px w-12', isDone ? 'bg-primary' : 'bg-border')} />}
              <div
                className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' :
                  isDone ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground',
                )}
              >
                <StepIcon className="h-5 w-5" />
              </div>
            </div>
          );
        })}
      </div>

      {step === 'welcome' && (
        <Card>
          <CardContent className="p-12 text-center">
            <Tv className="h-16 w-16 text-primary mx-auto mb-6" />
            <h1 className="text-3xl font-bold mb-3">Bienvenue sur NeoFilm</h1>
            <p className="text-muted-foreground max-w-md mx-auto mb-8">
              Configurons votre espace partenaire en quelques étapes.
              Vous pourrez ensuite ajouter des écrans et commencer la diffusion.
            </p>
            <Button size="lg" onClick={next}>
              Commencer
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'org_info' && (
        <Card>
          <CardHeader>
            <CardTitle>Informations de l'organisation</CardTitle>
            <CardDescription>Ces informations seront utilisées pour votre contrat et vos factures</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={orgForm.handleSubmit(() => next())}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Nom de l'organisation</Label>
                <Input placeholder="Ex: Hôtel Le Marais" {...orgForm.register('name')} />
                {orgForm.formState.errors.name && (
                  <p className="text-sm text-destructive">{orgForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email de contact</Label>
                  <Input type="email" placeholder="contact@monhotel.fr" {...orgForm.register('contactEmail')} />
                  {orgForm.formState.errors.contactEmail && (
                    <p className="text-sm text-destructive">{orgForm.formState.errors.contactEmail.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input placeholder="+33 1 23 45 67 89" {...orgForm.register('contactPhone')} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Adresse</Label>
                <Input placeholder="15 Rue des Archives, 75004 Paris" {...orgForm.register('address')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SIRET (optionnel)</Label>
                  <Input placeholder="123 456 789 00001" {...orgForm.register('siretNumber')} />
                </div>
                <div className="space-y-2">
                  <Label>N° TVA (optionnel)</Label>
                  <Input placeholder="FR12345678901" {...orgForm.register('vatNumber')} />
                </div>
              </div>
              <div className="flex justify-between pt-4">
                <Button type="button" variant="outline" onClick={prev}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Retour
                </Button>
                <Button type="submit">
                  Continuer <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 'add_sites' && (
        <Card>
          <CardHeader>
            <CardTitle>Ajoutez vos sites</CardTitle>
            <CardDescription>Les sites sont vos emplacements physiques (hôtels, conciergeries, etc.)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sites.map((site, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Nom du site"
                    value={site.name}
                    onChange={(e) => {
                      const updated = [...sites];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setSites(updated);
                    }}
                  />
                  <Input
                    placeholder="Ville"
                    value={site.city}
                    onChange={(e) => {
                      const updated = [...sites];
                      updated[i] = { ...updated[i], city: e.target.value };
                      setSites(updated);
                    }}
                  />
                </div>
                {sites.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={() => setSites(sites.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSites([...sites, { name: '', address: '', city: '', category: 'hotel' }])}
            >
              <Plus className="mr-2 h-4 w-4" /> Ajouter un site
            </Button>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={prev}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour
              </Button>
              <Button onClick={next}>
                Continuer <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'invite_team' && (
        <Card>
          <CardHeader>
            <CardTitle>Invitez votre équipe (optionnel)</CardTitle>
            <CardDescription>Vous pourrez toujours inviter des membres plus tard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {invites.map((invite, i) => (
              <div key={i} className="flex gap-3 items-center">
                <Input
                  placeholder="email@exemple.com"
                  type="email"
                  value={invite.email}
                  onChange={(e) => {
                    const updated = [...invites];
                    updated[i] = { ...updated[i], email: e.target.value };
                    setInvites(updated);
                  }}
                  className="flex-1"
                />
                <Select
                  value={invite.role}
                  onValueChange={(v) => {
                    const updated = [...invites];
                    updated[i] = { ...updated[i], role: v };
                    setInvites(updated);
                  }}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="MEMBER">Membre</SelectItem>
                    <SelectItem value="VIEWER">Lecteur</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setInvites(invites.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInvites([...invites, { email: '', role: 'MEMBER' }])}
            >
              <Plus className="mr-2 h-4 w-4" /> Ajouter un membre
            </Button>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={prev}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour
              </Button>
              <Button onClick={next}>
                {invites.length > 0 ? 'Envoyer les invitations' : 'Passer cette étape'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'complete' && (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-6" />
            <h1 className="text-3xl font-bold mb-3">Configuration terminée !</h1>
            <p className="text-muted-foreground max-w-md mx-auto mb-8">
              Votre espace partenaire est prêt. Vous pouvez maintenant ajouter des écrans
              et commencer à diffuser du contenu.
            </p>
            <div className="flex gap-3 justify-center">
              <Button size="lg" onClick={() => router.push('/partner/screens/new')}>
                <Plus className="mr-2 h-5 w-5" />
                Ajouter mon premier écran
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push('/partner/screens')}>
                Aller au tableau de bord
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
