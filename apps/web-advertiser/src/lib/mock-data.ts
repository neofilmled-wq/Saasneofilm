// Mock data factories for development — matches Prisma schema models

export type CampaignStatus = 'PENDING_REVIEW' | 'APPROVED' | 'ACTIVE' | 'REJECTED' | 'FINISHED';
export type CampaignType = 'AD_SPOT' | 'CATALOG_LISTING';
export type CreativeStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'REJECTED' | 'ARCHIVED';
export type ScreenEnvironment = 'CINEMA_LOBBY' | 'HOTEL_LOBBY' | 'HOTEL_ROOM' | 'RESTAURANT' | 'RETAIL' | 'OUTDOOR' | 'OTHER';
export type DiffusionTrigger = 'POWER_ON' | 'OPEN_APP' | 'CHANGE_APP' | 'CATALOG_OPEN' | 'SCHEDULED' | 'MANUAL';

export interface MockCampaign {
  id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  type: CampaignType;
  startDate: string;
  endDate: string;
  budgetCents: number;
  spentCents: number;
  currency: string;
  advertiserOrgId: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
  creatives: MockCreative[];
  impressions: number;
  screensCount: number;
}

export interface MockCreative {
  id: string;
  name: string;
  type: 'VIDEO' | 'IMAGE';
  status: CreativeStatus;
  fileUrl: string;
  thumbnailUrl: string;
  fileSizeBytes: number;
  durationMs: number;
  width: number;
  height: number;
  mimeType: string;
  campaignId: string;
  createdAt: string;
}

export interface MockScreen {
  id: string;
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  environment: ScreenEnvironment;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  monthlyPriceCents: number;
  currency: string;
  partnerOrgName: string;
  resolution: string;
  isOnline: boolean;
}

export interface MockInvoice {
  id: string;
  invoiceNumber: string;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID';
  amountDueCents: number;
  amountPaidCents: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  paidAt?: string;
  pdfUrl?: string;
  createdAt: string;
}

export interface MockAnalyticsSummary {
  totalImpressions: number;
  impressionsTrend: number; // percentage change
  activeCampaigns: number;
  screensOnline: number;
  screensTotal: number;
  deliveryHealth: number; // 0-100
  avgExposureTimeMs: number;
}

export interface MockTimeseriesPoint {
  date: string;
  impressions: number;
  screens: number;
}

export interface MockTriggerBreakdown {
  trigger: DiffusionTrigger;
  count: number;
  percentage: number;
}

export interface MockScreenPerformance {
  screenId: string;
  screenName: string;
  city: string;
  impressions: number;
  isOnline: boolean;
}

// ── Factories ──────────────────────────────────────

const CITIES = [
  { name: 'Paris', lat: 48.8566, lng: 2.3522 },
  { name: 'Lyon', lat: 45.764, lng: 4.8357 },
  { name: 'Marseille', lat: 43.2965, lng: 5.3698 },
  { name: 'Toulouse', lat: 43.6047, lng: 1.4442 },
  { name: 'Nice', lat: 43.7102, lng: 7.262 },
  { name: 'Bordeaux', lat: 44.8378, lng: -0.5792 },
  { name: 'Strasbourg', lat: 48.5734, lng: 7.7521 },
  { name: 'Lille', lat: 50.6292, lng: 3.0573 },
  { name: 'Nantes', lat: 47.2184, lng: -1.5536 },
  { name: 'Montpellier', lat: 43.6108, lng: 3.8767 },
];

const ENVIRONMENTS: ScreenEnvironment[] = ['CINEMA_LOBBY', 'HOTEL_LOBBY', 'HOTEL_ROOM', 'RESTAURANT', 'RETAIL', 'OUTDOOR'];
const PARTNER_NAMES = ['Hôtel Le Grand', 'Cinéma Rex', 'Résidence Tourisme', 'Airbnb Pro', 'Conciergerie Luxe', 'Hôtel Mercure', 'Ibis Budget'];

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function randomDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo));
  return d.toISOString();
}

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + Math.floor(Math.random() * daysAhead) + 1);
  return d.toISOString();
}

export function mockCampaigns(n = 12): MockCampaign[] {
  const statuses: CampaignStatus[] = ['PENDING_REVIEW', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'FINISHED', 'REJECTED'];
  const names = [
    'Promo été boulangerie',
    'Happy Hour restaurant',
    'Nouveau menu saison',
    'Grand Opening boutique',
    'Soldes d\'hiver',
    'Carte fidélité lancement',
    'Brunch du dimanche',
    'Soirée dégustation',
    'Offre spéciale touristes',
    'Atelier cuisine enfants',
    'Festival des saveurs',
    'Livraison gratuite weekend',
  ];

  return Array.from({ length: n }, (_, i) => {
    const status = statuses[i % statuses.length];
    const impressions = status === 'ACTIVE' ? Math.floor(Math.random() * 15000) + 500 : status === 'FINISHED' ? Math.floor(Math.random() * 50000) + 5000 : 0;
    return {
      id: randomId('cmp'),
      name: names[i % names.length],
      description: `Campagne publicitaire pour ${names[i % names.length].toLowerCase()}`,
      status,
      type: i % 5 === 0 ? 'CATALOG_LISTING' : 'AD_SPOT',
      startDate: randomDate(30),
      endDate: futureDate(60),
      budgetCents: (Math.floor(Math.random() * 10) + 1) * 5000,
      spentCents: Math.floor(Math.random() * 3000),
      currency: 'EUR',
      advertiserOrgId: 'org_mock_adv_001',
      reviewNotes: status === 'REJECTED' ? 'La vidéo contient du contenu non conforme. Veuillez la modifier.' : undefined,
      createdAt: randomDate(60),
      updatedAt: randomDate(5),
      creatives: mockCreatives(Math.floor(Math.random() * 3) + 1, randomId('cmp')),
      impressions,
      screensCount: Math.floor(Math.random() * 200) + 10,
    };
  });
}

export function mockCreatives(n = 3, campaignId = 'cmp_001'): MockCreative[] {
  return Array.from({ length: n }, (_, i) => ({
    id: randomId('crv'),
    name: `Video_spot_${i + 1}.mp4`,
    type: 'VIDEO' as const,
    status: i === 0 ? 'READY' : i === 1 ? 'PROCESSING' : 'READY',
    fileUrl: `https://storage.neofilm.io/media/video_${i + 1}.mp4`,
    thumbnailUrl: `https://picsum.photos/seed/${i + 100}/320/180`,
    fileSizeBytes: Math.floor(Math.random() * 50_000_000) + 5_000_000,
    durationMs: (Math.floor(Math.random() * 16) + 15) * 1000, // 15-30s
    width: 1920,
    height: 1080,
    mimeType: 'video/mp4',
    campaignId,
    createdAt: randomDate(30),
  }));
}

export function mockScreens(n = 200): MockScreen[] {
  return Array.from({ length: n }, (_, i) => {
    const city = CITIES[i % CITIES.length];
    return {
      id: randomId('scr'),
      name: `Écran ${city.name} #${i + 1}`,
      address: `${Math.floor(Math.random() * 200) + 1} rue de la Paix`,
      city: city.name,
      latitude: city.lat + (Math.random() - 0.5) * 0.1,
      longitude: city.lng + (Math.random() - 0.5) * 0.1,
      environment: ENVIRONMENTS[i % ENVIRONMENTS.length],
      status: Math.random() > 0.1 ? 'ACTIVE' : 'MAINTENANCE',
      monthlyPriceCents: [1500, 2000, 2500, 3000, 5000][i % 5],
      currency: 'EUR',
      partnerOrgName: PARTNER_NAMES[i % PARTNER_NAMES.length],
      resolution: '1920x1080',
      isOnline: Math.random() > 0.15,
    };
  });
}

export function mockInvoices(n = 8): MockInvoice[] {
  return Array.from({ length: n }, (_, i) => {
    const status = i < 4 ? 'PAID' : i < 6 ? 'OPEN' : 'DRAFT';
    return {
      id: randomId('inv'),
      invoiceNumber: `NF-2026-${String(i + 1).padStart(4, '0')}`,
      status: status as MockInvoice['status'],
      amountDueCents: (Math.floor(Math.random() * 20) + 5) * 5000,
      amountPaidCents: status === 'PAID' ? (Math.floor(Math.random() * 20) + 5) * 5000 : 0,
      currency: 'EUR',
      periodStart: randomDate(60),
      periodEnd: randomDate(30),
      dueDate: futureDate(15),
      paidAt: status === 'PAID' ? randomDate(10) : undefined,
      pdfUrl: status === 'PAID' ? `https://invoices.neofilm.io/NF-2026-${String(i + 1).padStart(4, '0')}.pdf` : undefined,
      createdAt: randomDate(60),
    };
  });
}

export function mockAnalyticsSummary(): MockAnalyticsSummary {
  return {
    totalImpressions: 45_832,
    impressionsTrend: 12.5,
    activeCampaigns: 4,
    screensOnline: 142,
    screensTotal: 158,
    deliveryHealth: 89,
    avgExposureTimeMs: 22_000,
  };
}

export function mockTimeseries(days = 30): MockTimeseriesPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - i - 1));
    return {
      date: d.toISOString().split('T')[0],
      impressions: Math.floor(Math.random() * 2000) + 800,
      screens: Math.floor(Math.random() * 20) + 120,
    };
  });
}

export function mockTriggerBreakdown(): MockTriggerBreakdown[] {
  const data: MockTriggerBreakdown[] = [
    { trigger: 'POWER_ON', count: 12340, percentage: 35 },
    { trigger: 'OPEN_APP', count: 8920, percentage: 25 },
    { trigger: 'CHANGE_APP', count: 7100, percentage: 20 },
    { trigger: 'CATALOG_OPEN', count: 4260, percentage: 12 },
    { trigger: 'SCHEDULED', count: 2840, percentage: 8 },
  ];
  return data;
}

export function mockScreenPerformance(n = 10): MockScreenPerformance[] {
  return Array.from({ length: n }, (_, i) => {
    const city = CITIES[i % CITIES.length];
    return {
      screenId: randomId('scr'),
      screenName: `Écran ${city.name} Premium #${i + 1}`,
      city: city.name,
      impressions: Math.floor(Math.random() * 5000) + 500,
      isOnline: Math.random() > 0.1,
    };
  });
}

// Singleton caches for consistent data across renders
let _campaigns: MockCampaign[] | null = null;
let _screens: MockScreen[] | null = null;
let _invoices: MockInvoice[] | null = null;

export function getCachedCampaigns() {
  if (!_campaigns) _campaigns = mockCampaigns();
  return _campaigns;
}
export function getCachedScreens() {
  if (!_screens) _screens = mockScreens();
  return _screens;
}
export function getCachedInvoices() {
  if (!_invoices) _invoices = mockInvoices();
  return _invoices;
}
