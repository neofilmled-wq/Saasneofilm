import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PricingEngineService } from './pricing-engine.service';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingEngine: PricingEngineService) {}

  /**
   * GET /api/v1/pricing/compute
   * Public endpoint — no auth required for price display.
   */
  @Public()
  @Get('compute')
  compute(
    @Query('diffusionTvCount') diffusionTvCountRaw?: string,
    @Query('catalogueTvCount') catalogueTvCountRaw?: string,
    @Query('durationMonths') durationMonthsRaw?: string,
  ) {
    const diffusionTvCount = diffusionTvCountRaw ? Number(diffusionTvCountRaw) : undefined;
    const catalogueTvCount = catalogueTvCountRaw ? Number(catalogueTvCountRaw) : undefined;
    const durationMonths = durationMonthsRaw ? Number(durationMonthsRaw) : 12;

    return this.pricingEngine.computeQuote(diffusionTvCount, catalogueTvCount, durationMonths);
  }

  /**
   * GET /api/v1/pricing/grids
   * Public endpoint — returns the full pricing grids for UI display.
   */
  @Public()
  @Get('grids')
  grids() {
    return this.pricingEngine.getGrids();
  }
}
