import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CampaignType, DiffusionTrigger, MockScreen } from '@/lib/mock-data';

export interface CampaignDraft {
  // Step 1: Basics
  name: string;
  description: string;
  objective: string;
  category: string;
  types: CampaignType[];
  startDate: string;
  endDate: string;
  subscriptionMonths: 6 | 12;

  // Step 2: Media — AD_SPOT (video)
  mediaId: string | null;
  mediaUrl: string | null;       // blob URL for in-session preview
  mediaFileUrl: string | null;   // real MinIO/S3 URL for Creative record
  mediaKey: string | null;       // S3 object key
  mediaThumbnail: string | null;
  mediaDurationMs: number | null;
  mediaStatus: 'none' | 'uploading' | 'processing' | 'ready';
  // Step 2: Media — CATALOG_LISTING (image) — now in step-catalog
  catalogImageId: string | null;
  catalogImageUrl: string | null;      // blob URL for in-session preview
  catalogImageFileUrl: string | null;  // real MinIO/S3 URL for Creative record
  catalogImageKey: string | null;      // S3 object key
  catalogImageStatus: 'none' | 'uploading' | 'ready';

  // Step 3 (if CATALOG_LISTING): Catalog form fields
  catalogTitle: string;
  catalogDescription: string;
  catalogCategory: string;
  catalogCtaUrl: string;
  catalogPromoCode: string;
  catalogPhone: string;
  catalogAddress: string;
  catalogKeywords: string;

  // Targeting — Diffusion (AD_SPOT)
  selectedScreenIds: string[];
  selectedScreens: MockScreen[];
  packSize: number | null;
  // Step 3: Targeting — Catalogue (CATALOG_LISTING)
  catalogSelectedScreenIds: string[];
  catalogSelectedScreens: MockScreen[];
  catalogPackSize: number | null;
  // Shared targeting filters
  targetingCity: string;
  targetingLat: number | null;
  targetingLng: number | null;
  targetingRadiusKm: number;

  // Step 4: Scheduling
  triggers: DiffusionTrigger[];
  frequencyCapPerHour: number;
  durationSeconds: 15 | 30;

  // Step 5: Submitted
  agreedToTerms: boolean;
}

const defaultDraft: CampaignDraft = {
  name: '',
  description: '',
  objective: '',
  category: '',
  types: [],
  startDate: '',
  endDate: '',
  subscriptionMonths: 6,
  mediaId: null,
  mediaUrl: null,
  mediaFileUrl: null,
  mediaKey: null,
  mediaThumbnail: null,
  mediaDurationMs: null,
  mediaStatus: 'none',
  catalogImageId: null,
  catalogImageUrl: null,
  catalogImageFileUrl: null,
  catalogImageKey: null,
  catalogImageStatus: 'none',
  catalogTitle: '',
  catalogDescription: '',
  catalogCategory: '',
  catalogCtaUrl: '',
  catalogPromoCode: '',
  catalogPhone: '',
  catalogAddress: '',
  catalogKeywords: '',
  selectedScreenIds: [],
  selectedScreens: [],
  packSize: null,
  catalogSelectedScreenIds: [],
  catalogSelectedScreens: [],
  catalogPackSize: null,
  targetingCity: '',
  targetingLat: null,
  targetingLng: null,
  targetingRadiusKm: 50,
  triggers: ['POWER_ON', 'OPEN_APP'],
  frequencyCapPerHour: 3,
  durationSeconds: 20 as 15 | 30,
  agreedToTerms: false,
};

interface WizardState {
  currentStep: number;
  draft: CampaignDraft;
  /** Set when editing an existing campaign; null when creating new */
  editingCampaignId: string | null;
  /** Original pack sizes from DB — used as minimum in edit mode */
  initialDiffusionPackSize: number;
  initialCatalogPackSize: number;
  setStep: (step: number) => void;
  updateDraft: (data: Partial<CampaignDraft>) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
  /** Pre-populate the wizard from an existing campaign object (edit mode) */
  initFromCampaign: (campaign: any) => void;
}

export const useCampaignWizard = create<WizardState>()(
  persist(
    (set) => ({
      currentStep: 0,
      draft: { ...defaultDraft },
      editingCampaignId: null,
      initialDiffusionPackSize: 0,
      initialCatalogPackSize: 0,
      setStep: (step) => set({ currentStep: step }),
      updateDraft: (data) => set((s) => ({ draft: { ...s.draft, ...data } })),
      nextStep: () => set((s) => {
        const hasAdSpot = s.draft.types.includes('AD_SPOT');
        const hasCatalog = s.draft.types.includes('CATALOG_LISTING');
        // Steps: Basics + (Media if AD_SPOT) + (Catalog if CATALOG) + Targeting + Review
        const totalSteps = 1 + (hasAdSpot ? 1 : 0) + (hasCatalog ? 1 : 0) + 2;
        const maxStep = totalSteps - 1;
        return { currentStep: Math.min(s.currentStep + 1, maxStep) };
      }),
      prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),
      reset: () => set({ currentStep: 0, draft: { ...defaultDraft }, editingCampaignId: null, initialDiffusionPackSize: 0, initialCatalogPackSize: 0 }),
      initFromCampaign: (campaign) => {
        const packs = [50, 100, 150, 200, 300] as const;
        const allCampaigns: any[] = campaign.groupCampaigns ?? [campaign];
        const adSpotCampaign = allCampaigns.find((c: any) => c.type === 'AD_SPOT');
        const catalogCampaign = allCampaigns.find((c: any) => c.type === 'CATALOG_LISTING');
        const adScreenCount = adSpotCampaign?.targeting?.includedScreens?.length ?? 0;
        const catScreenCount = catalogCampaign?.targeting?.includedScreens?.length ?? 0;
        const initDiffPack = packs.find((p) => p >= adScreenCount) ?? 0;
        const initCatPack = packs.find((p) => p >= catScreenCount) ?? 0;

        set({
          editingCampaignId: campaign.id,
          currentStep: 0,
          initialDiffusionPackSize: initDiffPack,
          initialCatalogPackSize: initCatPack,
          draft: {
            ...defaultDraft,
            name: campaign.name ?? '',
            description: campaign.description ?? '',
            objective: campaign.objective ?? '',
            category: campaign.category ?? '',
            types: campaign.allTypes
              ? (campaign.allTypes as CampaignType[])
              : campaign.type ? [campaign.type as CampaignType] : [],
            startDate: campaign.startDate
              ? new Date(campaign.startDate).toISOString().split('T')[0]
              : '',
            endDate: campaign.endDate
              ? new Date(campaign.endDate).toISOString().split('T')[0]
              : '',
            // Load creatives and screens from group campaigns (or single campaign)
            ...((() => {
              const packs = [50, 100, 150, 200, 300] as const;
              const allCampaigns: any[] = campaign.groupCampaigns ?? [campaign];
              const adSpotCampaign = allCampaigns.find((c: any) => c.type === 'AD_SPOT');
              const catalogCampaign = allCampaigns.find((c: any) => c.type === 'CATALOG_LISTING');

              const mapScreens = (screens: any[]) => screens.map((s: any) => ({
                id: s.id, name: s.name ?? '', address: s.address ?? '', city: s.city ?? '',
                latitude: 0, longitude: 0, environment: 'CINEMA_LOBBY' as any, status: 'ACTIVE' as const,
                monthlyPriceCents: 0, currency: 'EUR', partnerOrgName: '', resolution: '1920x1080', isOnline: false,
              }));

              const result: Record<string, any> = {};

              // Video creative
              const videoCreative = adSpotCampaign?.creatives?.find((c: any) => c.type === 'VIDEO');
              if (videoCreative) {
                result.mediaId = videoCreative.id;
                result.mediaFileUrl = videoCreative.fileUrl;
                result.mediaUrl = videoCreative.fileUrl;
                result.mediaThumbnail = videoCreative.fileUrl;
                result.mediaDurationMs = videoCreative.durationMs ?? 0;
                result.mediaStatus = 'ready';
              }

              // Image creative
              const imageCreative = catalogCampaign?.creatives?.find((c: any) => c.type === 'IMAGE');
              if (imageCreative) {
                result.catalogImageId = imageCreative.id;
                result.catalogImageFileUrl = imageCreative.fileUrl;
                result.catalogImageUrl = imageCreative.fileUrl;
                result.catalogImageStatus = 'ready';
              }

              // AD_SPOT screens
              if (adSpotCampaign) {
                const adScreens = adSpotCampaign.targeting?.includedScreens ?? [];
                const adPack = packs.find((p) => p === adScreens.length) ?? null;
                result.packSize = adPack;
                result.selectedScreenIds = adScreens.map((s: any) => s.id);
                result.selectedScreens = mapScreens(adScreens);
              } else {
                result.selectedScreenIds = [];
                result.selectedScreens = [];
              }

              // CATALOG screens
              if (catalogCampaign) {
                const catScreens = catalogCampaign.targeting?.includedScreens ?? [];
                const catPack = packs.find((p) => p === catScreens.length) ?? null;
                result.catalogPackSize = catPack;
                result.catalogSelectedScreenIds = catScreens.map((s: any) => s.id);
                result.catalogSelectedScreens = mapScreens(catScreens);
              }

              return result;
            })()),
          },
        });
      },
    }),
    {
      name: 'neofilm-campaign-wizard',
      version: 4,
      migrate: () => ({ currentStep: 0, draft: { ...defaultDraft }, editingCampaignId: null }),
    },
  ),
);
