import { Injectable, BadRequestException } from '@nestjs/common';

// ─── Progressive per-TV pricing (monthly EUR) ────────────────────────────────
// No fixed packs: any screen count from 1 to MAX_TV_COUNT is allowed. Each 50-TV
// bracket has its own per-TV rate and the total is the sum across the filled
// brackets, exactly like income-tax brackets:
//   total(N) = Σ (screens in bracket) × (bracket rate)
// The rates below are derived from the historical pack grid so a full pack still
// costs the same:
//   Diffusion : 50→39.00, 100→66.30, 150→91.65, 200→115.05
//   Catalogue : 50→18.90, 100→27.40, 150→34.96, 200→40.63

interface Tier {
  /** Upper bound of the bracket (inclusive). */
  upTo: number;
  /** Monthly price per TV within this bracket, in EUR. */
  rate: number;
}

const DIFFUSION_TIERS: Tier[] = [
  { upTo: 50, rate: 0.78 }, //   1–50   → 39.00 € at 50
  { upTo: 100, rate: 0.546 }, //  51–100  → 66.30 € at 100
  { upTo: 150, rate: 0.507 }, // 101–150  → 91.65 € at 150
  { upTo: 200, rate: 0.468 }, // 151–200  → 115.05 € at 200
];

const CATALOGUE_TIERS: Tier[] = [
  { upTo: 50, rate: 0.378 }, //   1–50   → 18.90 € at 50
  { upTo: 100, rate: 0.17 }, //  51–100  → 27.40 € at 100
  { upTo: 150, rate: 0.1512 }, // 101–150  → 34.96 € at 150
  { upTo: 200, rate: 0.1134 }, // 151–200  → 40.63 € at 200
];

/** Optional presets shown in the UI as quick-select buttons. */
const PACK_PRESETS = [50, 100, 150, 200] as const;
const MAX_TV_COUNT = 200;

/** Minimum engagement months (no special constraint now) */
const MIN_DURATION_300_TV = 5; // kept for backward compat

function roundHalfUp(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor + Number.EPSILON) / factor;
}

export interface BundleResult {
  totalMonthly: number;
  diffusionAmount: number;
  catalogueAmount: number;
}

export interface PricingQuote {
  diffusionMonthly: number | null;
  catalogueMonthly: number | null;
  totalMonthly: number;
  totalEngagement: number;
  pricePerTvDiffusion: number | null;
  pricePerTvCatalogue: number | null;
  durationMonths: number;
  diffusionTvCount: number | null;
  catalogueTvCount: number | null;
}

@Injectable()
export class PricingEngineService {
  /** Validate that a TV count is within the allowed range (1..MAX_TV_COUNT). */
  private validateTvCount(tvCount: number, product: string): void {
    if (!Number.isInteger(tvCount) || tvCount < 1 || tvCount > MAX_TV_COUNT) {
      throw new BadRequestException(
        `${product}: tvCount must be an integer between 1 and ${MAX_TV_COUNT}. Got ${tvCount}. For more than ${MAX_TV_COUNT} TV, contact sales.`,
      );
    }
  }

  /** Sum the progressive brackets up to `tvCount`. */
  private computeTiered(tvCount: number, tiers: Tier[]): number {
    let total = 0;
    let prevUpTo = 0;
    for (const tier of tiers) {
      if (tvCount <= prevUpTo) break;
      const countInBracket = Math.min(tvCount, tier.upTo) - prevUpTo;
      total += countInBracket * tier.rate;
      prevUpTo = tier.upTo;
    }
    return roundHalfUp(total, 2);
  }

  /** Compute monthly diffusion price for a given TV count. */
  computeDiffusionMonthly(tvCount: number): number {
    this.validateTvCount(tvCount, 'Diffusion');
    return this.computeTiered(tvCount, DIFFUSION_TIERS);
  }

  /** Compute monthly catalogue price for a given TV count. */
  computeCatalogueMonthly(tvCount: number): number {
    this.validateTvCount(tvCount, 'Catalogue');
    return this.computeTiered(tvCount, CATALOGUE_TIERS);
  }

  /**
   * Compute combined monthly price.
   * Diffusion and catalogue can have different TV counts.
   * No additional discount on the bundle.
   */
  computeBundleMonthly(diffTvCount?: number, catTvCount?: number): BundleResult {
    if (!diffTvCount && !catTvCount) {
      throw new BadRequestException(
        'At least one of diffusionTvCount or catalogueTvCount is required',
      );
    }

    const diffusionAmount = diffTvCount ? this.computeDiffusionMonthly(diffTvCount) : 0;
    const catalogueAmount = catTvCount ? this.computeCatalogueMonthly(catTvCount) : 0;

    return {
      totalMonthly: roundHalfUp(diffusionAmount + catalogueAmount, 2),
      diffusionAmount,
      catalogueAmount,
    };
  }

  /**
   * Validate duration constraint (legacy — no active constraint now).
   * Returns true if valid.
   */
  validateDuration(diffusionTvCount: number | undefined, durationMonths: number): boolean {
    if (diffusionTvCount === 300 && durationMonths < MIN_DURATION_300_TV) {
      return false;
    }
    return true;
  }

  /** Average price per TV for transparency display. */
  getPricePerTv(amount: number, tvCount: number): number {
    if (tvCount <= 0) return 0;
    return roundHalfUp(amount / tvCount, 2);
  }

  /**
   * Full pricing quote — the single method the API controller calls.
   */
  computeQuote(
    diffusionTvCount?: number,
    catalogueTvCount?: number,
    durationMonths: number = 12,
  ): PricingQuote {
    if (!diffusionTvCount && !catalogueTvCount) {
      throw new BadRequestException(
        'At least one of diffusionTvCount or catalogueTvCount is required',
      );
    }

    const bundle = this.computeBundleMonthly(diffusionTvCount, catalogueTvCount);

    return {
      diffusionMonthly: diffusionTvCount ? bundle.diffusionAmount : null,
      catalogueMonthly: catalogueTvCount ? bundle.catalogueAmount : null,
      totalMonthly: bundle.totalMonthly,
      totalEngagement: roundHalfUp(bundle.totalMonthly * durationMonths, 2),
      pricePerTvDiffusion: diffusionTvCount
        ? this.getPricePerTv(bundle.diffusionAmount, diffusionTvCount)
        : null,
      pricePerTvCatalogue: catalogueTvCount
        ? this.getPricePerTv(bundle.catalogueAmount, catalogueTvCount)
        : null,
      durationMonths,
      diffusionTvCount: diffusionTvCount ?? null,
      catalogueTvCount: catalogueTvCount ?? null,
    };
  }

  /** Convert EUR amount to cents (integer). */
  eurToCents(eur: number): number {
    return Math.round(eur * 100);
  }

  /** Preset TV counts shown as quick-select buttons in the UI. */
  getAllowedTvCounts(): readonly number[] {
    return PACK_PRESETS;
  }

  /** Max selectable TV count (above this → contact sales). */
  getMaxTvCount(): number {
    return MAX_TV_COUNT;
  }

  /** Get the full pricing tiers (for admin / UI display). */
  getGrids() {
    return {
      diffusionTiers: DIFFUSION_TIERS.map((t) => ({ ...t })),
      catalogueTiers: CATALOGUE_TIERS.map((t) => ({ ...t })),
      packPresets: [...PACK_PRESETS],
      maxTvCount: MAX_TV_COUNT,
    };
  }
}
