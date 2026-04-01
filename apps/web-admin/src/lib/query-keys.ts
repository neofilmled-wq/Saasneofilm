export const queryKeys = {
  users: {
    all: ['users'] as const,
    list: (filters?: Record<string, unknown>) => ['users', 'list', filters] as const,
    detail: (id: string) => ['users', id] as const,
  },
  partners: {
    all: ['partners'] as const,
    list: (filters?: Record<string, unknown>) => ['partners', 'list', filters] as const,
    detail: (id: string) => ['partners', id] as const,
  },
  advertisers: {
    all: ['advertisers'] as const,
    list: (filters?: Record<string, unknown>) => ['advertisers', 'list', filters] as const,
    detail: (id: string) => ['advertisers', id] as const,
  },
  campaigns: {
    all: ['campaigns'] as const,
    list: (filters?: Record<string, unknown>) => ['campaigns', 'list', filters] as const,
    detail: (id: string) => ['campaigns', id] as const,
  },
  devices: {
    all: ['devices'] as const,
    list: (filters?: Record<string, unknown>) => ['devices', 'list', filters] as const,
    detail: (id: string) => ['devices', id] as const,
  },
  screens: {
    all: ['screens'] as const,
    list: (filters?: Record<string, unknown>) => ['screens', 'list', filters] as const,
    detail: (id: string) => ['screens', id] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    list: (filters?: Record<string, unknown>) => ['invoices', 'list', filters] as const,
    detail: (id: string) => ['invoices', id] as const,
  },
  analytics: {
    overview: ['analytics', 'overview'] as const,
    revenue: (period: string) => ['analytics', 'revenue', period] as const,
    platform: ['analytics', 'platform'] as const,
  },
  dashboard: {
    stats: ['dashboard', 'stats'] as const,
    recentActivity: ['dashboard', 'recent-activity'] as const,
  },
  conversations: {
    all: ['conversations'] as const,
    list: (filters?: Record<string, unknown>) => ['conversations', 'list', filters] as const,
    detail: (id: string) => ['conversations', 'detail', id] as const,
    unreadCount: ['conversations', 'unread-count'] as const,
  },
} as const;
