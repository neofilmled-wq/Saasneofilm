import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface FraudSignal {
  signalType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  deviceId: string;
  screenId?: string;
  details: Record<string, unknown>;
  relatedProofIds?: string[];
}

export interface FraudAlert {
  id: string;
  signal: FraudSignal;
  timestamp: Date;
  resolved: boolean;
}

/**
 * FraudDetectionService
 *
 * Rule-based fraud detection engine. Analyzes DiffusionLog signals
 * and produces alerts for anomalies.
 *
 * Rules (V1):
 *   F001: Impossible impression rate (>120/hour/device)
 *   F002: Duration anomaly (<20% or >200% expected)
 *   F003: Media hash mismatch
 *   F004: Ghost device (unassigned)
 *   F005: Replay attack (duplicate timestamps)
 *   F006: Offline spoofing
 *   F007: Volume spike (>3 sigma above rolling mean)
 *   F008: HMAC signature invalid
 *   F009: Time drift (>5 min from server)
 *   F010: Budget exceeded
 */
@Injectable()
export class FraudDetectionService {
  private readonly logger = new Logger(FraudDetectionService.name);

  /** In-memory alert queue (production: Redis + PostgreSQL) */
  private readonly alerts: FraudAlert[] = [];

  /** Per-device hourly impression counters: `${deviceId}:${hourBucket}` -> count */
  private readonly deviceHourlyCounters = new Map<string, number>();

  /** Per-device rolling daily counts for volume spike detection */
  private readonly deviceDailyCounts = new Map<string, number[]>();

  private readonly maxImpressionsPerHour: number;
  private readonly maxTimeDriftMs: number;
  private readonly volumeZScoreThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.maxImpressionsPerHour = this.configService.get<number>(
      'FRAUD_MAX_IMPRESSIONS_PER_HOUR',
      120,
    );
    this.maxTimeDriftMs = this.configService.get<number>(
      'FRAUD_MAX_TIME_DRIFT_MS',
      300000, // 5 minutes
    );
    this.volumeZScoreThreshold = this.configService.get<number>(
      'FRAUD_VOLUME_ZSCORE_THRESHOLD',
      3.0,
    );

    // Cleanup old counters every hour
    setInterval(() => this.cleanupCounters(), 3600000);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Signal intake
  // ──────────────────────────────────────────────────────────────────────────

  /** Report a fraud signal from the proof ingestion pipeline. */
  reportSignal(signal: FraudSignal): void {
    const alert: FraudAlert = {
      id: `fa_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      signal,
      timestamp: new Date(),
      resolved: false,
    };

    this.alerts.push(alert);

    // Log based on severity
    switch (signal.severity) {
      case 'CRITICAL':
        this.logger.error(
          `FRAUD CRITICAL [${signal.signalType}] device=${signal.deviceId}: ${JSON.stringify(signal.details)}`,
        );
        break;
      case 'HIGH':
        this.logger.warn(
          `FRAUD HIGH [${signal.signalType}] device=${signal.deviceId}: ${JSON.stringify(signal.details)}`,
        );
        break;
      case 'MEDIUM':
        this.logger.warn(
          `FRAUD MEDIUM [${signal.signalType}] device=${signal.deviceId}`,
        );
        break;
      default:
        this.logger.debug(
          `FRAUD LOW [${signal.signalType}] device=${signal.deviceId}`,
        );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule: F001 — Impossible impression rate
  // ──────────────────────────────────────────────────────────────────────────

  /** Track impressions per device per hour. Called for each proof batch. */
  checkVolumeAnomaly(deviceId: string, batchSize: number): void {
    const hourBucket = Math.floor(Date.now() / 3600000);
    const key = `${deviceId}:${hourBucket}`;

    const current = (this.deviceHourlyCounters.get(key) ?? 0) + batchSize;
    this.deviceHourlyCounters.set(key, current);

    if (current > this.maxImpressionsPerHour) {
      this.reportSignal({
        signalType: 'IMPOSSIBLE_RATE',
        severity: 'HIGH',
        deviceId,
        details: {
          observedRate: current,
          maxAllowed: this.maxImpressionsPerHour,
          hourBucket,
        },
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule: F009 — Time drift detection
  // ──────────────────────────────────────────────────────────────────────────

  /** Check if device-reported time drifts from server time. */
  checkTimeDrift(deviceId: string, deviceTimestamp: Date): void {
    const drift = Math.abs(Date.now() - deviceTimestamp.getTime());
    if (drift > this.maxTimeDriftMs) {
      this.reportSignal({
        signalType: 'TIME_DRIFT',
        severity: 'MEDIUM',
        deviceId,
        details: {
          driftMs: drift,
          maxAllowedMs: this.maxTimeDriftMs,
          deviceTime: deviceTimestamp.toISOString(),
          serverTime: new Date().toISOString(),
        },
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule: F010 — Budget exceeded
  // ──────────────────────────────────────────────────────────────────────────

  /** Check if a campaign has exceeded its budget. Auto-pauses if so. */
  async checkBudgetExceeded(campaignId: string): Promise<boolean> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { budgetCents: true, spentCents: true, status: true },
    });

    if (!campaign || campaign.status !== 'ACTIVE') return false;

    if (campaign.spentCents >= campaign.budgetCents) {
      // Auto-pause the campaign
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'FINISHED' },
      });

      this.reportSignal({
        signalType: 'BUDGET_EXCEEDED',
        severity: 'LOW',
        deviceId: 'system',
        details: {
          campaignId,
          budgetCents: campaign.budgetCents,
          spentCents: campaign.spentCents,
        },
      });

      this.logger.log(
        `Campaign ${campaignId} auto-finished: budget exhausted (${campaign.spentCents}/${campaign.budgetCents} cents)`,
      );
      return true;
    }

    return false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Alert queries
  // ──────────────────────────────────────────────────────────────────────────

  /** Get recent fraud alerts (for admin dashboard). */
  getAlerts(params?: {
    severity?: string;
    deviceId?: string;
    limit?: number;
    unresolved?: boolean;
  }): FraudAlert[] {
    let result = [...this.alerts];

    if (params?.severity) {
      result = result.filter((a) => a.signal.severity === params.severity);
    }
    if (params?.deviceId) {
      result = result.filter((a) => a.signal.deviceId === params.deviceId);
    }
    if (params?.unresolved) {
      result = result.filter((a) => !a.resolved);
    }

    result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const limit = params?.limit ?? 100;
    return result.slice(0, limit);
  }

  /** Get alert counts by severity (for dashboard summary). */
  getAlertSummary(): Record<string, number> {
    const summary: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    for (const alert of this.alerts) {
      if (!alert.resolved) {
        summary[alert.signal.severity] =
          (summary[alert.signal.severity] ?? 0) + 1;
      }
    }

    return summary;
  }

  /** Resolve an alert by ID. */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) return false;
    alert.resolved = true;
    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Batch analysis (for background worker)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Run batch fraud analysis on recent diffusion logs.
   * Called periodically by a background job (every 15 min).
   */
  async runBatchAnalysis(windowMinutes: number = 60): Promise<{
    analyzed: number;
    alertsGenerated: number;
  }> {
    const since = new Date(Date.now() - windowMinutes * 60000);
    let alertsGenerated = 0;

    // F007: Volume spike detection (>3 sigma per device)
    const volumeData = await this.prisma.diffusionLog.groupBy({
      by: ['deviceId'],
      where: { startTime: { gte: since } },
      _count: { id: true },
    });

    const counts = volumeData.map((v) => v._count.id);
    const mean = counts.length > 0
      ? counts.reduce((a, b) => a + b, 0) / counts.length
      : 0;
    const stddev = counts.length > 1
      ? Math.sqrt(
          counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) /
            (counts.length - 1),
        )
      : 0;

    if (stddev > 0) {
      for (const row of volumeData) {
        const zScore = (row._count.id - mean) / stddev;
        if (zScore > this.volumeZScoreThreshold) {
          this.reportSignal({
            signalType: 'VOLUME_SPIKE',
            severity: 'HIGH',
            deviceId: row.deviceId,
            details: {
              count: row._count.id,
              mean: Math.round(mean * 100) / 100,
              stddev: Math.round(stddev * 100) / 100,
              zScore: Math.round(zScore * 100) / 100,
              windowMinutes,
            },
          });
          alertsGenerated++;
        }
      }
    }

    // F003: Unverified logs (hash mismatches)
    const unverified = await this.prisma.diffusionLog.count({
      where: { startTime: { gte: since }, verified: false },
    });

    const total = await this.prisma.diffusionLog.count({
      where: { startTime: { gte: since } },
    });

    if (total > 0 && unverified / total > 0.05) {
      this.reportSignal({
        signalType: 'HIGH_UNVERIFIED_RATE',
        severity: 'HIGH',
        deviceId: 'system',
        details: {
          unverifiedCount: unverified,
          totalCount: total,
          rate: Math.round((unverified / total) * 10000) / 100,
          windowMinutes,
        },
      });
      alertsGenerated++;
    }

    this.logger.log(
      `Batch analysis complete: ${total} logs analyzed, ${alertsGenerated} alerts generated`,
    );

    return { analyzed: total, alertsGenerated };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ──────────────────────────────────────────────────────────────────────────

  private cleanupCounters(): void {
    const currentHour = Math.floor(Date.now() / 3600000);
    for (const key of this.deviceHourlyCounters.keys()) {
      const hourBucket = parseInt(key.split(':').pop() ?? '0', 10);
      if (currentHour - hourBucket > 2) {
        this.deviceHourlyCounters.delete(key);
      }
    }
  }
}
