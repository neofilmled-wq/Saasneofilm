'use client';

import { useEffect, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { WizardShell } from '@/components/campaigns/wizard/wizard-shell';
import { StepBasics } from '@/components/campaigns/wizard/step-basics';
import { StepMedia } from '@/components/campaigns/wizard/step-media';
import { StepCatalog } from '@/components/campaigns/wizard/step-catalog';
import { StepTargeting } from '@/components/campaigns/wizard/step-targeting';
import { StepReview } from '@/components/campaigns/wizard/step-review';
import { useCampaignWizard } from '@/stores/campaign-wizard.store';

export default function NewCampaignPage() {
  const { currentStep, reset, draft } = useCampaignWizard();

  const hasAdSpot = draft.types.includes('AD_SPOT');
  const hasCatalog = draft.types.includes('CATALOG_LISTING');
  const STEPS = useMemo(() => {
    const steps: React.ComponentType[] = [StepBasics];
    if (hasAdSpot) steps.push(StepMedia);
    if (hasCatalog) steps.push(StepCatalog);
    steps.push(StepTargeting, StepReview);
    return steps;
  }, [hasAdSpot, hasCatalog]);

  const StepComponent = STEPS[currentStep];

  useEffect(() => {
    reset();
  }, []);

  return (
    <>
      <PageHeader
        title="Nouvelle campagne"
        description="Créez et lancez votre campagne publicitaire en quelques minutes"
        actions={
          <Link href="/campaigns">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Retour aux campagnes
            </Button>
          </Link>
        }
      />
      <WizardShell>
        <StepComponent />
      </WizardShell>
    </>
  );
}
