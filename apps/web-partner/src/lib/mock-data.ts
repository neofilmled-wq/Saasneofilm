// Mock data for development before backend is ready

export interface MockSite {
  id: string;
  name: string;
  address: string;
  city: string;
  postCode: string;
  country: string;
  timezone: string;
  category: 'hotel' | 'conciergerie' | 'airbnb' | 'restaurant' | 'other';
  screenCount: number;
  createdAt: string;
}

export interface MockScreen {
  id: string;
  name: string;
  siteId: string;
  siteName: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  type: 'smartTV' | 'nonSmartTV';
  brand?: string;
  model?: string;
  resolution: string;
  orientation: 'LANDSCAPE' | 'PORTRAIT';
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
  monthlyPriceCents: number;
  currency: string;
  activeDeviceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MockDevice {
  id: string;
  serialNumber: string;
  status: 'ONLINE' | 'OFFLINE' | 'PROVISIONING' | 'ERROR' | 'DECOMMISSIONED';
  macAddress: string;
  appVersion: string;
  firmwareVersion: string;
  ipAddress: string;
  lastPingAt: string;
  pairedAt?: string;
  screenId?: string;
}

export interface MockScreenLiveStatus {
  screenId: string;
  isOnline: boolean;
  lastHeartbeatAt: string;
  appVersion: string;
  cpuPercent: number;
  memoryPercent: number;
  networkType: 'wifi' | 'ethernet';
  errorCount24h: number;
  currentCampaignId?: string;
}

export interface MockAlert {
  id: string;
  type: 'offline' | 'crash' | 'missing_media' | 'cache_failure' | 'storage_full' | 'ota_failed';
  severity: 'info' | 'warning' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved';
  screenId: string;
  screenName: string;
  deviceId?: string;
  message: string;
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  acknowledgedBy?: string;
  resolvedBy?: string;
}

export interface MockRevenueSummary {
  period: string;
  totalRevenueCents: number;
  confirmedPayoutsCents: number;
  pendingPayoutsCents: number;
  retrocessionRate: number;
  activeScreens: number;
  totalBookings: number;
}

export interface MockRevenueByScreen {
  screenId: string;
  screenName: string;
  siteName: string;
  revenueCents: number;
  retrocessionCents: number;
  bookingCount: number;
}

export interface MockRevenueBySite {
  siteId: string;
  siteName: string;
  screenCount: number;
  revenueCents: number;
  retrocessionCents: number;
}

export interface MockPayout {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';
  amountCents: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  paidAt?: string;
  stripeTransferId?: string;
  createdAt: string;
}

export interface MockUxConfig {
  screenId: string;
  catalogEnabled: boolean;
  defaultHomeSection: 'iptv' | 'streaming' | 'catalog';
  language: 'fr' | 'en';
  themeColor?: string;
  logoUrl?: string;
  adFrequencyMinutes: number;
  currentVersionOnDevice: string;
  pendingVersion?: string;
  lastPushedAt?: string;
}

export interface MockSplitScreenConfig {
  screenId: string;
  enabled: boolean;
  rightZoneWidthPercent: 25 | 30 | 35;
  adPosition: 'right';
  displayRules: {
    power_on: boolean;
    open_app: boolean;
    change_app: boolean;
    catalog_open: boolean;
  };
  adDurationSeconds: number;
}

// ========== MOCK DATA ==========

export const mockSites: MockSite[] = [
  {
    id: 'site-1',
    name: 'Hôtel Le Marais',
    address: '15 Rue des Archives',
    city: 'Paris',
    postCode: '75004',
    country: 'FR',
    timezone: 'Europe/Paris',
    category: 'hotel',
    screenCount: 3,
    createdAt: '2025-12-01T10:00:00Z',
  },
  {
    id: 'site-2',
    name: 'Conciergerie Rivoli',
    address: '42 Rue de Rivoli',
    city: 'Paris',
    postCode: '75001',
    country: 'FR',
    timezone: 'Europe/Paris',
    category: 'conciergerie',
    screenCount: 2,
    createdAt: '2025-12-15T14:00:00Z',
  },
  {
    id: 'site-3',
    name: 'Résidence Vieux-Port',
    address: '8 Quai du Port',
    city: 'Marseille',
    postCode: '13002',
    country: 'FR',
    timezone: 'Europe/Paris',
    category: 'airbnb',
    screenCount: 4,
    createdAt: '2026-01-10T09:00:00Z',
  },
];

export const mockScreens: MockScreen[] = [
  {
    id: 'screen-1',
    name: 'Lobby Principal',
    siteId: 'site-1',
    siteName: 'Hôtel Le Marais',
    address: '15 Rue des Archives, 75004 Paris',
    city: 'Paris',
    latitude: 48.8588,
    longitude: 2.3556,
    type: 'smartTV',
    brand: 'Samsung',
    model: 'QE55Q80B',
    resolution: '3840x2160',
    orientation: 'LANDSCAPE',
    status: 'ACTIVE',
    monthlyPriceCents: 5000,
    currency: 'EUR',
    activeDeviceId: 'device-1',
    createdAt: '2025-12-01T10:00:00Z',
    updatedAt: '2026-02-20T08:00:00Z',
  },
  {
    id: 'screen-2',
    name: 'Réception',
    siteId: 'site-1',
    siteName: 'Hôtel Le Marais',
    address: '15 Rue des Archives, 75004 Paris',
    city: 'Paris',
    latitude: 48.8589,
    longitude: 2.3557,
    type: 'nonSmartTV',
    brand: 'LG',
    model: '43UN73',
    resolution: '1920x1080',
    orientation: 'LANDSCAPE',
    status: 'ACTIVE',
    monthlyPriceCents: 3500,
    currency: 'EUR',
    activeDeviceId: 'device-2',
    createdAt: '2025-12-02T11:00:00Z',
    updatedAt: '2026-02-18T12:00:00Z',
  },
  {
    id: 'screen-3',
    name: 'Espace Petit-Déjeuner',
    siteId: 'site-1',
    siteName: 'Hôtel Le Marais',
    address: '15 Rue des Archives, 75004 Paris',
    city: 'Paris',
    latitude: 48.8587,
    longitude: 2.3555,
    type: 'smartTV',
    brand: 'Samsung',
    model: 'UE50AU7172',
    resolution: '3840x2160',
    orientation: 'LANDSCAPE',
    status: 'INACTIVE',
    monthlyPriceCents: 4000,
    currency: 'EUR',
    createdAt: '2025-12-10T09:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'screen-4',
    name: 'Accueil Conciergerie',
    siteId: 'site-2',
    siteName: 'Conciergerie Rivoli',
    address: '42 Rue de Rivoli, 75001 Paris',
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    type: 'nonSmartTV',
    resolution: '1920x1080',
    orientation: 'PORTRAIT',
    status: 'ACTIVE',
    monthlyPriceCents: 3000,
    currency: 'EUR',
    activeDeviceId: 'device-3',
    createdAt: '2025-12-15T14:00:00Z',
    updatedAt: '2026-02-22T16:00:00Z',
  },
  {
    id: 'screen-5',
    name: 'Salon Vieux-Port 1',
    siteId: 'site-3',
    siteName: 'Résidence Vieux-Port',
    address: '8 Quai du Port, 13002 Marseille',
    city: 'Marseille',
    latitude: 43.2951,
    longitude: 5.3737,
    type: 'smartTV',
    brand: 'Sony',
    model: 'KD-55X80K',
    resolution: '3840x2160',
    orientation: 'LANDSCAPE',
    status: 'ACTIVE',
    monthlyPriceCents: 4500,
    currency: 'EUR',
    activeDeviceId: 'device-4',
    createdAt: '2026-01-10T09:00:00Z',
    updatedAt: '2026-02-25T07:00:00Z',
  },
  {
    id: 'screen-6',
    name: 'Salon Vieux-Port 2',
    siteId: 'site-3',
    siteName: 'Résidence Vieux-Port',
    address: '8 Quai du Port, 13002 Marseille',
    city: 'Marseille',
    latitude: 43.2952,
    longitude: 5.3738,
    type: 'nonSmartTV',
    resolution: '1920x1080',
    orientation: 'LANDSCAPE',
    status: 'ACTIVE',
    monthlyPriceCents: 3000,
    currency: 'EUR',
    activeDeviceId: 'device-5',
    createdAt: '2026-01-12T10:00:00Z',
    updatedAt: '2026-02-24T09:00:00Z',
  },
  {
    id: 'screen-7',
    name: 'Piscine Vieux-Port',
    siteId: 'site-3',
    siteName: 'Résidence Vieux-Port',
    address: '8 Quai du Port, 13002 Marseille',
    city: 'Marseille',
    latitude: 43.2950,
    longitude: 5.3740,
    type: 'smartTV',
    brand: 'Samsung',
    resolution: '1920x1080',
    orientation: 'LANDSCAPE',
    status: 'MAINTENANCE',
    monthlyPriceCents: 3500,
    currency: 'EUR',
    createdAt: '2026-01-20T11:00:00Z',
    updatedAt: '2026-02-23T14:00:00Z',
  },
  {
    id: 'screen-8',
    name: 'Entrée Vieux-Port',
    siteId: 'site-3',
    siteName: 'Résidence Vieux-Port',
    address: '8 Quai du Port, 13002 Marseille',
    city: 'Marseille',
    latitude: 43.2953,
    longitude: 5.3735,
    type: 'nonSmartTV',
    resolution: '1920x1080',
    orientation: 'PORTRAIT',
    status: 'ACTIVE',
    monthlyPriceCents: 2500,
    currency: 'EUR',
    activeDeviceId: 'device-6',
    createdAt: '2026-01-25T08:00:00Z',
    updatedAt: '2026-02-25T06:00:00Z',
  },
  {
    id: 'screen-9',
    name: 'Vitrine Rivoli',
    siteId: 'site-2',
    siteName: 'Conciergerie Rivoli',
    address: '42 Rue de Rivoli, 75001 Paris',
    city: 'Paris',
    latitude: 48.8567,
    longitude: 2.3520,
    type: 'smartTV',
    brand: 'LG',
    resolution: '3840x2160',
    orientation: 'PORTRAIT',
    status: 'ACTIVE',
    monthlyPriceCents: 6000,
    currency: 'EUR',
    activeDeviceId: 'device-7',
    createdAt: '2026-01-05T13:00:00Z',
    updatedAt: '2026-02-24T11:00:00Z',
  },
];

export const mockDevices: MockDevice[] = [
  { id: 'device-1', serialNumber: 'NEO-A1B2C3', status: 'ONLINE', macAddress: 'AA:BB:CC:DD:EE:01', appVersion: '2.4.1', firmwareVersion: '1.2.0', ipAddress: '192.168.1.10', lastPingAt: '2026-02-25T08:59:00Z', pairedAt: '2025-12-01T12:00:00Z', screenId: 'screen-1' },
  { id: 'device-2', serialNumber: 'NEO-D4E5F6', status: 'ONLINE', macAddress: 'AA:BB:CC:DD:EE:02', appVersion: '2.4.1', firmwareVersion: '1.2.0', ipAddress: '192.168.1.11', lastPingAt: '2026-02-25T08:58:30Z', pairedAt: '2025-12-02T14:00:00Z', screenId: 'screen-2' },
  { id: 'device-3', serialNumber: 'NEO-G7H8I9', status: 'OFFLINE', macAddress: 'AA:BB:CC:DD:EE:03', appVersion: '2.3.0', firmwareVersion: '1.1.5', ipAddress: '192.168.2.20', lastPingAt: '2026-02-25T06:12:00Z', pairedAt: '2025-12-16T10:00:00Z', screenId: 'screen-4' },
  { id: 'device-4', serialNumber: 'NEO-J1K2L3', status: 'ONLINE', macAddress: 'AA:BB:CC:DD:EE:04', appVersion: '2.4.1', firmwareVersion: '1.2.0', ipAddress: '10.0.0.50', lastPingAt: '2026-02-25T09:00:00Z', pairedAt: '2026-01-10T11:00:00Z', screenId: 'screen-5' },
  { id: 'device-5', serialNumber: 'NEO-M4N5O6', status: 'ONLINE', macAddress: 'AA:BB:CC:DD:EE:05', appVersion: '2.4.0', firmwareVersion: '1.1.5', ipAddress: '10.0.0.51', lastPingAt: '2026-02-25T08:57:00Z', pairedAt: '2026-01-13T09:00:00Z', screenId: 'screen-6' },
  { id: 'device-6', serialNumber: 'NEO-P7Q8R9', status: 'ERROR', macAddress: 'AA:BB:CC:DD:EE:06', appVersion: '2.4.1', firmwareVersion: '1.2.0', ipAddress: '10.0.0.52', lastPingAt: '2026-02-25T08:45:00Z', pairedAt: '2026-01-26T10:00:00Z', screenId: 'screen-8' },
  { id: 'device-7', serialNumber: 'NEO-S1T2U3', status: 'ONLINE', macAddress: 'AA:BB:CC:DD:EE:07', appVersion: '2.4.1', firmwareVersion: '1.2.0', ipAddress: '192.168.2.21', lastPingAt: '2026-02-25T08:59:45Z', pairedAt: '2026-01-06T15:00:00Z', screenId: 'screen-9' },
];

export const mockLiveStatuses: MockScreenLiveStatus[] = [
  { screenId: 'screen-1', isOnline: true, lastHeartbeatAt: '2026-02-25T08:59:00Z', appVersion: '2.4.1', cpuPercent: 23, memoryPercent: 45, networkType: 'wifi', errorCount24h: 0 },
  { screenId: 'screen-2', isOnline: true, lastHeartbeatAt: '2026-02-25T08:58:30Z', appVersion: '2.4.1', cpuPercent: 18, memoryPercent: 38, networkType: 'ethernet', errorCount24h: 1 },
  { screenId: 'screen-4', isOnline: false, lastHeartbeatAt: '2026-02-25T06:12:00Z', appVersion: '2.3.0', cpuPercent: 0, memoryPercent: 0, networkType: 'wifi', errorCount24h: 5 },
  { screenId: 'screen-5', isOnline: true, lastHeartbeatAt: '2026-02-25T09:00:00Z', appVersion: '2.4.1', cpuPercent: 35, memoryPercent: 52, networkType: 'wifi', errorCount24h: 0 },
  { screenId: 'screen-6', isOnline: true, lastHeartbeatAt: '2026-02-25T08:57:00Z', appVersion: '2.4.0', cpuPercent: 42, memoryPercent: 61, networkType: 'ethernet', errorCount24h: 2 },
  { screenId: 'screen-8', isOnline: true, lastHeartbeatAt: '2026-02-25T08:45:00Z', appVersion: '2.4.1', cpuPercent: 89, memoryPercent: 78, networkType: 'wifi', errorCount24h: 12 },
  { screenId: 'screen-9', isOnline: true, lastHeartbeatAt: '2026-02-25T08:59:45Z', appVersion: '2.4.1', cpuPercent: 15, memoryPercent: 32, networkType: 'ethernet', errorCount24h: 0 },
];

export const mockAlerts: MockAlert[] = [
  { id: 'alert-1', type: 'offline', severity: 'critical', status: 'open', screenId: 'screen-4', screenName: 'Accueil Conciergerie', deviceId: 'device-3', message: 'Appareil hors ligne depuis plus de 2 heures', createdAt: '2026-02-25T06:15:00Z' },
  { id: 'alert-2', type: 'crash', severity: 'critical', status: 'open', screenId: 'screen-8', screenName: 'Entrée Vieux-Port', deviceId: 'device-6', message: 'Crash répété de l\'application (3 fois en 1h)', createdAt: '2026-02-25T08:30:00Z' },
  { id: 'alert-3', type: 'storage_full', severity: 'warning', status: 'acknowledged', screenId: 'screen-6', screenName: 'Salon Vieux-Port 2', deviceId: 'device-5', message: 'Stockage utilisé à 92%', createdAt: '2026-02-24T16:00:00Z', acknowledgedAt: '2026-02-24T17:30:00Z', acknowledgedBy: 'Jean Dupont' },
  { id: 'alert-4', type: 'ota_failed', severity: 'warning', status: 'resolved', screenId: 'screen-2', screenName: 'Réception', deviceId: 'device-2', message: 'Mise à jour OTA échouée (v2.4.1)', createdAt: '2026-02-23T10:00:00Z', acknowledgedAt: '2026-02-23T10:30:00Z', resolvedAt: '2026-02-23T14:00:00Z', acknowledgedBy: 'Marie Martin', resolvedBy: 'Marie Martin' },
  { id: 'alert-5', type: 'missing_media', severity: 'info', status: 'resolved', screenId: 'screen-5', screenName: 'Salon Vieux-Port 1', deviceId: 'device-4', message: 'Média manquant: creative-abc123', createdAt: '2026-02-22T09:00:00Z', resolvedAt: '2026-02-22T11:00:00Z', resolvedBy: 'Système' },
  { id: 'alert-6', type: 'cache_failure', severity: 'warning', status: 'open', screenId: 'screen-9', screenName: 'Vitrine Rivoli', deviceId: 'device-7', message: 'Échec de mise en cache des médias', createdAt: '2026-02-25T07:45:00Z' },
];

export const mockRevenueSummary: MockRevenueSummary = {
  period: '2026-02',
  totalRevenueCents: 285000,
  confirmedPayoutsCents: 199500,
  pendingPayoutsCents: 42750,
  retrocessionRate: 0.70,
  activeScreens: 7,
  totalBookings: 12,
};

export const mockRevenueByScreen: MockRevenueByScreen[] = [
  { screenId: 'screen-1', screenName: 'Lobby Principal', siteName: 'Hôtel Le Marais', revenueCents: 50000, retrocessionCents: 35000, bookingCount: 3 },
  { screenId: 'screen-2', screenName: 'Réception', siteName: 'Hôtel Le Marais', revenueCents: 35000, retrocessionCents: 24500, bookingCount: 2 },
  { screenId: 'screen-4', screenName: 'Accueil Conciergerie', siteName: 'Conciergerie Rivoli', revenueCents: 30000, retrocessionCents: 21000, bookingCount: 2 },
  { screenId: 'screen-5', screenName: 'Salon Vieux-Port 1', siteName: 'Résidence Vieux-Port', revenueCents: 45000, retrocessionCents: 31500, bookingCount: 2 },
  { screenId: 'screen-6', screenName: 'Salon Vieux-Port 2', siteName: 'Résidence Vieux-Port', revenueCents: 30000, retrocessionCents: 21000, bookingCount: 1 },
  { screenId: 'screen-8', screenName: 'Entrée Vieux-Port', siteName: 'Résidence Vieux-Port', revenueCents: 25000, retrocessionCents: 17500, bookingCount: 1 },
  { screenId: 'screen-9', screenName: 'Vitrine Rivoli', siteName: 'Conciergerie Rivoli', revenueCents: 70000, retrocessionCents: 49000, bookingCount: 1 },
];

export const mockRevenueBySite: MockRevenueBySite[] = [
  { siteId: 'site-1', siteName: 'Hôtel Le Marais', screenCount: 3, revenueCents: 85000, retrocessionCents: 59500 },
  { siteId: 'site-2', siteName: 'Conciergerie Rivoli', screenCount: 2, revenueCents: 100000, retrocessionCents: 70000 },
  { siteId: 'site-3', siteName: 'Résidence Vieux-Port', screenCount: 4, revenueCents: 100000, retrocessionCents: 70000 },
];

export const mockPayouts: MockPayout[] = [
  { id: 'payout-1', status: 'PAID', amountCents: 185000, currency: 'EUR', periodStart: '2026-01-01T00:00:00Z', periodEnd: '2026-01-31T23:59:59Z', paidAt: '2026-02-05T10:00:00Z', stripeTransferId: 'tr_abc123', createdAt: '2026-02-01T00:00:00Z' },
  { id: 'payout-2', status: 'PROCESSING', amountCents: 199500, currency: 'EUR', periodStart: '2026-02-01T00:00:00Z', periodEnd: '2026-02-28T23:59:59Z', createdAt: '2026-02-25T00:00:00Z' },
  { id: 'payout-3', status: 'PAID', amountCents: 162000, currency: 'EUR', periodStart: '2025-12-01T00:00:00Z', periodEnd: '2025-12-31T23:59:59Z', paidAt: '2026-01-05T10:00:00Z', stripeTransferId: 'tr_def456', createdAt: '2026-01-01T00:00:00Z' },
];

export const mockRevenueHistory = [
  { month: '2025-09', revenueCents: 95000, retrocessionCents: 66500 },
  { month: '2025-10', revenueCents: 120000, retrocessionCents: 84000 },
  { month: '2025-11', revenueCents: 148000, retrocessionCents: 103600 },
  { month: '2025-12', revenueCents: 162000, retrocessionCents: 113400 },
  { month: '2026-01', revenueCents: 210000, retrocessionCents: 147000 },
  { month: '2026-02', revenueCents: 285000, retrocessionCents: 199500 },
];
