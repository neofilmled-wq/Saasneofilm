import { apiFetch } from './api';

// ─── Types ───────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  platformRole: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: 'PARTNER' | 'ADVERTISER';
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  city: string | null;
  postCode: string | null;
  country: string;
  commissionRate: number | null;
  vatNumber: string | null;
  isActive: boolean;
  stripeConnectAccountId: string | null;
  stripeCustomerId: string | null;
  createdAt: string;
  _count?: {
    screens?: number;
    memberships?: number;
    campaigns?: number;
  };
  memberships?: Array<{
    id: string;
    role: string;
    user: { id: string; email: string; firstName: string; lastName: string };
  }>;
  screens?: Screen[];
}

export interface Screen {
  id: string;
  name: string;
  externalRef: string | null;
  address: string | null;
  city: string | null;
  postCode: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  environment: string;
  resolution: string | null;
  orientation: string;
  status: string;
  monthlyPriceCents: number;
  currency: string;
  partnerOrgId: string;
  partnerOrg?: { name: string };
  screenLiveStatus?: {
    isOnline: boolean;
    lastHeartbeatAt: string | null;
    cpuPercent: number | null;
    memoryPercent: number | null;
    currentCampaignId: string | null;
    appVersion: string | null;
    errorCount24h: number;
  } | null;
  devices?: Array<{
    id: string;
    serialNumber: string;
    status: string;
    appVersion: string;
    lastPingAt: string;
  }>;
  activeDeviceId: string | null;
  createdAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  type: string;
  startDate: string;
  endDate: string;
  budgetCents: number;
  spentCents: number;
  currency: string;
  advertiserOrgId: string;
  advertiserOrg?: { name: string } & Partial<Organization>;
  creatives?: Creative[];
  targeting?: CampaignTargeting | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  _count?: { creatives?: number };
}

export interface Creative {
  id: string;
  name: string;
  type: string;
  status: string;
  fileUrl: string;
  fileSizeBytes: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  isApproved: boolean;
  campaignId: string;
  moderationStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'FLAGGED';
  moderationReason: string | null;
  moderatedBy: string | null;
  moderatedAt: string | null;
  campaign?: {
    id: string;
    name: string;
    advertiserOrg?: { id: string; name: string };
  };
  createdAt?: string;
}

export interface CampaignTargeting {
  id: string;
  cities: string[];
  environments: string[];
  geoRadiusKm: number | null;
  geoLatitude: number | null;
  geoLongitude: number | null;
  scheduleWindows: any;
}

export interface Invoice {
  id: string;
  stripeInvoiceId: string | null;
  amountCents: number;
  amountPaidCents: number | null;
  status: string;
  currency: string;
  dueDate: string | null;
  paidAt: string | null;
  organizationId: string;
  organization?: { name: string; type: string };
  customer?: any;
  payments?: any[];
  createdAt: string;
}

export interface ScheduleBlackout {
  id: string;
  name: string;
  reason: string | null;
  startAt: string;
  endAt: string;
  screenId: string | null;
  screen?: { id: string; name: string } | null;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
}

export interface AnalyticsData {
  totalEvents: number;
  impressions: number;
  dailyEvents: Array<{ date: string; count: number }>;
  totalRevenueCents: number;
  topCampaigns: Array<{
    id: string;
    name: string;
    budgetCents: number;
    spentCents: number;
    advertiserOrg: { name: string };
  }>;
}

export interface FinanceKPIs {
  range: string;
  grossRevenueCents: number;
  netRevenueCents: number;
  monthlyActiveRevenueCents: number;
  partnerPayoutsCents: number;
  pendingPartnerPayoutsCents: number;
  invoiceCount: number;
  avgBasketCents: number;
  avgScreensPerAdvertiser: number;
  subscriptionBreakdown: { short: number; long: number };
  revenueDeltaPct: number;
}

export interface NetworkKPIs {
  range: string;
  totalPartners: number;
  totalAdvertisers: number;
  activeAdvertisers: number;
  screensTotal: number;
  screensConnected: number;
  screensMaintenance: number;
  screensOffline: number;
  activeCampaigns: number;
  activeCampaignsPeriod: number;
  campaignsPendingModeration: number;
  totalDiffusionMinutes: number;
  totalDiffusionCount: number;
}

export interface AdminPartner {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  city: string | null;
  commissionRate: number | null;
  createdAt: string;
  isVerified: boolean;
  isSuspended: boolean;
  screensTotal: number;
  screensConnected: number;
  screensMaintenance: number;
  upcomingCommissionCents: number;
  paidCommissionCents: number;
  memberCount: number;
}

export interface AdminScreen {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  status: string;
  maintenanceMode: boolean;
  monthlyPriceCents: number;
  currency: string;
  isOnline: boolean;
  lastHeartbeatAt: string | null;
  cpuPercent: number | null;
  memoryPercent: number | null;
  appVersion: string | null;
  activeAdsCount: number;
  capacityMax: number;
  tvConfig: { enabledModules: string[]; defaultTab: string } | null;
  createdAt: string;
}

export interface ScreenTvConfig {
  screenId: string;
  screenName: string;
  city: string | null;
  tvConfig: {
    enabledModules: string[];
    defaultTab: string;
    welcomeMessage: string | null;
    tickerText: string | null;
  } | null;
  tvMacro: {
    spotDuration15s: number;
    spotDuration30s: number;
    splitRatio: number;
    adRotationMs: number;
  } | null;
}

export interface TvConfigUpdate {
  enabledModules: string[];
  defaultTab: string;
  welcomeMessage: string;
  tickerText: string;
  splitRatio: number;
}

export interface AdminPartnerUpdate {
  name: string;
  contactEmail: string;
  city: string;
  address: string;
  commissionRate: number;
  isSuspended: boolean;
  suspensionReason: string;
  isVerified: boolean;
  kbisUrl: string;
  directorFullName: string;
  directorIdCardUrl: string;
  siretNumber: string;
}

export interface RevenueForecast {
  daily: number;
  monthly: number;
  quarterly: number;
  semiAnnual: number;
  annual: number;
  monthlyTrend: Array<{ month: string; amount: number }>;
  activeSubscriptions: number;
  newSubscriptionsThisMonth: number;
}

export interface PackSalesBreakdown {
  packs: Array<{
    label: string;
    productScope: 'DIFFUSION' | 'CATALOGUE' | 'BOTH';
    tvCount: number;
    count: number;
    revenueCents: number;
    percentage: number;
  }>;
  totalBookings: number;
}

export interface NetProfitSummary {
  monthly: { gross: number; retrocessions: number; net: number; period: string };
  quarterly: { gross: number; retrocessions: number; net: number; period: string };
  annual: { gross: number; retrocessions: number; net: number; period: string };
  retrocessionRate: number;
}

export interface AdminPartnerDetail extends Organization {
  screens: (Screen & {
    screenLiveStatus: NonNullable<Screen['screenLiveStatus']> | null;
    tvConfig: { enabledModules: string[]; defaultTab: string } | null;
    _count: { bookingScreens: number };
  })[];
  partnerProfile: {
    id: string;
    companyName: string | null;
    logoUrl: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    address: string | null;
    city: string | null;
    postCode: string | null;
    country: string;
    isVerified: boolean;
    verifiedAt: string | null;
    isSuspended: boolean;
    suspendedAt: string | null;
    suspensionReason: string | null;
    kbisUrl: string | null;
    directorFullName: string | null;
    directorIdCardUrl: string | null;
    siretNumber: string | null;
  } | null;
  revenueShares: Array<{
    id: string;
    status: string;
    periodStart: string;
    periodEnd: string;
    totalRevenueCents: number;
    partnerShareCents: number;
    platformShareCents: number;
    platformRate: number;
    payout: { id: string; status: string; paidAt: string | null } | null;
  }>;
  payouts: Array<{
    id: string;
    status: string;
    amountCents: number;
    currency: string;
    paidAt: string | null;
  }>;
  metrics: {
    screensTotal: number;
    screensConnected: number;
    screensMaintenance: number;
    screensOffline: number;
    screensWithCampaign: number;
    upcomingCommissionCents: number;
    paidCommissionCents: number;
    memberCount: number;
  };
}

// ─── API Functions ───────────────────────────────────────

// Users
export const adminApi = {
  // Users
  getUsers: (params?: { q?: string; page?: number; limit?: number; platformRole?: string; isActive?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set('q', params.q);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.platformRole) searchParams.set('platformRole', params.platformRole);
    if (params?.isActive) searchParams.set('isActive', params.isActive);
    return apiFetch<{ data: PaginatedResponse<AdminUser> }>(`/admin/users?${searchParams}`);
  },

  createUser: (data: {
    email: string;
    firstName: string;
    lastName: string;
    platformRole: string;
    isActive?: boolean;
    password?: string;
    autoGeneratePassword?: boolean;
  }) => apiFetch<{ data: AdminUser & { temporaryPassword?: string } }>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  resetPassword: (userId: string) =>
    apiFetch<{ data: { temporaryPassword: string } }>(`/admin/users/${userId}/reset-password`, { method: 'POST' }),

  suspendUser: (userId: string) =>
    apiFetch<{ data: AdminUser }>(`/admin/users/${userId}/suspend`, { method: 'POST' }),

  activateUser: (userId: string) =>
    apiFetch<{ data: AdminUser }>(`/admin/users/${userId}/activate`, { method: 'POST' }),

  deleteUser: (userId: string) =>
    apiFetch<{ data: AdminUser }>(`/admin/users/${userId}`, { method: 'DELETE' }),

  // Organizations (partners + advertisers)
  getOrganizations: (params?: { page?: number; limit?: number; type?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.type) searchParams.set('type', params.type);
    return apiFetch<{ data: PaginatedResponse<Organization> }>(`/organizations?${searchParams}`);
  },

  getOrganization: (id: string) =>
    apiFetch<{ data: Organization }>(`/organizations/${id}`),

  createOrganization: (data: Partial<Organization> & { ownerFirstName?: string; ownerLastName?: string }) =>
    apiFetch<{ data: Organization & { owner?: { id: string; email: string }; temporaryPassword?: string } }>('/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateOrganization: (id: string, data: Partial<Organization>) =>
    apiFetch<{ data: Organization }>(`/organizations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteOrganization: (id: string) =>
    apiFetch(`/organizations/${id}`, { method: 'DELETE' }),

  // Screens
  getScreens: (params?: { page?: number; limit?: number; status?: string; partnerOrgId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.partnerOrgId) searchParams.set('partnerOrgId', params.partnerOrgId);
    return apiFetch<{ data: PaginatedResponse<Screen> }>(`/screens?${searchParams}`);
  },

  getScreen: (id: string) =>
    apiFetch<{ data: Screen }>(`/screens/${id}`),

  updateScreen: (id: string, data: Partial<Screen>) =>
    apiFetch<{ data: Screen }>(`/screens/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getAllScreensWithStatus: () =>
    apiFetch<{ data: { data: Screen[] } }>('/dashboard/screens'),

  // Campaigns
  getCampaigns: (params?: { page?: number; limit?: number; status?: string; advertiserOrgId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.advertiserOrgId) searchParams.set('advertiserOrgId', params.advertiserOrgId);
    return apiFetch<{ data: PaginatedResponse<Campaign> }>(`/campaigns?${searchParams}`);
  },

  getCampaign: (id: string) =>
    apiFetch<{ data: Campaign }>(`/campaigns/${id}`),

  updateCampaignStatus: (id: string, status: string) =>
    apiFetch(`/campaigns/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  approveCampaign: (id: string, notes?: string) =>
    apiFetch(`/admin/campaigns/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  rejectCampaign: (id: string, reason: string) =>
    apiFetch(`/admin/campaigns/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Invoices
  getInvoices: (params?: { page?: number; limit?: number; status?: string; organizationId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.organizationId) searchParams.set('organizationId', params.organizationId);
    return apiFetch<{ data: PaginatedResponse<Invoice> }>(`/invoices?${searchParams}`);
  },

  getInvoice: (id: string) =>
    apiFetch<{ data: Invoice }>(`/invoices/${id}`),

  updateInvoiceStatus: (id: string, status: string) =>
    apiFetch(`/invoices/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  exportInvoicesCsv: (status?: string) => {
    const params = status ? `?status=${status}` : '';
    return `/admin/invoices/export${params}`;
  },

  // Settings
  getSettings: () =>
    apiFetch<{ data: Record<string, string> }>('/admin/settings'),

  updateSettings: (data: Record<string, string>) =>
    apiFetch<{ data: Record<string, string> }>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Blackouts
  getBlackouts: (params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    return apiFetch<{ data: PaginatedResponse<ScheduleBlackout> }>(`/admin/blackouts?${searchParams}`);
  },

  createBlackout: (data: { name: string; reason?: string; startAt: string; endAt: string; screenId?: string }) =>
    apiFetch<{ data: ScheduleBlackout }>('/admin/blackouts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteBlackout: (id: string) =>
    apiFetch(`/admin/blackouts/${id}`, { method: 'DELETE' }),

  // Analytics
  getAnalytics: (params?: { startDate?: string; endDate?: string; partnerOrgId?: string; advertiserOrgId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.partnerOrgId) searchParams.set('partnerOrgId', params.partnerOrgId);
    if (params?.advertiserOrgId) searchParams.set('advertiserOrgId', params.advertiserOrgId);
    return apiFetch<{ data: AnalyticsData }>(`/admin/analytics?${searchParams}`);
  },

  // Dashboard
  getDashboardSummary: () => apiFetch<{ data: any }>('/dashboard/summary'),
  getPartners: () => apiFetch<{ data: { data: Organization[] } }>('/dashboard/partners'),
  getAdvertisers: () => apiFetch<{ data: { data: Organization[] } }>('/dashboard/advertisers'),

  // Schedules
  getSchedules: (params?: { page?: number; limit?: number; screenId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.screenId) searchParams.set('screenId', params.screenId);
    return apiFetch<{ data: any }>(`/schedules?${searchParams}`);
  },

  // Users (using existing endpoint for user details)
  getUser: (id: string) => apiFetch<{ data: AdminUser }>(`/users/${id}`),
  updateUser: (id: string, data: Partial<AdminUser>) =>
    apiFetch<{ data: AdminUser }>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Admin screens (with extended filters)
  getAdminScreens: (params?: { status?: string; partnerOrgId?: string; city?: string; online?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.partnerOrgId) searchParams.set('partnerOrgId', params.partnerOrgId);
    if (params?.city) searchParams.set('city', params.city);
    if (params?.online) searchParams.set('online', params.online);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    return apiFetch<{ data: PaginatedResponse<Screen> }>(`/admin/screens?${searchParams}`);
  },

  updateAdminScreen: (id: string, data: any) =>
    apiFetch<{ data: Screen }>(`/admin/screens/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  bulkApproveScreens: (ids: string[]) =>
    apiFetch<{ data: { approved: number } }>('/admin/screens/bulk-approve', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkRejectScreens: (ids: string[], reason: string) =>
    apiFetch<{ data: { rejected: number } }>('/admin/screens/bulk-reject', {
      method: 'POST',
      body: JSON.stringify({ ids, reason }),
    }),

  // Moderation (Creatives/Videos)
  getModerationQueue: (params?: { status?: string; search?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    return apiFetch<{ data: PaginatedResponse<Creative> }>(`/admin/moderation/videos?${searchParams}`);
  },

  approveCreative: (id: string) =>
    apiFetch(`/admin/moderation/videos/${id}/approve`, { method: 'PATCH' }),

  rejectCreative: (id: string, reason: string) =>
    apiFetch(`/admin/moderation/videos/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),

  flagCreative: (id: string, reason?: string) =>
    apiFetch(`/admin/moderation/videos/${id}/flag`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),

  unflagCreative: (id: string) =>
    apiFetch(`/admin/moderation/videos/${id}/unflag`, { method: 'PATCH' }),

  bulkModerateCreatives: (ids: string[], action: 'approve' | 'reject', reason?: string) =>
    apiFetch(`/admin/moderation/videos/bulk`, {
      method: 'POST',
      body: JSON.stringify({ ids, action, reason }),
    }),

  // Membership
  addMember: (orgId: string, userId: string, role?: string) =>
    apiFetch(`/admin/orgs/${orgId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    }),

  // Enhanced Admin Dashboard
  getAdminDashboardSummary: () => apiFetch<{ data: any }>('/admin/dashboard/summary'),
  getAdminActivity: (limit?: number) =>
    apiFetch<{ data: any[] }>(`/admin/dashboard/activity${limit ? `?limit=${limit}` : ''}`),

  // Finance KPIs
  getFinanceKPIs: (range: string = 'month') =>
    apiFetch<{ data: FinanceKPIs }>(`/admin/dashboard/finance?range=${range}`),

  // Network KPIs
  getNetworkKPIs: (range: string = 'month') =>
    apiFetch<{ data: NetworkKPIs }>(`/admin/dashboard/network?range=${range}`),

  // Admin Partners (enhanced)
  getAdminPartners: (params?: { q?: string; status?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set('q', params.q);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    return apiFetch<{ data: PaginatedResponse<AdminPartner> }>(`/admin/partners?${searchParams}`);
  },

  getAdminPartnerDetail: (id: string) =>
    apiFetch<{ data: AdminPartnerDetail }>(`/admin/partners/${id}`),

  updateAdminPartner: (id: string, data: Partial<AdminPartnerUpdate>) =>
    apiFetch<{ data: Organization }>(`/admin/partners/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  resetPartnerPassword: (id: string) =>
    apiFetch<{ data: { userId: string; email: string; firstName: string; temporaryPassword: string } }>(
      `/admin/partners/${id}/reset-password`,
      { method: 'POST' },
    ),

  getPartnerScreensAdmin: (id: string, params?: { status?: string; online?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.online) searchParams.set('online', params.online);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    return apiFetch<{ data: PaginatedResponse<AdminScreen> }>(`/admin/partners/${id}/screens?${searchParams}`);
  },

  getPartnerTvConfig: (id: string) =>
    apiFetch<{ data: ScreenTvConfig[] }>(`/admin/partners/${id}/tv-config`),

  updateScreenTvConfig: (partnerId: string, screenId: string, data: Partial<TvConfigUpdate>) =>
    apiFetch<{ data: any }>(`/admin/partners/${partnerId}/screens/${screenId}/tv-config`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Revenue forecast (projected CA by period based on active subscriptions)
  getRevenueForecast: () =>
    apiFetch<{ data: RevenueForecast }>('/admin/dashboard/revenue-forecast'),

  // Pack sales breakdown (which packs sell best)
  getPackSalesBreakdown: () =>
    apiFetch<{ data: PackSalesBreakdown }>('/admin/dashboard/pack-sales'),

  // Net profit after retrocessions (monthly, quarterly, yearly)
  getNetProfitSummary: () =>
    apiFetch<{ data: NetProfitSummary }>('/admin/dashboard/net-profit'),

  // Screens for map display (lightweight: id, lat, lng, status)
  getScreensForMap: () =>
    apiFetch<{ data: Screen[] }>('/screens/map'),

  // Retrocessions overview
  getRetrocessions: (params?: { month?: string; partnerOrgId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.month) searchParams.set('month', params.month);
    if (params?.partnerOrgId) searchParams.set('partnerOrgId', params.partnerOrgId);
    return apiFetch<{ data: any }>(`/admin/commissions/retrocessions?${searchParams}`);
  },

  // ── Campaign Management (admin creates for advertiser) ──────

  createCampaignForAdvertiser: (data: {
    advertiserOrgId: string;
    name: string;
    description?: string;
    type?: string;
    startDate: string;
    endDate: string;
    budgetCents: number;
    selectedScreenIds?: string[];
  }) => apiFetch<{ data: Campaign }>('/admin/campaigns', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  updateCampaignFromAdmin: (id: string, data: Partial<Campaign>) =>
    apiFetch<{ data: Campaign }>(`/admin/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteCampaignFromAdmin: (id: string) =>
    apiFetch(`/admin/campaigns/${id}`, { method: 'DELETE' }),

  // ── Screen Management (admin creates for partner) ───────────

  createScreenForPartner: (data: {
    partnerOrgId: string;
    name: string;
    address?: string;
    city?: string;
    postCode?: string;
    environment?: string;
    screenType?: string;
    resolution?: string;
    orientation?: string;
    monthlyPriceCents?: number;
    latitude?: number;
    longitude?: number;
    venueId?: string;
    siteId?: string;
  }) => apiFetch<{ data: Screen }>('/admin/screens', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  deleteScreenFromAdmin: (id: string) =>
    apiFetch(`/admin/screens/${id}`, { method: 'DELETE' }),

  generateScreenPairing: (screenId: string) =>
    apiFetch<{ data: { pin: string; expiresAt: string; pairingRequestId: string } }>(
      `/admin/screens/${screenId}/pairing`,
      { method: 'POST' },
    ),

  // ── Venue / Site Management ─────────────────────────────────

  getPartnerVenues: (partnerOrgId: string) =>
    apiFetch<{ data: any[] }>(`/admin/partners/${partnerOrgId}/venues`),

  createVenueForPartner: (partnerOrgId: string, data: { name: string; category?: string; address?: string; city?: string; postCode?: string }) =>
    apiFetch<{ data: any }>(`/admin/partners/${partnerOrgId}/venues`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateVenue: (venueId: string, data: any) =>
    apiFetch<{ data: any }>(`/admin/venues/${venueId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteVenue: (venueId: string) =>
    apiFetch(`/admin/venues/${venueId}`, { method: 'DELETE' }),

  // ── Member Management ───────────────────────────────────────

  removeMember: (orgId: string, membershipId: string) =>
    apiFetch(`/admin/orgs/${orgId}/members/${membershipId}`, { method: 'DELETE' }),

  updateMemberRole: (orgId: string, membershipId: string, role: string) =>
    apiFetch(`/admin/orgs/${orgId}/members/${membershipId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
};
