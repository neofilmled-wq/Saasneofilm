'use client';

import { useState } from 'react';
import { Sparkles, Paintbrush } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { AIGeneratorTab } from '@/components/ad-creation/ai-generator-tab';
import { CanvaCreatorTab } from '@/components/ad-creation/canva-creator-tab';

export default function AdCreationPage() {
  const [activeTab, setActiveTab] = useState('ai-generator');

  return (
    <>
      <PageHeader
        title="Création pub"
        description="Créez vos visuels et spots publicitaires pour vos campagnes cinéma"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="ai-generator" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            Générateur IA
          </TabsTrigger>
          <TabsTrigger value="canva-creator" className="gap-1.5">
            <Paintbrush className="h-4 w-4" />
            Créer ma pub
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai-generator">
          <AIGeneratorTab />
        </TabsContent>

        <TabsContent value="canva-creator">
          <CanvaCreatorTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
