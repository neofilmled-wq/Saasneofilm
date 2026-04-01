import { BadRequestException } from '@nestjs/common';
import { PricingEngineService } from '../pricing-engine.service';

describe('PricingEngineService', () => {
  let engine: PricingEngineService;

  beforeEach(() => {
    engine = new PricingEngineService();
  });

  // ─── Diffusion Pricing ──────────────────────────────────────────────────────

  describe('computeDiffusionMonthly', () => {
    it('50 TV = 39.00 €', () => {
      expect(engine.computeDiffusionMonthly(50)).toBe(39.0);
    });

    it('100 TV = 66.30 €', () => {
      expect(engine.computeDiffusionMonthly(100)).toBe(66.3);
    });

    it('150 TV = 109.39 €', () => {
      expect(engine.computeDiffusionMonthly(150)).toBe(109.39);
    });

    it('200 TV = 175.03 €', () => {
      expect(engine.computeDiffusionMonthly(200)).toBe(175.03);
    });

    it('300 TV = 262.55 €', () => {
      expect(engine.computeDiffusionMonthly(300)).toBe(262.55);
    });

    it('rejects invalid tvCount (75)', () => {
      expect(() => engine.computeDiffusionMonthly(75)).toThrow(BadRequestException);
    });

    it('rejects tvCount > 300 (400)', () => {
      expect(() => engine.computeDiffusionMonthly(400)).toThrow(BadRequestException);
    });

    it('rejects tvCount 0', () => {
      expect(() => engine.computeDiffusionMonthly(0)).toThrow(BadRequestException);
    });
  });

  // ─── Catalogue Pricing ──────────────────────────────────────────────────────

  describe('computeCatalogueMonthly', () => {
    it('50 TV = 18.90 €', () => {
      expect(engine.computeCatalogueMonthly(50)).toBe(18.9);
    });

    it('100 TV = 27.41 €', () => {
      expect(engine.computeCatalogueMonthly(100)).toBe(27.41);
    });

    it('150 TV = 38.37 €', () => {
      expect(engine.computeCatalogueMonthly(150)).toBe(38.37);
    });

    it('200 TV = 51.80 €', () => {
      expect(engine.computeCatalogueMonthly(200)).toBe(51.8);
    });

    it('300 TV = 67.33 €', () => {
      expect(engine.computeCatalogueMonthly(300)).toBe(67.33);
    });

    it('rejects invalid tvCount', () => {
      expect(() => engine.computeCatalogueMonthly(250)).toThrow(BadRequestException);
    });
  });

  // ─── Bundle Pricing ─────────────────────────────────────────────────────────

  describe('computeBundleMonthly', () => {
    it('diffusion 200 + catalogue 150 = 213.40 €', () => {
      const result = engine.computeBundleMonthly(200, 150);
      expect(result.diffusionAmount).toBe(175.03);
      expect(result.catalogueAmount).toBe(38.37);
      expect(result.totalMonthly).toBe(213.4);
    });

    it('diffusion only (100 TV)', () => {
      const result = engine.computeBundleMonthly(100, undefined);
      expect(result.diffusionAmount).toBe(66.3);
      expect(result.catalogueAmount).toBe(0);
      expect(result.totalMonthly).toBe(66.3);
    });

    it('catalogue only (300 TV)', () => {
      const result = engine.computeBundleMonthly(undefined, 300);
      expect(result.diffusionAmount).toBe(0);
      expect(result.catalogueAmount).toBe(67.33);
      expect(result.totalMonthly).toBe(67.33);
    });

    it('diffusion 50 + catalogue 50', () => {
      const result = engine.computeBundleMonthly(50, 50);
      expect(result.totalMonthly).toBe(57.9); // 39.00 + 18.90
    });

    it('diffusion 300 + catalogue 300', () => {
      const result = engine.computeBundleMonthly(300, 300);
      expect(result.totalMonthly).toBe(329.88); // 262.55 + 67.33
    });

    it('rejects if neither diffusion nor catalogue', () => {
      expect(() => engine.computeBundleMonthly(undefined, undefined)).toThrow(
        BadRequestException,
      );
    });
  });

  // ─── Duration Constraint ────────────────────────────────────────────────────

  describe('validateDuration', () => {
    it('300 TV with 5 months is valid', () => {
      expect(engine.validateDuration(300, 5)).toBe(true);
    });

    it('300 TV with 6 months is valid', () => {
      expect(engine.validateDuration(300, 6)).toBe(true);
    });

    it('300 TV with 12 months is valid', () => {
      expect(engine.validateDuration(300, 12)).toBe(true);
    });

    it('300 TV with 4 months is invalid', () => {
      expect(engine.validateDuration(300, 4)).toBe(false);
    });

    it('300 TV with 1 month is invalid', () => {
      expect(engine.validateDuration(300, 1)).toBe(false);
    });

    it('200 TV with any duration is valid', () => {
      expect(engine.validateDuration(200, 1)).toBe(true);
    });

    it('undefined diffusion with any duration is valid', () => {
      expect(engine.validateDuration(undefined, 1)).toBe(true);
    });
  });

  // ─── Full Quote ─────────────────────────────────────────────────────────────

  describe('computeQuote', () => {
    it('diffusion 200 + catalogue 150 for 12 months', () => {
      const quote = engine.computeQuote(200, 150, 12);
      expect(quote.diffusionMonthly).toBe(175.03);
      expect(quote.catalogueMonthly).toBe(38.37);
      expect(quote.totalMonthly).toBe(213.4);
      expect(quote.totalEngagement).toBe(2560.8); // 213.40 * 12
      expect(quote.pricePerTvDiffusion).toBe(0.88); // 175.03 / 200
      expect(quote.pricePerTvCatalogue).toBe(0.26); // 38.37 / 150 rounded
      expect(quote.durationMonths).toBe(12);
    });

    it('diffusion 300 with 4 months is rejected', () => {
      expect(() => engine.computeQuote(300, undefined, 4)).toThrow(BadRequestException);
    });

    it('diffusion 300 with 6 months is accepted', () => {
      const quote = engine.computeQuote(300, undefined, 6);
      expect(quote.totalMonthly).toBe(262.55);
      expect(quote.totalEngagement).toBe(1575.3); // 262.55 * 6
    });

    it('returns null for unused products', () => {
      const quote = engine.computeQuote(100, undefined, 12);
      expect(quote.diffusionMonthly).toBe(66.3);
      expect(quote.catalogueMonthly).toBeNull();
      expect(quote.pricePerTvCatalogue).toBeNull();
      expect(quote.catalogueTvCount).toBeNull();
    });
  });

  // ─── Utilities ──────────────────────────────────────────────────────────────

  describe('eurToCents', () => {
    it('converts 39.00 to 3900', () => {
      expect(engine.eurToCents(39.0)).toBe(3900);
    });

    it('converts 213.40 to 21340', () => {
      expect(engine.eurToCents(213.4)).toBe(21340);
    });

    it('handles floating point (109.39 to 10939)', () => {
      expect(engine.eurToCents(109.39)).toBe(10939);
    });
  });

  describe('getPricePerTv', () => {
    it('100€ / 50 TV = 2.00 €/TV', () => {
      expect(engine.getPricePerTv(100, 50)).toBe(2.0);
    });

    it('0 tvCount returns 0', () => {
      expect(engine.getPricePerTv(100, 0)).toBe(0);
    });
  });

  describe('getGrids', () => {
    it('returns both grids and allowed counts', () => {
      const grids = engine.getGrids();
      expect(grids.allowedTvCounts).toEqual([50, 100, 150, 200, 300]);
      expect(grids.diffusion[50]).toBe(39.0);
      expect(grids.catalogue[300]).toBe(67.33);
      expect(grids.minDuration300Tv).toBe(5);
    });
  });

  // ─── Retrocession Example Validation ────────────────────────────────────────

  describe('retrocession example (spec validation)', () => {
    it('50 TV / 100€ split across 3 partners at 10%', () => {
      // 50 TV total, 100€/month
      const totalMonthly = 100;
      const totalTv = 50;
      const pricePerTv = engine.getPricePerTv(totalMonthly, totalTv);
      expect(pricePerTv).toBe(2.0);

      const retroRate = 0.1; // 10%

      // P1: 20 TV
      const p1Revenue = pricePerTv * 20; // 40€
      const p1Retro = p1Revenue * retroRate; // 4€
      expect(p1Revenue).toBe(40);
      expect(p1Retro).toBe(4);

      // P2: 20 TV
      const p2Revenue = pricePerTv * 20;
      const p2Retro = p2Revenue * retroRate;
      expect(p2Revenue).toBe(40);
      expect(p2Retro).toBe(4);

      // P3: 10 TV
      const p3Revenue = pricePerTv * 10;
      const p3Retro = p3Revenue * retroRate;
      expect(p3Revenue).toBe(20);
      expect(p3Retro).toBe(2);

      // Total retro = 10€
      expect(p1Retro + p2Retro + p3Retro).toBe(10);
    });
  });
});
