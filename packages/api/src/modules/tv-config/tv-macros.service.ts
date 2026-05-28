import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface TvMacroResponse {
  screenId: string | null;
  spotDuration15s: boolean;
  spotDuration30s: boolean;
  skipDelayMs: number;
  adRotationMs: number;
  splitRatio: number;
  adOnBoot: boolean;
  adOnTabChange: boolean;
  adOnAppOpen: boolean;
  adOnCatalogOpen: boolean;
  activitiesSplit: boolean;
  activitiesAdNoSkip: boolean;
  maxAdsPerHour: number;
  maxInterstitialsPerSession: number;
  interstitialIntervalMs: number;
}

const DEFAULT_MACROS: Omit<TvMacroResponse, 'screenId'> = {
  spotDuration15s: true,
  spotDuration30s: true,
  skipDelayMs: 7000,
  adRotationMs: 15000,
  splitRatio: 70,
  adOnBoot: true,
  adOnTabChange: true,
  adOnAppOpen: true,
  adOnCatalogOpen: false,
  activitiesSplit: true,
  activitiesAdNoSkip: true,
  maxAdsPerHour: 20,
  maxInterstitialsPerSession: 10,
  interstitialIntervalMs: 3600000,
};

@Injectable()
export class TvMacrosService {
  private readonly logger = new Logger(TvMacrosService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read the GLOBAL interstitial interval that applies to every screen.
   * Stored in `platform_settings` under key `interstitialIntervalMs` as a stringified ms count.
   */
  private async getGlobalInterstitialIntervalMs(): Promise<number> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: 'interstitialIntervalMs' },
    });
    if (!row) return DEFAULT_MACROS.interstitialIntervalMs;
    const parsed = Number.parseInt(row.value, 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_MACROS.interstitialIntervalMs;
  }

  /** Get macros for a screen, returning defaults if none configured. */
  async getMacrosForScreen(screenId: string): Promise<TvMacroResponse> {
    const [macros, globalIntervalMs] = await Promise.all([
      this.prisma.tvMacro.findUnique({ where: { screenId } }),
      this.getGlobalInterstitialIntervalMs(),
    ]);

    if (!macros) {
      return { screenId, ...DEFAULT_MACROS, interstitialIntervalMs: globalIntervalMs };
    }

    return {
      screenId: macros.screenId,
      spotDuration15s: macros.spotDuration15s,
      spotDuration30s: macros.spotDuration30s,
      skipDelayMs: macros.skipDelayMs,
      adRotationMs: macros.adRotationMs,
      splitRatio: macros.splitRatio,
      adOnBoot: macros.adOnBoot,
      adOnTabChange: macros.adOnTabChange,
      adOnAppOpen: macros.adOnAppOpen,
      adOnCatalogOpen: macros.adOnCatalogOpen,
      activitiesSplit: macros.activitiesSplit,
      activitiesAdNoSkip: macros.activitiesAdNoSkip,
      maxAdsPerHour: macros.maxAdsPerHour,
      maxInterstitialsPerSession: macros.maxInterstitialsPerSession,
      interstitialIntervalMs: globalIntervalMs,
    };
  }

  /** Upsert macros for a screen (partner action). */
  async upsertMacros(
    screenId: string,
    orgId: string,
    data: Partial<Omit<TvMacroResponse, 'screenId'>>,
  ) {
    // Verify screen belongs to this org
    const screen = await this.prisma.screen.findFirst({
      where: { id: screenId, partnerOrgId: orgId },
    });
    if (!screen) {
      throw new NotFoundException('Screen not found or not owned by this organization');
    }

    const result = await this.prisma.tvMacro.upsert({
      where: { screenId },
      create: {
        screenId,
        orgId,
        ...DEFAULT_MACROS,
        ...data,
      },
      update: {
        ...(data.spotDuration15s !== undefined && { spotDuration15s: data.spotDuration15s }),
        ...(data.spotDuration30s !== undefined && { spotDuration30s: data.spotDuration30s }),
        ...(data.skipDelayMs !== undefined && { skipDelayMs: data.skipDelayMs }),
        ...(data.adRotationMs !== undefined && { adRotationMs: data.adRotationMs }),
        ...(data.splitRatio !== undefined && { splitRatio: data.splitRatio }),
        ...(data.adOnBoot !== undefined && { adOnBoot: data.adOnBoot }),
        ...(data.adOnTabChange !== undefined && { adOnTabChange: data.adOnTabChange }),
        ...(data.adOnAppOpen !== undefined && { adOnAppOpen: data.adOnAppOpen }),
        ...(data.adOnCatalogOpen !== undefined && { adOnCatalogOpen: data.adOnCatalogOpen }),
        ...(data.activitiesSplit !== undefined && { activitiesSplit: data.activitiesSplit }),
        ...(data.activitiesAdNoSkip !== undefined && { activitiesAdNoSkip: data.activitiesAdNoSkip }),
        ...(data.maxAdsPerHour !== undefined && { maxAdsPerHour: data.maxAdsPerHour }),
        ...(data.maxInterstitialsPerSession !== undefined && {
          maxInterstitialsPerSession: data.maxInterstitialsPerSession,
        }),
        // interstitialIntervalMs is now a GLOBAL setting in `platform_settings`,
        // not per-screen — ignore any value sent here.
      },
    });

    this.logger.log(`TvMacros upserted for screen ${screenId}`);
    return this.getMacrosForScreen(screenId);
  }
}
