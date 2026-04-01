'use client';

import { useState } from 'react';
import { Sparkles, Coins, Play, RefreshCw, Download, Loader2 } from 'lucide-react';
import { Button, Card, CardContent, Textarea, Label } from '@neofilm/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@neofilm/ui';
import { toast } from 'sonner';
import { useAICredits, useGenerateVideo, useAIJob, usePurchaseCredits } from '@/lib/api/hooks/use-ai';

const TEMPLATES = [
  { value: 'restaurant', label: 'Restaurant / Café', prompt: 'Créez un spot vidéo attractif pour un restaurant local avec ambiance chaleureuse, plats appétissants et invitation à découvrir le menu.' },
  { value: 'retail', label: 'Commerce / Boutique', prompt: 'Spot vidéo dynamique pour une boutique locale avec présentation des produits, promotions en cours et ambiance shopping.' },
  { value: 'beauty', label: 'Beauté / Bien-être', prompt: 'Vidéo élégante pour un salon de beauté avec prestations, ambiance zen et offres spéciales.' },
  { value: 'hotel', label: 'Hôtellerie', prompt: 'Spot vidéo luxueux pour un hôtel avec chambres, services et attractions locales.' },
  { value: 'event', label: 'Événement', prompt: 'Vidéo énergique annonçant un événement local avec dates, lieu et programme.' },
  { value: 'custom', label: 'Personnalisé', prompt: '' },
];

const CREDIT_PACKS = [
  { id: 'pack_10', credits: 10, price: '9,99 €' },
  { id: 'pack_25', credits: 25, price: '19,99 €' },
  { id: 'pack_50', credits: 50, price: '34,99 €' },
  { id: 'pack_100', credits: 100, price: '59,99 €' },
];

const CREDIT_COST = 5;

export function AIGeneratorTab() {
  const { data: credits } = useAICredits();
  const generateVideo = useGenerateVideo();
  const purchaseCredits = usePurchaseCredits();

  const [template, setTemplate] = useState('restaurant');
  const [prompt, setPrompt] = useState(TEMPLATES[0].prompt);
  const [duration, setDuration] = useState<'15' | '30'>('15');
  const [jobId, setJobId] = useState<string | null>(null);
  const [showCreditsShop, setShowCreditsShop] = useState(false);

  const { data: job } = useAIJob(jobId ?? '');

  function handleTemplateChange(value: string) {
    setTemplate(value);
    const t = TEMPLATES.find((t) => t.value === value);
    if (t && t.prompt) setPrompt(t.prompt);
  }

  async function handleGenerate() {
    if (!credits || credits.balance < CREDIT_COST) {
      toast.error(`Crédits insuffisants. Vous avez ${credits?.balance ?? 0} crédits, il en faut ${CREDIT_COST}.`);
      setShowCreditsShop(true);
      return;
    }
    try {
      const result = await generateVideo.mutateAsync({
        prompt,
        businessType: template,
        duration: parseInt(duration),
        creditCost: CREDIT_COST,
      });
      setJobId(result.jobId);
      toast.success('Génération lancée !');
    } catch {
      toast.error('Erreur lors de la génération');
    }
  }

  async function handlePurchaseCredits(packId: string, creditsCount: number) {
    try {
      const result = await purchaseCredits.mutateAsync({ packId, credits: creditsCount });
      window.open(result.checkoutUrl, '_blank');
    } catch {
      toast.error('Erreur lors de l\'achat');
    }
  }

  return (
    <>
      {/* Credits bar */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Créez des spots vidéo professionnels grâce à l'intelligence artificielle
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-3 py-1.5">
            <Coins className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium">{credits?.balance ?? 0} crédits</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowCreditsShop(!showCreditsShop)}>
            Acheter des crédits
          </Button>
        </div>
      </div>

      {/* Credits shop */}
      {showCreditsShop && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50/50">
          <CardContent className="p-4">
            <h3 className="mb-3 font-semibold">Acheter des crédits IA</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              {CREDIT_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  onClick={() => handlePurchaseCredits(pack.id, pack.credits)}
                  className="rounded-lg border bg-white p-3 text-center transition-shadow hover:shadow-md"
                >
                  <p className="text-2xl font-bold text-primary">{pack.credits}</p>
                  <p className="text-xs text-muted-foreground">crédits</p>
                  <p className="mt-1 text-sm font-medium">{pack.price}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input panel */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="space-y-2">
                <Label>Modèle de départ</Label>
                <Select value={template} onValueChange={handleTemplateChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Prompt de génération</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  placeholder="Décrivez le spot vidéo que vous souhaitez créer..."
                />
                <p className="text-xs text-muted-foreground">
                  Soyez précis : décrivez l'ambiance, les couleurs, le message, et le call-to-action.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Durée du spot</Label>
                <div className="flex gap-2">
                  {(['15', '30'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={`rounded-lg border-2 px-4 py-2 text-sm font-medium ${
                        duration === d ? 'border-primary bg-primary/5' : 'border-muted'
                      }`}
                    >
                      {d} secondes
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Coins className="h-4 w-4 text-yellow-500" />
                  Coût: <span className="font-medium">{CREDIT_COST} crédits</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  Solde après: {Math.max(0, (credits?.balance ?? 0) - CREDIT_COST)} crédits
                </span>
              </div>

              <Button
                className="w-full gap-1.5"
                onClick={handleGenerate}
                disabled={generateVideo.isPending || !prompt.trim()}
              >
                {generateVideo.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Générer la vidéo
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Preview panel */}
        <div>
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 font-semibold">Résultat</h3>
              {!jobId && !job && (
                <div className="flex aspect-video items-center justify-center rounded-lg border-2 border-dashed bg-muted/30">
                  <div className="text-center text-muted-foreground">
                    <Play className="mx-auto mb-2 h-10 w-10" />
                    <p className="text-sm">La prévisualisation apparaîtra ici</p>
                  </div>
                </div>
              )}

              {jobId && job?.status !== 'COMPLETED' && (
                <div className="flex aspect-video items-center justify-center rounded-lg border bg-muted/30">
                  <div className="text-center">
                    <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-primary" />
                    <p className="font-medium">Génération en cours...</p>
                    <p className="text-sm text-muted-foreground">
                      {job?.progress ?? 0}% — Veuillez patienter
                    </p>
                  </div>
                </div>
              )}

              {job?.status === 'COMPLETED' && job.resultUrl && (
                <>
                  <div className="aspect-video overflow-hidden rounded-lg bg-black">
                    <video src={job.resultUrl} controls poster={job.thumbnailUrl} className="h-full w-full" />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" className="gap-1.5" onClick={() => { setJobId(null); handleGenerate(); }}>
                      <RefreshCw className="h-4 w-4" /> Régénérer
                    </Button>
                    <Button className="gap-1.5">
                      <Download className="h-4 w-4" /> Sauvegarder dans la médiathèque
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
