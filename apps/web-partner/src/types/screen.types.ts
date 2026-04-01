export interface ScreenLiveStatus {
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

export interface ScreenWithStatus {
  id: string;
  name: string;
  siteId: string;
  siteName: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
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
  liveStatus?: ScreenLiveStatus;
  healthScore?: number;
}

export interface ScreenFilters {
  siteId?: string;
  partnerOrgId?: string;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export type ScreenFormValues = {
  name: string;
  siteId: string;
  address: string;
  city: string;
  latitude?: number;
  longitude?: number;
  type: 'smartTV' | 'nonSmartTV';
  brand?: string;
  model?: string;
  resolution: string;
  orientation: 'LANDSCAPE' | 'PORTRAIT';
  monthlyPriceCents: number;
};
