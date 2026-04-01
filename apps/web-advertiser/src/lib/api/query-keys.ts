export const queryKeys = {
  campaigns: {
    all: ['campaigns'] as const,
    list: (filters?: unknown) => ['campaigns', 'list', filters] as const,
    detail: (id: string) => ['campaigns', 'detail', id] as const,
    analytics: (id: string) => ['campaigns', 'analytics', id] as const,
  },
  media: {
    all: ['media'] as const,
    list: (filters?: unknown) => ['media', 'list', filters] as const,
    detail: (id: string) => ['media', 'detail', id] as const,
    status: (id: string) => ['media', 'status', id] as const,
  },
  screens: {
    all: ['screens'] as const,
    available: (filters?: unknown) => ['screens', 'available', filters] as const,
  },
  analytics: {
    global: ['analytics', 'global'] as const,
    summary: (campaignId: string) => ['analytics', 'summary', campaignId] as const,
    timeseries: (campaignId: string, params?: unknown) =>
      ['analytics', 'timeseries', campaignId, params] as const,
    byTrigger: (campaignId: string) => ['analytics', 'by-trigger', campaignId] as const,
    byScreen: (campaignId: string) => ['analytics', 'by-screen', campaignId] as const,
  },
  billing: {
    subscription: ['billing', 'subscription'] as const,
    invoices: (filters?: unknown) => ['billing', 'invoices', filters] as const,
  },
  ai: {
    credits: ['ai', 'credits'] as const,
    job: (jobId: string) => ['ai', 'job', jobId] as const,
  },
  catalog: {
    all: ['catalog'] as const,
    list: (filters?: unknown) => ['catalog', 'list', filters] as const,
    detail: (id: string) => ['catalog', 'detail', id] as const,
  },
  conversations: {
    all: ['conversations'] as const,
    detail: (id: string) => ['conversations', 'detail', id] as const,
    unreadCount: ['conversations', 'unread-count'] as const,
  },
  canva: {
    all: ['canva'] as const,
    status: () => ['canva', 'status'] as const,
    designs: () => ['canva', 'designs'] as const,
    exportStatus: (designId: string, exportId: string) =>
      ['canva', 'export', designId, exportId] as const,
  },
} as const;
