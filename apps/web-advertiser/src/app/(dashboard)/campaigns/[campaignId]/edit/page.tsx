'use client';

import { use, useEffect, useMemo } from 'react';
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
import { useCampaign, useCampaignGroup } from '@/lib/api/hooks/use-campaigns';
import { LoadingPage } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';

export default function EditCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  const { data: campaign, isLoading, isError, refetch } = useCampaign(campaignId);
  const { data: groupCampaigns = [] } = useCampaignGroup(campaign?.groupId);
  const { currentStep, editingCampaignId, initFromCampaign } = useCampaignWizard();

  // Wait for groupCampaigns to load before initializing (if campaign has a groupId)
  const groupReady = !campaign?.groupId || groupCampaigns.length > 0;

  useEffect(() => {
    if (campaign && groupReady && editingCampaignId !== campaign.id) {
      const allTypes = campaign.groupId && groupCampaigns.length > 1
        ? [...new Set(groupCampaigns.map((c: any) => c.type))]
        : [campaign.type];
      initFromCampaign({ ...campaign, allTypes, groupCampaigns: groupCampaigns.length > 1 ? groupCampaigns : undefined });
    }
  }, [campaign, editingCampaignId, initFromCampaign, groupCampaigns, groupReady]);

  // Clean up on unmount only if we navigate away without saving
  useEffect(() => {
    return () => {
      // Do not reset — StepReview will reset after successful save
    };
  }, []);

  const { draft } = useCampaignWizard();
  const hasAdSpot = draft.types.includes('AD_SPOT');
  const hasCatalog = draft.types.includes('CATALOG_LISTING');
  const STEPS = useMemo(() => {
    const steps: React.ComponentType[] = [StepBasics];
    if (hasAdSpot) steps.push(StepMedia);
    if (hasCatalog) steps.push(StepCatalog);
    steps.push(StepTargeting, StepReview);
    return steps;
  }, [hasAdSpot, hasCatalog]);

  if (isLoading || !groupReady || (campaign && editingCampaignId !== campaign.id)) return <LoadingPage />;
  if (isError || !campaign) return <ErrorState onRetry={() => refetch()} />;

  const StepComponent = STEPS[currentStep];

  return (
    <>
      <PageHeader
        title={`Modifier : ${campaign.name}`}
        description="Modifiez les informations de votre campagne"
        actions={
          <Link href={`/campaigns/${campaignId}`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Annuler
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
