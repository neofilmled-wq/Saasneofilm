'use client';

import { useState, useCallback, useEffect } from 'react';
import { Upload, Check, Loader2, X, AlertCircle, Image, RotateCcw, Info } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, CardContent, Input, Label, Textarea } from '@neofilm/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@neofilm/ui';
import { useCampaignWizard } from '@/stores/campaign-wizard.store';
import { useMediaLibrary } from '@/lib/api/hooks/use-media';
import { useCatalogueListings } from '@/lib/api/hooks/use-catalogue';
import { formatFileSize } from '@/lib/utils';
import { containsForbiddenChars, FORBIDDEN_CHARS_MESSAGE } from '@/lib/validation';
import { AddressAutocomplete } from '@/components/catalogue/address-autocomplete';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

const CATEGORIES = [
  { value: 'RESTAURANT', label: 'Restaurant / Café' },
  { value: 'SHOPPING', label: 'Commerce / Boutique' },
  { value: 'SPA', label: 'Beauté / Bien-être' },
  { value: 'CULTURE', label: 'Culture / Loisirs' },
  { value: 'SPORT', label: 'Sport' },
  { value: 'NIGHTLIFE', label: 'Vie nocturne' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'OTHER', label: 'Autre' },
];

interface UploadState {
  file: File | null;
  progress: number;
  error: string | null;
  status: 'idle' | 'validating' | 'uploading' | 'ready' | 'error';
}

const idleState: UploadState = { file: null, progress: 0, error: null, status: 'idle' };

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

function uploadFileToApi(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ key: string; fileUrl: string }> {
  return new Promise((resolve, reject) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('neofilm_adv_token') : null;
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status < 400) {
        try {
          const json = JSON.parse(xhr.responseText);
          const data = (json && 'data' in json && 'statusCode' in json) ? json.data : json;
          resolve(data);
        } catch {
          reject(new Error('Réponse invalide du serveur'));
        }
      } else {
        reject(new Error(`Erreur upload: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Erreur réseau'));
    xhr.open('POST', `${API_URL}/creatives/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
}

// ─── Image upload zone ────────────────────────────────────────────────────────

function ImageUploadZone({
  uploadState,
  draftUrl,
  onUpload,
  onReset,
}: {
  uploadState: UploadState;
  draftUrl: string | null;
  onUpload: (file: File) => void;
  onReset: () => void;
}) {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  }, [onUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  }, [onUpload]);

  const isReady = uploadState.status === 'ready';

  if (isReady || draftUrl) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Image className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Image de la fiche</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="h-32 w-32 overflow-hidden rounded-md bg-muted shrink-0">
              <img src={draftUrl!} alt="Aperçu catalogue" className="h-full w-full object-cover" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <p className="font-medium text-sm">Image prête</p>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {uploadState.file && <p>{uploadState.file.name} — {formatFileSize(uploadState.file.size)}</p>}
              </div>
              <Button variant="outline" size="sm" className="mt-3" onClick={onReset}>
                Changer l&apos;image
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (uploadState.status === 'uploading' || uploadState.status === 'validating') {
    return (
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <Image className="h-5 w-5 text-primary shrink-0" />
          <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">{uploadState.file?.name}</p>
            <div className="mt-1.5 h-2 w-full rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${uploadState.progress}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Upload {uploadState.progress}%</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onReset}><X className="h-4 w-4" /></Button>
        </CardContent>
      </Card>
    );
  }

  if (uploadState.status === 'error') {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex items-center gap-4 p-4">
          <Image className="h-5 w-5 text-destructive shrink-0" />
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">{uploadState.error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onReset}>Réessayer</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:border-primary hover:bg-primary/5 cursor-pointer"
    >
      <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
      <p className="mb-1 font-medium">Glissez votre image ici</p>
      <p className="mb-3 text-sm text-muted-foreground">JPG, PNG ou WebP, max 10 Mo</p>
      <label>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileInput} className="sr-only" />
        <span className="cursor-pointer text-sm font-medium text-primary hover:underline">Ou parcourir vos fichiers</span>
      </label>
    </div>
  );
}

// ─── Previous images picker ──────────────────────────────────────────────────

function PreviousImagesPicker({ onSelect }: { onSelect: (img: { id: string; name: string; fileUrl: string }) => void }) {
  const { data, isLoading } = useMediaLibrary({ type: 'IMAGE', status: 'READY', limit: 20 });
  const images = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de vos images...
      </div>
    );
  }

  if (images.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <RotateCcw className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Ou reprendre une image précédente</span>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => onSelect({ id: img.id, name: img.name, fileUrl: img.fileUrl })}
            className="group relative overflow-hidden rounded-lg border-2 border-muted transition-colors hover:border-primary focus:border-primary focus:outline-none"
          >
            <div className="aspect-square bg-muted">
              <img
                src={img.fileUrl}
                alt={img.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-1.5">
              <p className="truncate text-xs font-medium">{img.name}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Existing listing read-only view ─────────────────────────────────────────

function ExistingCatalogPreview({ listing, onNext, onPrev }: {
  listing: { id: string; title: string; description: string | null; category: string; imageUrl: string | null; ctaUrl: string | null; promoCode: string | null; phone: string | null; address: string | null; keywords: string[] };
  onNext: () => void;
  onPrev: () => void;
}) {
  const categoryLabel = CATEGORIES.find((c) => c.value === listing.category)?.label ?? listing.category;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Fiche catalogue</h2>

      {/* Info banner */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex gap-3 p-4">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Vous avez déjà une fiche catalogue</p>
            <p className="mt-1 text-muted-foreground">
              Cette fiche sera réutilisée pour votre nouvelle campagne. Si vous souhaitez la modifier,
              rendez-vous dans l&apos;onglet{' '}
              <Link href="/catalog" className="font-medium text-primary hover:underline">Catalogue</Link>
              {' '}— les modifications seront automatiquement appliquées sur tous les écrans.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Read-only form preview */}
      <div className="space-y-5 opacity-60 pointer-events-none select-none">
        <div className="space-y-2">
          <Label>Titre de la fiche</Label>
          <Input value={listing.title} readOnly className="bg-muted" />
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={listing.description ?? ''} readOnly rows={4} className="bg-muted" />
        </div>

        <div className="space-y-2">
          <Label>Catégorie</Label>
          <Input value={categoryLabel} readOnly className="bg-muted" />
        </div>

        {listing.imageUrl && (
          <div className="space-y-2">
            <Label>Image de la fiche</Label>
            <div className="h-32 w-32 overflow-hidden rounded-md bg-muted">
              <img src={listing.imageUrl} alt={listing.title} className="h-full w-full object-cover" />
            </div>
          </div>
        )}

        {listing.phone && (
          <div className="space-y-2">
            <Label>Téléphone</Label>
            <Input value={listing.phone} readOnly className="bg-muted" />
          </div>
        )}

        {listing.address && (
          <div className="space-y-2">
            <Label>Adresse</Label>
            <Input value={listing.address} readOnly className="bg-muted" />
          </div>
        )}

        {listing.ctaUrl && (
          <div className="space-y-2">
            <Label>Lien CTA</Label>
            <Input value={listing.ctaUrl} readOnly className="bg-muted" />
          </div>
        )}

        {listing.promoCode && (
          <div className="space-y-2">
            <Label>Code promo</Label>
            <Input value={listing.promoCode} readOnly className="bg-muted" />
          </div>
        )}

        {listing.keywords.length > 0 && (
          <div className="space-y-2">
            <Label>Mots-clés</Label>
            <Input value={listing.keywords.join(', ')} readOnly className="bg-muted" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrev}>Précédent</Button>
        <Button onClick={onNext}>Suivant</Button>
      </div>
    </div>
  );
}

// ─── Main StepCatalog component ─────────────────────────────────────────────

export function StepCatalog() {
  const { draft, updateDraft, nextStep, prevStep } = useCampaignWizard();
  // Check if the advertiser already has a catalogue listing
  const { data: existingListings, isLoading: loadingListings } = useCatalogueListings();
  const existingListing = existingListings?.[0] ?? null;

  const [imageUpload, setImageUpload] = useState<UploadState>({
    ...idleState,
    status: draft.catalogImageStatus === 'ready' ? 'ready' : 'idle',
  });

  // ── Image upload ──
  async function handleImageUpload(file: File) {
    setImageUpload({ file, progress: 0, error: null, status: 'validating' });

    if (!IMAGE_TYPES.includes(file.type)) {
      setImageUpload((s) => ({ ...s, status: 'error', error: 'Format non supporté. Utilisez JPG, PNG ou WebP.' }));
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageUpload((s) => ({ ...s, status: 'error', error: `Image trop volumineuse. Maximum ${formatFileSize(MAX_IMAGE_SIZE)}.` }));
      return;
    }

    setImageUpload((s) => ({ ...s, status: 'uploading', progress: 0 }));

    let key: string;
    let fileUrl: string;
    try {
      const result = await uploadFileToApi(file, (pct) => {
        setImageUpload((s) => ({ ...s, progress: pct }));
      });
      key = result.key;
      fileUrl = result.fileUrl;
    } catch (e: any) {
      setImageUpload((s) => ({ ...s, status: 'error', error: e?.message ?? "Erreur lors de l'upload." }));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setImageUpload((s) => ({ ...s, status: 'ready' }));
    updateDraft({
      catalogImageId: key,
      catalogImageKey: key,
      catalogImageFileUrl: fileUrl,
      catalogImageUrl: objectUrl,
      catalogImageStatus: 'ready',
    });
  }

  function handleImageReset() {
    setImageUpload(idleState);
    updateDraft({ catalogImageId: null, catalogImageKey: null, catalogImageFileUrl: null, catalogImageUrl: null, catalogImageStatus: 'none' });
  }

  function handleSelectPreviousImage(img: { id: string; name: string; fileUrl: string }) {
    setImageUpload({ file: null, progress: 100, error: null, status: 'ready' });
    updateDraft({
      catalogImageId: img.id,
      catalogImageKey: null,
      catalogImageFileUrl: img.fileUrl,
      catalogImageUrl: img.fileUrl,
      catalogImageStatus: 'ready',
    });
  }

  // ── Populate draft from existing listing so review validation passes ──
  useEffect(() => {
    if (existingListing) {
      updateDraft({
        catalogTitle: existingListing.title || draft.catalogTitle,
        catalogDescription: existingListing.description ?? draft.catalogDescription,
        catalogCategory: existingListing.category || draft.catalogCategory,
        catalogCtaUrl: existingListing.ctaUrl ?? draft.catalogCtaUrl,
        catalogPromoCode: existingListing.promoCode ?? draft.catalogPromoCode,
        catalogPhone: existingListing.phone ?? draft.catalogPhone,
        catalogAddress: existingListing.address ?? draft.catalogAddress,
        catalogKeywords: existingListing.keywords?.join(', ') || draft.catalogKeywords,
        ...(existingListing.imageUrl ? {
          catalogImageUrl: existingListing.imageUrl,
          catalogImageFileUrl: existingListing.imageUrl,
          catalogImageStatus: 'ready' as const,
        } : {}),
      });
    }
  }, [existingListing?.id]);

  // ── Loading state ──
  if (loadingListings) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Chargement...</span>
      </div>
    );
  }

  // ── Existing listing → read-only preview ──
  if (existingListing) {
    return (
      <ExistingCatalogPreview
        listing={existingListing}
        onNext={nextStep}
        onPrev={prevStep}
      />
    );
  }

  // ── No existing listing → editable form ──
  const imageReady = imageUpload.status === 'ready' || draft.catalogImageStatus === 'ready';
  const hasForbidden = containsForbiddenChars(draft.catalogTitle)
    || containsForbiddenChars(draft.catalogDescription)
    || containsForbiddenChars(draft.catalogCtaUrl)
    || containsForbiddenChars(draft.catalogPromoCode)
    || containsForbiddenChars(draft.catalogKeywords);
  const formValid = draft.catalogTitle.trim().length >= 3
    && draft.catalogDescription.trim().length >= 10
    && draft.catalogCategory.length > 0
    && draft.catalogPhone.trim().length > 0
    && draft.catalogAddress.trim().length > 0
    && draft.catalogKeywords.trim().length > 0
    && !hasForbidden;
  const canProceed = imageReady && formValid;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Fiche catalogue</h2>
      <p className="text-sm text-muted-foreground">
        Renseignez les informations de votre fiche pour le catalogue « Découvrir la ville ».
      </p>

      {/* Titre */}
      <div className="space-y-2">
        <Label htmlFor="catalogTitle">Titre de la fiche *</Label>
        <Input
          id="catalogTitle"
          placeholder="Ex: Boulangerie Dupont — Artisan depuis 1982"
          value={draft.catalogTitle}
          onChange={(e) => updateDraft({ catalogTitle: e.target.value })}
        />
        {draft.catalogTitle.length > 0 && draft.catalogTitle.length < 3 && (
          <p className="text-sm text-destructive">Minimum 3 caractères</p>
        )}
        {containsForbiddenChars(draft.catalogTitle) && (
          <p className="text-sm text-destructive">{FORBIDDEN_CHARS_MESSAGE}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="catalogDescription">Description *</Label>
        <Textarea
          id="catalogDescription"
          rows={4}
          placeholder="Décrivez votre activité..."
          value={draft.catalogDescription}
          onChange={(e) => updateDraft({ catalogDescription: e.target.value })}
        />
        {draft.catalogDescription.length > 0 && draft.catalogDescription.length < 10 && (
          <p className="text-sm text-destructive">Minimum 10 caractères</p>
        )}
        {containsForbiddenChars(draft.catalogDescription) && (
          <p className="text-sm text-destructive">{FORBIDDEN_CHARS_MESSAGE}</p>
        )}
      </div>

      {/* Catégorie */}
      <div className="space-y-2">
        <Label>Catégorie *</Label>
        <Select
          value={draft.catalogCategory}
          onValueChange={(v) => updateDraft({ catalogCategory: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sélectionner..." />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Image */}
      <div className="space-y-2">
        <Label>Image de la fiche *</Label>
        <ImageUploadZone
          uploadState={imageUpload}
          draftUrl={draft.catalogImageUrl}
          onUpload={handleImageUpload}
          onReset={handleImageReset}
        />
        {imageUpload.status === 'idle' && draft.catalogImageStatus !== 'ready' && (
          <PreviousImagesPicker onSelect={handleSelectPreviousImage} />
        )}
      </div>

      {/* Téléphone */}
      <div className="space-y-2">
        <Label htmlFor="catalogPhone">Téléphone *</Label>
        <Input
          id="catalogPhone"
          placeholder="04 73 42 63 63"
          value={draft.catalogPhone}
          onChange={(e) => updateDraft({ catalogPhone: e.target.value })}
        />
        {draft.catalogPhone.length === 0 && (
          <p className="text-sm text-muted-foreground">Le numéro de téléphone est requis</p>
        )}
      </div>

      {/* Adresse */}
      <div className="space-y-2">
        <Label htmlFor="catalogAddress">Adresse *</Label>
        <AddressAutocomplete
          id="catalogAddress"
          value={draft.catalogAddress}
          onChange={(val) => updateDraft({ catalogAddress: val })}
          placeholder="10 Rue Philippe Marcombes, 63000 Clermont-Ferrand"
        />
        {draft.catalogAddress.length === 0 && (
          <p className="text-sm text-muted-foreground">L'adresse est requise</p>
        )}
      </div>

      {/* Lien CTA */}
      <div className="space-y-2">
        <Label htmlFor="catalogCtaUrl">Lien CTA (optionnel)</Label>
        <Input
          id="catalogCtaUrl"
          placeholder="https://votre-site.com"
          value={draft.catalogCtaUrl}
          onChange={(e) => updateDraft({ catalogCtaUrl: e.target.value })}
        />
        {containsForbiddenChars(draft.catalogCtaUrl) && (
          <p className="text-sm text-destructive">{FORBIDDEN_CHARS_MESSAGE}</p>
        )}
      </div>

      {/* Code promo */}
      <div className="space-y-2">
        <Label htmlFor="catalogPromoCode">Code promo (optionnel)</Label>
        <Input
          id="catalogPromoCode"
          placeholder="Ex: NEOFILM10"
          value={draft.catalogPromoCode}
          onChange={(e) => updateDraft({ catalogPromoCode: e.target.value })}
        />
        {containsForbiddenChars(draft.catalogPromoCode) && (
          <p className="text-sm text-destructive">{FORBIDDEN_CHARS_MESSAGE}</p>
        )}
      </div>

      {/* Mots-clés */}
      <div className="space-y-2">
        <Label htmlFor="catalogKeywords">Mots-clés (séparés par des virgules) *</Label>
        <Input
          id="catalogKeywords"
          placeholder="pain, viennoiserie, artisan"
          value={draft.catalogKeywords}
          onChange={(e) => updateDraft({ catalogKeywords: e.target.value })}
        />
        {draft.catalogKeywords.length === 0 && (
          <p className="text-sm text-muted-foreground">Ajoutez au moins un mot-clé</p>
        )}
        {containsForbiddenChars(draft.catalogKeywords) && (
          <p className="text-sm text-destructive">{FORBIDDEN_CHARS_MESSAGE}</p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep}>Précédent</Button>
        <Button onClick={nextStep} disabled={!canProceed}>Suivant</Button>
      </div>
    </div>
  );
}
