import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerService } from './scheduler.service';
import { ProofIngestionService } from './proof-ingestion.service';
import { FraudDetectionService } from './fraud-detection.service';
import type { ScheduleBundle } from '@neofilm/shared';

/**
 * DeviceSyncService
 *
 * Orchestrates device-facing operations:
 *   - Schedule delivery (pull mode)
 *   - Proof batch ingestion (delegates to ProofIngestionService)
 *   - Heartbeat processing (writes heartbeat + metrics + live status)
 *   - Cache report analysis (prefetch/evict suggestions)
 */
@Injectable()
export class DeviceSyncService {
  private readonly logger = new Logger(DeviceSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
    private readonly proofIngestion: ProofIngestionService,
    private readonly fraudDetection: FraudDetectionService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Schedule delivery
  // ──────────────────────────────────────────────────────────────────────────

  async getScheduleForDevice(
    deviceId: string,
    sinceVersion?: number,
  ): Promise<ScheduleBundle | null> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true, screenId: true, status: true },
    });

    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }
    if (!device.screenId) {
      throw new NotFoundException(
        `Device ${deviceId} is not paired to any screen`,
      );
    }

    return this.scheduler.getSchedule(device.screenId, sinceVersion);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Proof batch ingestion
  // ──────────────────────────────────────────────────────────────────────────

  async processProofBatch(
    deviceId: string,
    batchId: string,
    proofs: any[],
  ): Promise<{
    accepted: number;
    rejected: number;
    results: Array<{ proofId: string; accepted: boolean; reason?: string }>;
  }> {
    return this.proofIngestion.processBatch(deviceId, batchId, proofs);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Heartbeat processing
  // ──────────────────────────────────────────────────────────────────────────

  async processHeartbeat(data: {
    deviceId: string;
    timestamp: Date;
    isOnline: boolean;
    appVersion: string;
    uptime?: number;
    scheduleVersion?: number;
    currentlyPlaying?: {
      campaignId: string;
      creativeId: string;
      startedAt: Date;
    };
    cacheStatus?: {
      totalBytes: number;
      usedBytes: number;
      creativesCount: number;
    };
    metrics?: {
      cpuPercent?: number;
      memoryPercent?: number;
      diskPercent?: number;
      temperature?: number;
      networkType?: string;
      networkSpeed?: number;
      signalStrength?: number;
    };
  }): Promise<{
    ack: boolean;
    serverTime: string;
    commands: Array<{ type: string; [key: string]: any }>;
  }> {
    const { deviceId } = data;

    // Check time drift
    this.fraudDetection.checkTimeDrift(deviceId, data.timestamp);

    // Resolve device
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true, screenId: true },
    });

    if (!device) {
      return { ack: false, serverTime: new Date().toISOString(), commands: [] };
    }

    // Write heartbeat
    await this.prisma.deviceHeartbeat.create({
      data: {
        deviceId,
        isOnline: data.isOnline,
        appVersion: data.appVersion,
        uptime: data.uptime,
      },
    });

    // Write metrics
    if (data.metrics) {
      await this.prisma.deviceMetrics.create({
        data: {
          deviceId,
          cpuPercent: data.metrics.cpuPercent,
          memoryPercent: data.metrics.memoryPercent,
          diskPercent: data.metrics.diskPercent,
          temperature: data.metrics.temperature,
          networkType: data.metrics.networkType,
          networkSpeed: data.metrics.networkSpeed,
          signalStrength: data.metrics.signalStrength,
        },
      });
    }

    // Update device record
    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        lastPingAt: new Date(),
        appVersion: data.appVersion,
      },
    });

    // Upsert ScreenLiveStatus projection
    if (device.screenId) {
      await this.prisma.screenLiveStatus.upsert({
        where: { screenId: device.screenId },
        update: {
          isOnline: data.isOnline,
          currentDeviceId: deviceId,
          lastHeartbeatAt: new Date(),
          appVersion: data.appVersion,
          cpuPercent: data.metrics?.cpuPercent,
          memoryPercent: data.metrics?.memoryPercent,
          currentCampaignId: data.currentlyPlaying?.campaignId,
          currentCreativeId: data.currentlyPlaying?.creativeId,
          networkType: data.metrics?.networkType,
        },
        create: {
          screenId: device.screenId,
          isOnline: data.isOnline,
          currentDeviceId: deviceId,
          lastHeartbeatAt: new Date(),
          appVersion: data.appVersion,
          cpuPercent: data.metrics?.cpuPercent,
          memoryPercent: data.metrics?.memoryPercent,
          currentCampaignId: data.currentlyPlaying?.campaignId,
          currentCreativeId: data.currentlyPlaying?.creativeId,
          networkType: data.metrics?.networkType,
        },
      });
    }

    // Check if device needs to pull a newer schedule
    const commands: Array<{ type: string; [key: string]: any }> = [];
    if (device.screenId && data.scheduleVersion !== undefined) {
      const currentVersion = this.scheduler.getScheduleVersion(device.screenId);
      if (currentVersion > data.scheduleVersion) {
        commands.push({ type: 'PULL_SCHEDULE' });
      }
    }

    return { ack: true, serverTime: new Date().toISOString(), commands };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cache report
  // ──────────────────────────────────────────────────────────────────────────

  async processCacheReport(data: {
    deviceId: string;
    cachedCreatives: Array<{
      creativeId: string;
      fileHash: string;
      bitrate: string;
      sizeBytes: number;
      cachedAt: Date;
    }>;
    totalCacheBytes: number;
    usedCacheBytes: number;
    freeCacheBytes: number;
  }): Promise<{
    ack: boolean;
    prefetchSuggestions: Array<{ creativeId: string; priority: string; reason: string }>;
    evictSuggestions: Array<{ creativeId: string; reason: string }>;
  }> {
    const device = await this.prisma.device.findUnique({
      where: { id: data.deviceId },
      select: { screenId: true },
    });

    if (!device?.screenId) {
      return { ack: true, prefetchSuggestions: [], evictSuggestions: [] };
    }

    const schedule = await this.scheduler.getSchedule(device.screenId);
    if (!schedule) {
      return { ack: true, prefetchSuggestions: [], evictSuggestions: [] };
    }

    const cachedIds = new Set(data.cachedCreatives.map((c) => c.creativeId));
    const neededIds = new Set(schedule.entries.map((e) => e.creativeId));

    // Suggest prefetch for uncached scheduled creatives
    const prefetchSuggestions = [...neededIds]
      .filter((id) => !cachedIds.has(id))
      .map((creativeId) => ({
        creativeId,
        priority: 'HIGH',
        reason: 'upcoming_schedule',
      }));

    // Suggest eviction for cached but unneeded creatives
    const evictSuggestions = data.cachedCreatives
      .filter((c) => !neededIds.has(c.creativeId) && !c.creativeId.startsWith('house_'))
      .map((c) => ({
        creativeId: c.creativeId,
        reason: 'not_in_schedule',
      }));

    return { ack: true, prefetchSuggestions, evictSuggestions };
  }
}
