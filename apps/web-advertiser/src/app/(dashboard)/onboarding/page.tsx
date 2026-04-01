'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CreditCard, Users, Check, ArrowRight, Tv } from 'lucide-react';
import { Button, Card, CardContent, Input, Label } from '@neofilm/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@neofilm/ui';
import { toast } from 'sonner';

const STEPS = [
  { icon: Building2, label: 'Votre entreprise' },
  { icon: CreditCard, label: 'Facturation' },
  { icon: Users, label: 'Équipe' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  function nextStep() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      toast.success('Configuration terminée ! Bienvenue sur NeoFilm.');
      router.push('/campaigns');
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
          <Tv className="h-7 w-7 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold">Bienvenue sur NeoFilm</h1>
        <p className="text-muted-foreground">Configurons votre espace annonceur en quelques étapes</p>
      </div>

      {/* Steps indicator */}
      <div className="mb-8 flex items-center gap-4">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
              i < step ? 'bg-primary text-primary-foreground' : i === step ? 'border-2 border-primary text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              {i < step ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
            </div>
            <span className={`text-sm ${i === step ? 'font-medium' : 'text-muted-foreground'}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <div className={`h-px w-8 ${i < step ? 'bg-primary' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card className="w-full">
        <CardContent className="space-y-6 p-6">
          {step === 0 && (
            <>
              <h2 className="text-lg font-semibold">Informations de votre entreprise</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nom de l'entreprise *</Label>
                  <Input placeholder="Boulangerie Dupont" />
                </div>
                <div className="space-y-2">
                  <Label>Email professionnel *</Label>
                  <Input type="email" placeholder="contact@votre-entreprise.fr" />
                </div>
                <div className="space-y-2">
                  <Label>Catégorie d'activité *</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="restaurant">Restaurant / Café</SelectItem>
                      <SelectItem value="retail">Commerce / Boutique</SelectItem>
                      <SelectItem value="beauty">Beauté / Bien-être</SelectItem>
                      <SelectItem value="hotel">Hôtellerie</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input placeholder="+33 1 23 45 67 89" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Adresse</Label>
                  <Input placeholder="12 rue de la Paix, 75001 Paris" />
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-lg font-semibold">Configuration de la facturation</h2>
              <p className="text-sm text-muted-foreground">
                Nous utilisons Stripe pour gérer vos paiements de manière sécurisée.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>N° SIRET</Label>
                  <Input placeholder="123 456 789 00001" />
                </div>
                <div className="space-y-2">
                  <Label>N° TVA (optionnel)</Label>
                  <Input placeholder="FR12345678901" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Adresse de facturation</Label>
                  <Input placeholder="12 rue de la Paix, 75001 Paris" />
                </div>
              </div>
              <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-700">
                Vous pourrez ajouter votre moyen de paiement lors de votre première souscription.
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-lg font-semibold">Invitez votre équipe (optionnel)</h2>
              <p className="text-sm text-muted-foreground">
                Ajoutez des membres à votre équipe pour collaborer sur vos campagnes.
              </p>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input placeholder="email@exemple.com" className="flex-1" />
                  <Select defaultValue="MARKETER">
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MARKETER">Marketing</SelectItem>
                      <SelectItem value="VIEWER">Lecture seule</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline">Ajouter</Button>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                Vous pouvez aussi inviter des membres plus tard depuis les paramètres.
              </div>
            </>
          )}

          <div className="flex justify-end">
            <Button className="gap-1.5" onClick={nextStep}>
              {step < STEPS.length - 1 ? 'Suivant' : 'Commencer'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
