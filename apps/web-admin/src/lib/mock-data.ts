// Dashboard stats
export interface DashboardStats {
  totalUsers: number;
  totalPartners: number;
  totalAdvertisers: number;
  activeCampaigns: number;
  totalScreens: number;
  devicesOnline: number;
  monthlyRevenue: number;
  pendingInvoices: number;
}

export const mockDashboardStats: DashboardStats = {
  totalUsers: 247,
  totalPartners: 34,
  totalAdvertisers: 89,
  activeCampaigns: 156,
  totalScreens: 412,
  devicesOnline: 387,
  monthlyRevenue: 12450000, // in cents
  pendingInvoices: 23,
};

// Users
export interface MockUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export const mockUsers: MockUser[] = [
  { id: 'usr_001', email: 'admin@neofilm.io', firstName: 'Admin', lastName: 'NeoFilm', role: 'SUPER_ADMIN', status: 'ACTIVE', createdAt: '2025-01-15', lastLoginAt: '2026-02-26' },
  { id: 'usr_002', email: 'support@neofilm.io', firstName: 'Sophie', lastName: 'Martin', role: 'SUPPORT', status: 'ACTIVE', createdAt: '2025-03-01', lastLoginAt: '2026-02-25' },
  { id: 'usr_003', email: 'jean@pathé.fr', firstName: 'Jean', lastName: 'Durand', role: 'ADMIN', status: 'ACTIVE', createdAt: '2025-06-12', lastLoginAt: '2026-02-24' },
  { id: 'usr_004', email: 'marie@ugc.fr', firstName: 'Marie', lastName: 'Bernard', role: 'ADMIN', status: 'SUSPENDED', createdAt: '2025-07-20', lastLoginAt: '2026-01-10' },
  { id: 'usr_005', email: 'pierre@gaumont.fr', firstName: 'Pierre', lastName: 'Lefebvre', role: 'SUPPORT', status: 'ACTIVE', createdAt: '2025-09-05', lastLoginAt: '2026-02-26' },
];

// Partners
export interface MockPartner {
  id: string;
  name: string;
  slug: string;
  screenCount: number;
  venueCount: number;
  status: string;
  commissionRate: number;
  monthlyRevenue: number;
  createdAt: string;
}

export const mockPartners: MockPartner[] = [
  { id: 'org_p1', name: 'Pathé Cinémas', slug: 'pathe', screenCount: 120, venueCount: 15, status: 'ACTIVE', commissionRate: 30, monthlyRevenue: 4500000, createdAt: '2025-01-20' },
  { id: 'org_p2', name: 'UGC', slug: 'ugc', screenCount: 95, venueCount: 12, status: 'ACTIVE', commissionRate: 30, monthlyRevenue: 3200000, createdAt: '2025-02-15' },
  { id: 'org_p3', name: 'Gaumont', slug: 'gaumont', screenCount: 78, venueCount: 9, status: 'ACTIVE', commissionRate: 25, monthlyRevenue: 2800000, createdAt: '2025-03-10' },
  { id: 'org_p4', name: 'CGR Cinémas', slug: 'cgr', screenCount: 56, venueCount: 8, status: 'ACTIVE', commissionRate: 30, monthlyRevenue: 1200000, createdAt: '2025-05-01' },
  { id: 'org_p5', name: 'MK2', slug: 'mk2', screenCount: 32, venueCount: 4, status: 'PENDING', commissionRate: 30, monthlyRevenue: 0, createdAt: '2026-01-15' },
];

// Advertisers
export interface MockAdvertiser {
  id: string;
  name: string;
  slug: string;
  campaignCount: number;
  totalSpent: number;
  status: string;
  createdAt: string;
}

export const mockAdvertisers: MockAdvertiser[] = [
  { id: 'org_a1', name: 'Coca-Cola France', slug: 'coca-cola', campaignCount: 12, totalSpent: 2500000, status: 'ACTIVE', createdAt: '2025-02-01' },
  { id: 'org_a2', name: 'Orange', slug: 'orange', campaignCount: 8, totalSpent: 1800000, status: 'ACTIVE', createdAt: '2025-03-15' },
  { id: 'org_a3', name: 'Renault', slug: 'renault', campaignCount: 5, totalSpent: 950000, status: 'ACTIVE', createdAt: '2025-04-20' },
  { id: 'org_a4', name: 'SNCF', slug: 'sncf', campaignCount: 3, totalSpent: 450000, status: 'ACTIVE', createdAt: '2025-06-01' },
  { id: 'org_a5', name: 'Boulangerie Dupont', slug: 'boulangerie-dupont', campaignCount: 1, totalSpent: 15000, status: 'PENDING', createdAt: '2026-02-01' },
];

// Campaigns
export interface MockCampaign {
  id: string;
  name: string;
  advertiserName: string;
  status: string;
  budgetCents: number;
  spentCents: number;
  impressions: number;
  startDate: string;
  endDate: string;
  createdAt: string;
}

export const mockCampaigns: MockCampaign[] = [
  { id: 'cmp_001', name: 'Coca-Cola Été 2026', advertiserName: 'Coca-Cola France', status: 'ACTIVE', budgetCents: 500000, spentCents: 320000, impressions: 45200, startDate: '2026-02-01', endDate: '2026-04-30', createdAt: '2026-01-15' },
  { id: 'cmp_002', name: 'Orange 5G Launch', advertiserName: 'Orange', status: 'ACTIVE', budgetCents: 300000, spentCents: 180000, impressions: 28000, startDate: '2026-02-10', endDate: '2026-03-31', createdAt: '2026-01-20' },
  { id: 'cmp_003', name: 'Renault Electrique', advertiserName: 'Renault', status: 'PENDING_REVIEW', budgetCents: 200000, spentCents: 0, impressions: 0, startDate: '2026-03-01', endDate: '2026-05-31', createdAt: '2026-02-20' },
  { id: 'cmp_004', name: 'SNCF TGV Promo', advertiserName: 'SNCF', status: 'COMPLETED', budgetCents: 150000, spentCents: 148500, impressions: 19800, startDate: '2025-12-01', endDate: '2026-01-31', createdAt: '2025-11-15' },
  { id: 'cmp_005', name: 'Boulangerie Locale', advertiserName: 'Boulangerie Dupont', status: 'DRAFT', budgetCents: 15000, spentCents: 0, impressions: 0, startDate: '2026-03-15', endDate: '2026-04-15', createdAt: '2026-02-25' },
];

// Devices
export interface MockDevice {
  id: string;
  serial: string;
  screenName: string;
  partnerName: string;
  status: string;
  appVersion: string;
  lastHeartbeat: string;
  cpuPercent: number;
  memoryPercent: number;
}

export const mockDevices: MockDevice[] = [
  { id: 'dev_001', serial: 'NF-2026-001', screenName: 'Pathé Beaugrenelle - Salle 1', partnerName: 'Pathé Cinémas', status: 'ONLINE', appVersion: '2.4.1', lastHeartbeat: '2026-02-26T10:30:00Z', cpuPercent: 23, memoryPercent: 45 },
  { id: 'dev_002', serial: 'NF-2026-002', screenName: 'Pathé Beaugrenelle - Salle 2', partnerName: 'Pathé Cinémas', status: 'ONLINE', appVersion: '2.4.1', lastHeartbeat: '2026-02-26T10:29:00Z', cpuPercent: 18, memoryPercent: 52 },
  { id: 'dev_003', serial: 'NF-2026-003', screenName: 'UGC Les Halles - Hall', partnerName: 'UGC', status: 'OFFLINE', appVersion: '2.3.0', lastHeartbeat: '2026-02-25T22:15:00Z', cpuPercent: 0, memoryPercent: 0 },
  { id: 'dev_004', serial: 'NF-2026-004', screenName: 'Gaumont Parnasse - Entrée', partnerName: 'Gaumont', status: 'ONLINE', appVersion: '2.4.1', lastHeartbeat: '2026-02-26T10:28:00Z', cpuPercent: 31, memoryPercent: 61 },
  { id: 'dev_005', serial: 'NF-2026-005', screenName: 'CGR Bordeaux - Salle 5', partnerName: 'CGR Cinémas', status: 'ERROR', appVersion: '2.2.0', lastHeartbeat: '2026-02-26T08:00:00Z', cpuPercent: 95, memoryPercent: 89 },
];

// Recent activity
export interface ActivityItem {
  id: string;
  type: 'user' | 'campaign' | 'device' | 'partner' | 'invoice';
  description: string;
  timestamp: string;
}

export const mockRecentActivity: ActivityItem[] = [
  { id: 'act_1', type: 'campaign', description: 'Campagne "Renault Electrique" soumise pour validation', timestamp: '2026-02-26T10:15:00Z' },
  { id: 'act_2', type: 'device', description: 'Appareil NF-2026-003 déconnecté (UGC Les Halles)', timestamp: '2026-02-25T22:15:00Z' },
  { id: 'act_3', type: 'partner', description: 'MK2 a rejoint la plateforme', timestamp: '2026-02-25T14:30:00Z' },
  { id: 'act_4', type: 'invoice', description: 'Facture #INV-2026-089 payée par Coca-Cola France', timestamp: '2026-02-25T11:00:00Z' },
  { id: 'act_5', type: 'user', description: 'Nouvel utilisateur Pierre Lefebvre inscrit', timestamp: '2026-02-24T16:45:00Z' },
  { id: 'act_6', type: 'campaign', description: 'Campagne "SNCF TGV Promo" terminée', timestamp: '2026-02-24T00:00:00Z' },
  { id: 'act_7', type: 'device', description: 'Appareil NF-2026-005 en erreur (CPU 95%)', timestamp: '2026-02-26T08:00:00Z' },
  { id: 'act_8', type: 'partner', description: 'CGR Cinémas : 2 nouveaux écrans ajoutés', timestamp: '2026-02-23T09:30:00Z' },
];
