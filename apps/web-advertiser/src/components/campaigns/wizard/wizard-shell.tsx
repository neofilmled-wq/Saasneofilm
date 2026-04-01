'use client';

import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@neofilm/ui';
import { useCampaignWizard } from '@/stores/campaign-wizard.store';

const BASE_STEPS = [
  { key: 'basics', label: 'Informations', description: 'Nom, type, dates' },
  { key: 'media', label: 'Média', description: 'Vidéo ou image', onlyIf: 'AD_SPOT' as const },
  { key: 'catalog', label: 'Fiche catalogue', description: 'Infos & image', onlyIf: 'CATALOG_LISTING' as const },
  { key: 'targeting', label: 'Ciblage', description: 'Écrans TV' },
  { key: 'review', label: 'Validation', description: 'Résumé et paiement' },
];

export function WizardShell({ children }: { children: React.ReactNode }) {
  const { currentStep, setStep, draft } = useCampaignWizard();

  const STEPS = useMemo(() =>
    BASE_STEPS.filter((s) => !s.onlyIf || draft.types.includes(s.onlyIf)),
    [draft.types],
  );

  return (
    <div className="mx-auto max-w-4xl">
      {/* Step indicator */}
      <nav className="mb-8">
        <ol className="flex items-center">
          {STEPS.map((step, i) => (
            <li key={step.label} className="flex flex-1 items-center">
              <button
                onClick={() => i < currentStep && setStep(i)}
                disabled={i > currentStep}
                className={cn('flex items-center gap-2', i > currentStep && 'opacity-50')}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors',
                    i < currentStep && 'border-primary bg-primary text-primary-foreground',
                    i === currentStep && 'border-primary text-primary',
                    i > currentStep && 'border-muted-foreground/30 text-muted-foreground',
                  )}
                >
                  {i < currentStep ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="text-sm font-medium">{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-2 h-0.5 flex-1',
                    i < currentStep ? 'bg-primary' : 'bg-muted',
                  )}
                />
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Step content */}
      <div className="rounded-lg border bg-card p-6">{children}</div>
    </div>
  );
}
