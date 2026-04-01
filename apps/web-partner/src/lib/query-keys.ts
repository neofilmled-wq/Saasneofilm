export const queryKeys = {
  sites: {
    all: ['sites'] as const,
    list: (orgId: string) => ['sites', 'list', orgId] as const,
    detail: (id: string) => ['sites', 'detail', id] as const,
  },
  screens: {
    all: ['screens'] as const,
    list: (filters?: Record<string, unknown>) => ['screens', 'list', filters] as const,
    detail: (id: string) => ['screens', 'detail', id] as const,
    liveStatus: (id: string) => ['screens', 'liveStatus', id] as const,
    uxConfig: (id: string) => ['screens', 'uxConfig', id] as const,
    allLiveStatuses: () => ['screens', 'liveStatuses'] as const,
    statusSummary: (orgId: string) => ['screens', 'statusSummary', orgId] as const,
    ranking: (orgId: string) => ['screens', 'ranking', orgId] as const,
    partnerMap: (orgId: string) => ['screens', 'partnerMap', orgId] as const,
  },
  devices: {
    status: (id: string) => ['devices', 'status', id] as const,
  },
  pairing: {
    all: ['pairing'] as const,
    requests: (filters?: Record<string, unknown>) => ['pairing', 'requests', filters] as const,
  },
  alerts: {
    all: ['alerts'] as const,
    list: (filters?: Record<string, unknown>) => ['alerts', 'list', filters] as const,
    count: () => ['alerts', 'count'] as const,
  },
  revenue: {
    summary: (period: string) => ['revenue', 'summary', period] as const,
    byScreen: (period: string) => ['revenue', 'byScreen', period] as const,
    bySite: (period: string) => ['revenue', 'bySite', period] as const,
  },
  payouts: {
    all: ['payouts'] as const,
    list: (period?: string) => ['payouts', 'list', period] as const,
    detail: (id: string) => ['payouts', 'detail', id] as const,
  },
  commissions: {
    all: ['commissions'] as const,
    wallet: (orgId: string) => ['commissions', 'wallet', orgId] as const,
    statements: (orgId: string, month?: string) => ['commissions', 'statements', orgId, month] as const,
    statement: (id: string) => ['commissions', 'statement', id] as const,
  },
  partnerProfile: {
    detail: (orgId: string) => ['partnerProfile', orgId] as const,
  },
  team: {
    list: (orgId: string) => ['team', 'list', orgId] as const,
  },
  conversations: {
    all: ['conversations'] as const,
    detail: (id: string) => ['conversations', 'detail', id] as const,
    unreadCount: ['conversations', 'unread-count'] as const,
  },
} as const;
