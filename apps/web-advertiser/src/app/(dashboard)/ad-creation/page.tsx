'use client';

import { PageHeader } from '@/components/common/page-header';
import { CanvaCreatorTab } from '@/components/ad-creation/canva-creator-tab';

// The "Générateur IA" tab (video generation + AI credit packs) is removed for
// now: the credit purchase went through Stripe but nothing ever credited the
// wallet, and the generation endpoints it called did not exist server-side.
// Canva is the only creation path until the AI module is finished.
export default function AdCreationPage() {
  return (
    <>
      <PageHeader
        title="Création pub"
        description="Créez vos visuels et spots publicitaires pour vos campagnes cinéma"
      />

      <CanvaCreatorTab />
    </>
  );
}
