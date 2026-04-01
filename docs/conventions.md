# docs/conventions.md — Code Conventions

> Patterns, naming rules, and anti-patterns for the NeoFilm SaaS monorepo.
> Read this before adding any new feature.

---

## API Response Envelope (CRITICAL)

Every NestJS endpoint response is wrapped by `TransformInterceptor`:

```json
{
  "data": <service return value>,
  "statusCode": 200,
  "timestamp": "2026-03-02T10:00:00.000Z"
}
```

**File:** `packages/api/src/common/interceptors/transform.interceptor.ts`

### Frontend `apiFetch` Auto-Unwrap

Each app has `src/lib/api.ts` with an `apiFetch` function that **auto-detects and unwraps** the envelope:

```typescript
// If response has { data, statusCode, timestamp } shape → return response.data
// Otherwise → return response as-is

const result = await apiFetch('/campaigns?advertiserOrgId=...');
// result = { data: Campaign[], total: 45, page: 1 }  ← already unwrapped

const screens = await apiFetch('/screens/map');
// result = Screen[]  ← array returned directly (service returns array)
```

**Anti-pattern to avoid:**
```typescript
// WRONG — double-unwrapping
const res = await apiFetch('/campaigns');
return res.data.data;  // ← BUG: apiFetch already unwrapped once

// CORRECT
const res = await apiFetch('/campaigns');
return res.data;  // ← this is the Campaign[]
```

---

## NestJS Service Pattern

```typescript
@Injectable()
export class CampaignsService {
  constructor(
    private prisma: PrismaService,
    private deviceGateway: DeviceGateway,
  ) {}

  // List: always paginate, always filter by orgId
  async findAll(advertiserOrgId: string, page: number, limit: number) {
    const [data, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { advertiserOrgId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.campaign.count({ where: { advertiserOrgId } }),
    ]);
    return { data, total, page, limit };
    // TransformInterceptor will wrap this in { data: above, statusCode, timestamp }
  }

  // Mutations: $transaction for multi-table writes
  async create(dto: CreateCampaignDto) {
    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({ data: { ...dto } });
      await tx.campaignTargeting.create({
        data: {
          campaignId: campaign.id,
          includedScreens: { connect: dto.screenIds.map(id => ({ id })) },
        },
      });
      return campaign;
    });
  }

  // Side effects after DB: emit socket events
  async publish(id: string, orgId: string) {
    const campaign = await this.prisma.campaign.update({
      where: { id, advertiserOrgId: orgId },
      data: { status: 'ACTIVE' },
      include: { targeting: { include: { includedScreens: true } } },
    });
    // Notify TV devices
    for (const screen of campaign.targeting.includedScreens) {
      await this.deviceGateway.pushToScreen(screen.id, 'tv:ads:update');
    }
    return campaign;
  }
}
```

---

## Next.js Data Fetching Pattern

### Server Component (preferred for initial load)

```typescript
// app/campaigns/page.tsx
import { apiFetch } from '@/lib/api';

export default async function CampaignsPage() {
  const { data: campaigns, total } = await apiFetch('/campaigns?page=1&limit=20');
  return <CampaignList campaigns={campaigns} total={total} />;
}
```

### Client Component with TanStack Query (for interactive data)

```typescript
// hooks/use-campaigns.ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function useCampaigns(filters: CampaignFilters) {
  return useQuery({
    queryKey: ['campaigns', filters],
    queryFn: () => apiFetch(`/campaigns?${new URLSearchParams(filters)}`),
  });
}

// Component
function CampaignList() {
  const { data, isLoading, error } = useCampaigns({ page: 1 });

  if (isLoading) return <CampaignListSkeleton />;
  if (error) return <ErrorBanner message={error.message} />;
  if (!data?.data?.length) return <EmptyState title="No campaigns yet" />;

  return <Table rows={data.data} />;
}
```

### Mutations

```typescript
const publishCampaign = useMutation({
  mutationFn: (id: string) =>
    apiFetch(`/campaigns/${id}/publish`, { method: 'POST' }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    toast.success('Campaign published successfully');
  },
  onError: (error) => {
    toast.error(`Failed to publish: ${error.message}`);
  },
});

// In JSX — never a dead button
<Button
  onClick={() => publishCampaign.mutate(campaign.id)}
  disabled={publishCampaign.isPending}
>
  {publishCampaign.isPending ? 'Publishing...' : 'Publish'}
</Button>
```

---

## Shared Types Usage

Always import domain types from `@neofilm/shared`:

```typescript
import type { CampaignDto, CreateCampaignDto, ScreenDto } from '@neofilm/shared';

// Never define the same type twice across packages
// Never import from '../../../packages/shared/src/...'
```

---

## File Naming

```
# Next.js App Router
page.tsx          → route page
layout.tsx        → layout wrapper
loading.tsx       → suspense fallback
error.tsx         → error boundary
route.ts          → API route (avoid — use NestJS API instead)

# Components
kebab-case.tsx    → e.g., campaign-card.tsx, screen-status-badge.tsx

# Hooks
use-kebab-case.ts → e.g., use-campaigns.ts, use-socket.ts

# NestJS
campaigns.controller.ts
campaigns.service.ts
campaigns.module.ts
create-campaign.dto.ts
```

---

## TypeScript Rules

```typescript
// NO any — define the type or use unknown
const data: any = response;  // WRONG
const data: CampaignDto = response;  // CORRECT

// NO @ts-ignore without explanation
// @ts-ignore  // WRONG
// @ts-ignore TODO: fix after upgrading hls.js types  // acceptable with context

// NO non-null assertions without certainty
const id = user!.id;  // risky
const id = user?.id ?? throw new Error('No user');  // safer

// Prefer type over interface for DTOs (consistent with shared package)
type CreateCampaignDto = { name: string; budgetCents: number; };
```

---

## Environment Variables

```typescript
// Next.js public vars: prefix NEXT_PUBLIC_
process.env.NEXT_PUBLIC_API_URL    // available in browser + server
process.env.DATABASE_URL           // server-only (no prefix)

// NestJS: use @neofilm/config (Zod-validated)
import { env } from '@neofilm/config';
env.DATABASE_URL  // throws at startup if missing/invalid

// Never hardcode
const API_URL = 'http://localhost:3001';  // WRONG
const API_URL = process.env.NEXT_PUBLIC_API_URL;  // CORRECT
```

---

## UI Component Rules

### Always Show Loading State

```tsx
// Loading skeleton — never show blank space
if (isLoading) return <div className="animate-pulse h-8 bg-gray-200 rounded" />;
```

### Always Show Empty State

```tsx
if (data.length === 0) {
  return (
    <div className="text-center py-12">
      <p className="text-gray-500">No campaigns yet</p>
      <Button onClick={() => router.push('/campaigns/new')}>
        Create your first campaign
      </Button>
    </div>
  );
}
```

### Buttons Must Have Handlers

```tsx
// WRONG — dead button
<Button onClick={() => {}}>Publish</Button>

// WRONG — placeholder comment
<Button onClick={() => console.log('TODO')}>Publish</Button>

// CORRECT — wired up
<Button onClick={() => publishMutation.mutate(id)}>Publish</Button>

// CORRECT — hidden if not ready
{isFeatureEnabled('publish') && <Button onClick={handlePublish}>Publish</Button>}
```

---

## Money Display

```typescript
// Convert cents to display string
function formatCents(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

formatCents(10000)  // → "100,00 €"
formatCents(500)    // → "5,00 €"
```

---

## Error Handling

### Frontend

```typescript
// Use toast for user-facing errors
toast.error(error instanceof Error ? error.message : 'Something went wrong');

// Log technical errors for debugging
console.error('[CampaignsService]', error);

// Never silently swallow errors
try {
  await publishCampaign(id);
} catch (e) {
  // WRONG: empty catch
}
```

### NestJS

```typescript
// Use NestJS built-in exceptions
throw new NotFoundException(`Campaign ${id} not found`);
throw new ForbiddenException('Not your campaign');
throw new BadRequestException('Invalid screen IDs');
throw new ConflictException('Campaign already active');
```

---

## Import Order (Prettier-enforced)

```typescript
// 1. Node built-ins
import { readFile } from 'fs/promises';

// 2. External packages
import { Injectable } from '@nestjs/common';
import { useQuery } from '@tanstack/react-query';

// 3. Internal workspace packages
import type { CampaignDto } from '@neofilm/shared';
import { Button } from '@neofilm/ui';

// 4. Local imports
import { apiFetch } from '@/lib/api';
import { CampaignCard } from '@/components/campaigns/campaign-card';
```

---

## Anti-Patterns (Never Do)

```typescript
// 1. Bypassing tenant filter
await prisma.campaign.findMany({});  // Missing orgId filter

// 2. Float money
{ price: 9.99 }  // Use { priceCents: 999 }

// 3. Direct Prisma import in frontend
import { PrismaClient } from '@prisma/client';  // Server-only!

// 4. Hardcoded URLs
fetch('http://localhost:3001/api/campaigns')  // Use env var

// 5. Double-unwrapping API response
const res = await apiFetch('/campaigns');
const campaigns = res.data.data;  // BUG: already unwrapped

// 6. any cast
const dto: any = req.body;  // Define the DTO type

// 7. Updating DiffusionLog or AnalyticsEvent
await prisma.diffusionLog.update({ ... });  // NEVER — append-only

// 8. Non-paginated queries on large tables
await prisma.analyticsEvent.findMany({});  // ALWAYS paginate or aggregate
```
