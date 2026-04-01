import { ScreenFillService } from '../screen-fill.service';

describe('ScreenFillService', () => {
  let service: ScreenFillService;
  let mockPrisma: any;

  const SCREEN_ID = 'screen-001';

  function createMockPrisma(activeAdvertiserCount: number) {
    // Generate mock bookingScreens with distinct advertiserOrgIds
    const bookingScreens = Array.from({ length: activeAdvertiserCount }, (_, i) => ({
      booking: { advertiserOrgId: `org-${i}` },
    }));

    return {
      bookingScreen: {
        findMany: jest.fn().mockResolvedValue(bookingScreens),
      },
      screenFill: {
        findUnique: jest.fn().mockResolvedValue({ screenId: SCREEN_ID, activeAdvertiserCount }),
        upsert: jest.fn().mockResolvedValue({ screenId: SCREEN_ID, activeAdvertiserCount }),
        findMany: jest.fn().mockResolvedValue(
          activeAdvertiserCount >= 40
            ? [{ screenId: SCREEN_ID }]
            : [],
        ),
      },
      screen: {
        findMany: jest.fn().mockResolvedValue([{ id: SCREEN_ID }]),
      },
    };
  }

  describe('isFull', () => {
    it('returns true when 40 active advertisers on a screen', async () => {
      mockPrisma = createMockPrisma(40);
      service = new ScreenFillService(mockPrisma);

      const result = await service.isFull(SCREEN_ID);
      expect(result).toBe(true);
    });

    it('returns true when more than 40 active advertisers', async () => {
      mockPrisma = createMockPrisma(42);
      // Override findUnique to return 42
      mockPrisma.screenFill.findUnique.mockResolvedValue({
        screenId: SCREEN_ID,
        activeAdvertiserCount: 42,
      });
      service = new ScreenFillService(mockPrisma);

      const result = await service.isFull(SCREEN_ID);
      expect(result).toBe(true);
    });

    it('returns false when 39 active advertisers', async () => {
      mockPrisma = createMockPrisma(39);
      mockPrisma.screenFill.findUnique.mockResolvedValue({
        screenId: SCREEN_ID,
        activeAdvertiserCount: 39,
      });
      service = new ScreenFillService(mockPrisma);

      const result = await service.isFull(SCREEN_ID);
      expect(result).toBe(false);
    });

    it('returns false when no ScreenFill record exists (new screen)', async () => {
      mockPrisma = createMockPrisma(0);
      mockPrisma.screenFill.findUnique.mockResolvedValue(null);
      service = new ScreenFillService(mockPrisma);

      const result = await service.isFull(SCREEN_ID);
      expect(result).toBe(false);
    });
  });

  describe('recalculateFill', () => {
    it('counts distinct advertiserOrgIds from ACTIVE bookings', async () => {
      mockPrisma = createMockPrisma(0);
      // 5 bookingScreens but only 3 distinct advertiserOrgIds
      mockPrisma.bookingScreen.findMany.mockResolvedValue([
        { booking: { advertiserOrgId: 'org-A' } },
        { booking: { advertiserOrgId: 'org-B' } },
        { booking: { advertiserOrgId: 'org-A' } }, // duplicate
        { booking: { advertiserOrgId: 'org-C' } },
        { booking: { advertiserOrgId: 'org-B' } }, // duplicate
      ]);
      service = new ScreenFillService(mockPrisma);

      const count = await service.recalculateFill(SCREEN_ID);
      expect(count).toBe(3);

      expect(mockPrisma.screenFill.upsert).toHaveBeenCalledWith({
        where: { screenId: SCREEN_ID },
        create: { screenId: SCREEN_ID, activeAdvertiserCount: 3 },
        update: { activeAdvertiserCount: 3 },
      });
    });

    it('returns 0 when no active bookings', async () => {
      mockPrisma = createMockPrisma(0);
      mockPrisma.bookingScreen.findMany.mockResolvedValue([]);
      service = new ScreenFillService(mockPrisma);

      const count = await service.recalculateFill(SCREEN_ID);
      expect(count).toBe(0);
    });

    it('correctly counts exactly 40 advertisers', async () => {
      mockPrisma = createMockPrisma(40);
      service = new ScreenFillService(mockPrisma);

      const count = await service.recalculateFill(SCREEN_ID);
      expect(count).toBe(40);
    });
  });

  describe('getFill', () => {
    it('returns activeAdvertiserCount from ScreenFill', async () => {
      mockPrisma = createMockPrisma(25);
      mockPrisma.screenFill.findUnique.mockResolvedValue({
        screenId: SCREEN_ID,
        activeAdvertiserCount: 25,
      });
      service = new ScreenFillService(mockPrisma);

      const fill = await service.getFill(SCREEN_ID);
      expect(fill).toBe(25);
    });

    it('returns 0 when no record exists', async () => {
      mockPrisma = createMockPrisma(0);
      mockPrisma.screenFill.findUnique.mockResolvedValue(null);
      service = new ScreenFillService(mockPrisma);

      const fill = await service.getFill(SCREEN_ID);
      expect(fill).toBe(0);
    });
  });

  describe('getMaxAdvertisersPerScreen', () => {
    it('returns 40', () => {
      mockPrisma = createMockPrisma(0);
      service = new ScreenFillService(mockPrisma);
      expect(service.getMaxAdvertisersPerScreen()).toBe(40);
    });
  });

  describe('getAvailableScreenIds (returns FULL screen IDs)', () => {
    it('returns full screen IDs when screens are at capacity', async () => {
      mockPrisma = createMockPrisma(40);
      service = new ScreenFillService(mockPrisma);

      const fullScreenIds = await service.getAvailableScreenIds();
      expect(fullScreenIds).toEqual([SCREEN_ID]);
    });

    it('returns empty array when no screens are full', async () => {
      mockPrisma = createMockPrisma(10);
      service = new ScreenFillService(mockPrisma);

      const fullScreenIds = await service.getAvailableScreenIds();
      expect(fullScreenIds).toEqual([]);
    });
  });
});
