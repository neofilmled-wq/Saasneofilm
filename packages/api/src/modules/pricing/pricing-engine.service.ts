import { Injectable, BadRequestException } from '@nestjs/common';

// ─── Official Pricing Grids (monthly EUR) ────────────────────────────────────
// Cumulative multiplier model — each tier builds on the previous.

const DIFFUSION_GRID: Record<number, number> = {
  50: 39.0,            // prix de base
  100: 66.3,           // 39 + 30% de 39 = 39 + 27.3
  150: 91.65,          // 66.3 + 65% de 39 = 66.3 + 25.35
  200: 115.05,         // 91.65 + 60% de 39 = 91.65 + 23.4
};

const CATALOGUE_GRID: Record<number, number> = {
  50: 18.9,            // prix de base
  100: 27.4,           // 18.9 + 45% de 18.9 = 18.9 + 8.5
  150: 34.96,          // 27.4 + 40% de 18.9 = 27.4 + 7.56
  200: 40.63,          // 34.96 + 35% de 18.9 = 34.96 + 6.615 ≈ 40.63 (arrondi à 6.63 sur ta feuille: 34.36 + 6.63, mais cumul exact = 40.63)
};

const ALLOWED_TV_COUNTS = [50, 100, 150, 200] as const;
type AllowedTvCount = (typeof ALLOWED_TV_COUNTS)[number];

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
  /** Validate that a TV count is in the allowed set. */
  private validateTvCount(tvCount: number, product: string): asserts tvCount is AllowedTvCount {
    if (!(ALLOWED_TV_COUNTS as readonly number[]).includes(tvCount)) {
      throw new BadRequestException(
        `${product}: tvCount must be one of ${ALLOWED_TV_COUNTS.join(', ')}. Got ${tvCount}. For >300 TV, contact sales.`,
      );
    }
  }

  /** Compute monthly diffusion price for a given TV count. */
  computeDiffusionMonthly(tvCount: number): number {
    this.validateTvCount(tvCount, 'Diffusion');
    return roundHalfUp(DIFFUSION_GRID[tvCount], 2);
  }

  /** Compute monthly catalogue price for a given TV count. */
  computeCatalogueMonthly(tvCount: number): number {
    this.validateTvCount(tvCount, 'Catalogue');
    return roundHalfUp(CATALOGUE_GRID[tvCount], 2);
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
   * Validate duration constraint: 300 TV diffusion requires >= 5 months.
   * Returns true if valid.
   */
  validateDuration(diffusionTvCount: number | undefined, durationMonths: number): boolean {
    if (diffusionTvCount === 300 && durationMonths < MIN_DURATION_300_TV) {
      return false;
    }
    return true;
  }

  /** Price per TV for transparency display. */
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

    // Validate duration constraint
    if (diffusionTvCount && !this.validateDuration(diffusionTvCount, durationMonths)) {
      throw new BadRequestException(
        `Pack diffusion 300 TV requires a minimum engagement of ${MIN_DURATION_300_TV} months. Got ${durationMonths}.`,
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

  /** Get the list of allowed TV counts. */
  getAllowedTvCounts(): readonly number[] {
    return ALLOWED_TV_COUNTS;
  }

  /** Get the full pricing grids (for admin display). */
  getGrids() {
    return {
      diffusion: { ...DIFFUSION_GRID },
      catalogue: { ...CATALOGUE_GRID },
      allowedTvCounts: [...ALLOWED_TV_COUNTS],
      minDuration300Tv: MIN_DURATION_300_TV,
    };
  }
}
