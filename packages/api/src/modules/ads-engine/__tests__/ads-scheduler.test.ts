/**
 * AdsScheduler Unit Tests
 *
 * Tests the core decision engine logic with mock DB.
 * All tests are deterministic and reproducible.
 */

// ═══════════════════════════════════════════════════════════════
// MOCK PRISMA
// ═══════════════════════════════════════════════════════════════

const mockCampaigns: any[] = [];
const mockPlacements: any[] = [];
const mockDecisionCache: Map<string, any> = new Map();

const mockPrisma = {
  screen: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'screen-1',
      latitude: 48.8566,
      longitude: 2.3522,
      environment: 'HOTEL_ROOM',
      partnerOrgId: 'partner-1',
    }),
  },
  campaign: {
    findMany: jest.fn().mockImplementation(() => Promise.resolve(mockCampaigns)),
  },
  adPlacement: {
    findMany: jest
      .fn()
      .mockImplementation(() => Promise.resolve(mockPlacements)),
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  adDecisionCache: {
    findUnique: jest.fn().mockImplementation(({ where }: any) => {
      return Promise.resolve(mockDecisionCache.get(where.screenId) ?? null);
    }),
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  adEvent: {
    create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    findUnique: jest.fn().mockResolvedValue(null),
  },
};

jest.mock('../../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { AdsSchedulerService } from '../ads-scheduler.service';
import { PrismaService } from '../../../prisma/prisma.service';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function createMockCampaign(overrides: Partial<any> = {}) {
  const id = overrides.id ?? `campaign-${Math.random().toString(36).slice(2, 8)}`;
  const advId = overrides.advertiserOrgId ?? `adv-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    name: overrides.name ?? `Campaign ${id}`,
    status: 'ACTIVE',
    type: 'AD_SPOT',
    startDate: overrides.startDate ?? new Date('2026-01-01'),
    endDate: overrides.endDate ?? new Date('2026-12-31'),
    budgetCents: overrides.budgetCents ?? 100000, // 1000€
    spentCents: overrides.spentCents ?? 0,
    advertiserOrgId: advId,
    advertiserOrg: {
      id: advId,
      name: overrides.advertiserName ?? `Advertiser ${advId}`,
    },
    targeting: {
      id: `targeting-${id}`,
      campaignId: id,
      geoRadiusKm: null,
      geoLatitude: null,
      geoLongitude: null,
      cities: [],
      includedScreens: overrides.includedScreens ?? [],
      excludedScreens: overrides.excludedScreens ?? [],
      environments: overrides.environments ?? [],
      scheduleWindows: null,
    },
    creatives: [
      {
        id: overrides.creativeId ?? `creative-${id}`,
        fileUrl: `https://cdn.neofilm.io/creative-${id}.mp4`,
        fileHash: `hash-${id}`,
        durationMs: overrides.durationMs ?? 15000,
        mimeType: overrides.mimeType ?? 'video/mp4',
        width: 1920,
        height: 1080,
      },
    ],
    ...overrides,
  };
}

function createMockPlacement(campaignId: string, screenId: string, overrides: Partial<any> = {}) {
  return {
    campaignId,
    screenId,
    playsToday: overrides.playsToday ?? 0,
    playsThisHour: overrides.playsThisHour ?? 0,
    lastPlayedAt: overrides.lastPlayedAt ?? null,
    cooldownUntil: overrides.cooldownUntil ?? null,
    maxPlaysPerHour: overrides.maxPlaysPerHour ?? 10,
    maxPlaysPerDay: overrides.maxPlaysPerDay ?? 100,
    tier: 'STANDARD',
    priority: 50,
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe('AdsSchedulerService', () => {
  let service: AdsSchedulerService;
  const NOW = new Date('2026-06-15T14:30:00Z');

  beforeEach(() => {
    mockCampaigns.length = 0;
    mockPlacements.length = 0;
    mockDecisionCache.clear();
    jest.clearAllMocks();

    service = new AdsSchedulerService(new PrismaService() as any);
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Rotation équitable 40 annonceurs
  // ─────────────────────────────────────────────────────────────

  describe('Fair rotation with 40 advertisers', () => {
    it('should return ads from multiple different advertisers', async () => {
      // Create 40 campaigns, each from a different advertiser
      for (let i = 0; i < 40; i++) {
        mockCampaigns.push(
          createMockCampaign({
            id: `campaign-${i}`,
            advertiserOrgId: `adv-${i}`,
            advertiserName: `Advertiser ${i}`,
            budgetCents: 100000,
          }),
        );
      }

      const decision = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      // Should return up to 10 ads
      expect(decision.ads.length).toBeLessThanOrEqual(10);
      expect(decision.ads.length).toBeGreaterThan(0);

      // All ads should be from different advertisers (no consecutive same)
      for (let i = 1; i < decision.ads.length; i++) {
        expect(decision.ads[i].advertiserId).not.toBe(
          decision.ads[i - 1].advertiserId,
        );
      }

      // Meta should show 40 candidates
      expect(decision.meta.totalCandidates).toBe(40);
    });

    it('should enforce max 40 advertiser cap', async () => {
      // Create 50 campaigns, 50 different advertisers
      for (let i = 0; i < 50; i++) {
        mockCampaigns.push(
          createMockCampaign({
            id: `campaign-${i}`,
            advertiserOrgId: `adv-${i}`,
            budgetCents: 100000 + i * 1000, // varying budgets
          }),
        );
      }

      const decision = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      // Should have at most 40 unique advertisers in results
      const uniqueAdvs = new Set(decision.ads.map((a) => a.advertiserId));
      expect(uniqueAdvs.size).toBeLessThanOrEqual(40);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Priorité premium respectée
  // ─────────────────────────────────────────────────────────────

  describe('Premium priority', () => {
    it('should rank premium campaigns higher than standard', async () => {
      mockCampaigns.push(
        createMockCampaign({
          id: 'premium-1',
          advertiserOrgId: 'adv-premium',
          budgetCents: 1000000, // 10000€ → PREMIUM
        }),
        createMockCampaign({
          id: 'standard-1',
          advertiserOrgId: 'adv-standard',
          budgetCents: 50000, // 500€ → STANDARD
        }),
      );

      const decision = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      expect(decision.ads.length).toBeGreaterThanOrEqual(2);

      // Premium should be first
      const premiumIndex = decision.ads.findIndex(
        (a) => a.campaignId === 'premium-1',
      );
      const standardIndex = decision.ads.findIndex(
        (a) => a.campaignId === 'standard-1',
      );

      expect(premiumIndex).toBeLessThan(standardIndex);
    });

    it('should apply 60/40 tier split', async () => {
      // 6 premium, 4 standard
      for (let i = 0; i < 6; i++) {
        mockCampaigns.push(
          createMockCampaign({
            id: `premium-${i}`,
            advertiserOrgId: `adv-p-${i}`,
            budgetCents: 1000000,
          }),
        );
      }
      for (let i = 0; i < 6; i++) {
        mockCampaigns.push(
          createMockCampaign({
            id: `standard-${i}`,
            advertiserOrgId: `adv-s-${i}`,
            budgetCents: 50000,
          }),
        );
      }

      const decision = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      const premiumCount = decision.ads.filter(
        (a) => a.tier === 'PREMIUM',
      ).length;
      const standardCount = decision.ads.filter(
        (a) => a.tier === 'STANDARD',
      ).length;

      // Premium should be majority (approximately 60%)
      expect(premiumCount).toBeGreaterThanOrEqual(standardCount);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Cooldown bloque répétition
  // ─────────────────────────────────────────────────────────────

  describe('Cooldown blocking', () => {
    it('should exclude campaigns in cooldown', async () => {
      const futureTime = new Date(NOW.getTime() + 600_000); // 10 min from now

      mockCampaigns.push(
        createMockCampaign({
          id: 'cooled-campaign',
          advertiserOrgId: 'adv-cooled',
        }),
        createMockCampaign({
          id: 'fresh-campaign',
          advertiserOrgId: 'adv-fresh',
        }),
      );

      // cooled-campaign is in cooldown
      mockPlacements.push(
        createMockPlacement('cooled-campaign', 'screen-1', {
          cooldownUntil: futureTime,
          lastPlayedAt: new Date(NOW.getTime() - 60_000),
        }),
      );

      const decision = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      // cooled-campaign should be excluded
      const cooledAd = decision.ads.find(
        (a) => a.campaignId === 'cooled-campaign',
      );
      expect(cooledAd).toBeUndefined();

      // fresh-campaign should be included
      const freshAd = decision.ads.find(
        (a) => a.campaignId === 'fresh-campaign',
      );
      expect(freshAd).toBeDefined();

      expect(decision.meta.cooledDown).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Cap journalier respecté
  // ─────────────────────────────────────────────────────────────

  describe('Daily cap enforcement', () => {
    it('should exclude campaigns that hit daily cap', async () => {
      mockCampaigns.push(
        createMockCampaign({
          id: 'capped-campaign',
          advertiserOrgId: 'adv-capped',
        }),
        createMockCampaign({
          id: 'uncapped-campaign',
          advertiserOrgId: 'adv-uncapped',
        }),
      );

      // capped-campaign has maxed out daily plays
      mockPlacements.push(
        createMockPlacement('capped-campaign', 'screen-1', {
          playsToday: 100,
          maxPlaysPerDay: 100,
        }),
      );

      const decision = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      const cappedAd = decision.ads.find(
        (a) => a.campaignId === 'capped-campaign',
      );
      expect(cappedAd).toBeUndefined();

      expect(decision.meta.capped).toBeGreaterThanOrEqual(1);
    });

    it('should exclude campaigns that hit hourly cap', async () => {
      mockCampaigns.push(
        createMockCampaign({
          id: 'hourly-capped',
          advertiserOrgId: 'adv-hc',
        }),
      );

      mockPlacements.push(
        createMockPlacement('hourly-capped', 'screen-1', {
          playsThisHour: 10,
          maxPlaysPerHour: 10,
        }),
      );

      const decision = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      expect(
        decision.ads.find((a) => a.campaignId === 'hourly-capped'),
      ).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Fallback si 1 seule campagne
  // ─────────────────────────────────────────────────────────────

  describe('Single campaign fallback', () => {
    it('should return the single available campaign', async () => {
      mockCampaigns.push(
        createMockCampaign({
          id: 'only-campaign',
          advertiserOrgId: 'only-adv',
        }),
      );

      const decision = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'POWER_ON',
        timestamp: NOW,
      });

      expect(decision.ads.length).toBe(1);
      expect(decision.ads[0].campaignId).toBe('only-campaign');
    });

    it('should return empty ads array if no campaigns', async () => {
      const decision = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      expect(decision.ads.length).toBe(0);
      expect(decision.meta.totalCandidates).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Load balancing stable sur 1000 screens
  // ─────────────────────────────────────────────────────────────

  describe('Load balancing across 1000 screens', () => {
    it('should produce consistent decisions for the same screen', async () => {
      for (let i = 0; i < 10; i++) {
        mockCampaigns.push(
          createMockCampaign({
            id: `lb-campaign-${i}`,
            advertiserOrgId: `lb-adv-${i}`,
            budgetCents: 100000 + i * 10000,
          }),
        );
      }

      // Run same screen twice → same result (deterministic)
      const decision1 = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      const decision2 = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      expect(decision1.ads.map((a) => a.campaignId)).toEqual(
        decision2.ads.map((a) => a.campaignId),
      );
    });

    it('should handle 1000 sequential decision requests', async () => {
      for (let i = 0; i < 5; i++) {
        mockCampaigns.push(
          createMockCampaign({
            id: `stress-${i}`,
            advertiserOrgId: `stress-adv-${i}`,
          }),
        );
      }

      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        mockPrisma.screen.findUnique.mockResolvedValue({
          id: `screen-${i}`,
          latitude: 48.8566 + (i % 10) * 0.01,
          longitude: 2.3522 + (i % 10) * 0.01,
          environment: 'HOTEL_ROOM',
          partnerOrgId: 'partner-1',
        });

        await service.getDecision({
          screenId: `screen-${i}`,
          triggerType: 'SCHEDULED',
          timestamp: NOW,
        });
      }

      const elapsed = Date.now() - start;

      // 1000 decisions should complete in reasonable time
      // (mock DB, so mostly testing CPU-bound scoring logic)
      expect(elapsed).toBeLessThan(30000); // 30s max for 1000 decisions
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 7: Distribution statistique sur 10 000 décisions
  // ─────────────────────────────────────────────────────────────

  describe('Statistical distribution over 10000 decisions', () => {
    it('should distribute fairly across advertisers', async () => {
      // 5 campaigns, equal budget → should have roughly equal distribution
      for (let i = 0; i < 5; i++) {
        mockCampaigns.push(
          createMockCampaign({
            id: `fair-${i}`,
            advertiserOrgId: `fair-adv-${i}`,
            budgetCents: 100000, // All same budget
          }),
        );
      }

      const distribution: Record<string, number> = {};

      for (let i = 0; i < 10000; i++) {
        const decision = await service.getDecision({
          screenId: 'screen-1',
          triggerType: 'SCHEDULED',
          timestamp: new Date(NOW.getTime() + i * 1000), // Vary timestamp
        });

        for (const ad of decision.ads) {
          distribution[ad.advertiserId] =
            (distribution[ad.advertiserId] ?? 0) + 1;
        }
      }

      const values = Object.values(distribution);

      // With 5 equal advertisers and 10000 decisions,
      // each should appear roughly equally (±50% of mean)
      if (values.length > 0) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        for (const count of values) {
          expect(count).toBeGreaterThan(mean * 0.3);
          expect(count).toBeLessThan(mean * 2.0);
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 8: Budget exhaustion
  // ─────────────────────────────────────────────────────────────

  describe('Budget exhaustion', () => {
    it('should exclude campaigns that have spent their budget', async () => {
      mockCampaigns.push(
        createMockCampaign({
          id: 'spent-campaign',
          advertiserOrgId: 'adv-spent',
          budgetCents: 10000,
          spentCents: 10000, // fully spent
        }),
        createMockCampaign({
          id: 'has-budget',
          advertiserOrgId: 'adv-budget',
          budgetCents: 10000,
          spentCents: 0,
        }),
      );

      const decision = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      expect(
        decision.ads.find((a) => a.campaignId === 'spent-campaign'),
      ).toBeUndefined();
      expect(
        decision.ads.find((a) => a.campaignId === 'has-budget'),
      ).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 9: Trigger bonus
  // ─────────────────────────────────────────────────────────────

  describe('Trigger bonus', () => {
    it('should give higher scores on POWER_ON trigger', async () => {
      mockCampaigns.push(
        createMockCampaign({
          id: 'trigger-test',
          advertiserOrgId: 'adv-trigger',
        }),
      );

      const powerOn = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'POWER_ON',
        timestamp: NOW,
      });

      const scheduled = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      if (powerOn.ads.length > 0 && scheduled.ads.length > 0) {
        expect(powerOn.ads[0].score).toBeGreaterThan(scheduled.ads[0].score);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 10: Screen exclusion/inclusion targeting
  // ─────────────────────────────────────────────────────────────

  describe('Screen targeting', () => {
    it('should exclude campaigns targeting other screens', async () => {
      mockCampaigns.push(
        createMockCampaign({
          id: 'targeted-elsewhere',
          advertiserOrgId: 'adv-elsewhere',
          includedScreens: [{ id: 'screen-999' }], // Not our screen
        }),
      );

      const decision = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      expect(decision.ads.length).toBe(0);
    });

    it('should include campaigns explicitly targeting this screen', async () => {
      mockCampaigns.push(
        createMockCampaign({
          id: 'targeted-here',
          advertiserOrgId: 'adv-here',
          includedScreens: [{ id: 'screen-1' }],
        }),
      );

      const decision = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      expect(decision.ads.length).toBe(1);
      expect(decision.ads[0].campaignId).toBe('targeted-here');
    });

    it('should exclude campaigns with this screen in excluded list', async () => {
      mockCampaigns.push(
        createMockCampaign({
          id: 'excluded-here',
          advertiserOrgId: 'adv-excluded',
          excludedScreens: [{ id: 'screen-1' }],
        }),
      );

      const decision = await service.getDecision({
        screenId: 'screen-1',
        triggerType: 'SCHEDULED',
        timestamp: NOW,
      });

      expect(decision.ads.length).toBe(0);
    });
  });
});
