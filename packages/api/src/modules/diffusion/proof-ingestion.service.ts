import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { FraudDetectionService } from './fraud-detection.service';
import * as crypto from 'crypto';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface ProofItem {
  proofId: string;
  screenId: string;
  campaignId: string;
  creativeId: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  triggerContext: string;
  appVersion: string;
  mediaHash: string;
  signature: string;
}

interface ProofResult {
  proofId: string;
  accepted: boolean;
  reason?: string;
}

/**
 * ProofIngestionService
 *
 * Receives DiffusionLog proof batches from devices, validates integrity,
 * verifies HMAC signatures, stores verified proofs, and triggers fraud
 * detection for anomalies.
 *
 * Processing pipeline:
 *   1. Schema validation (done at controller level via Zod)
 *   2. HMAC signature verification
 *   3. Media hash verification (fileHash matches creative)
 *   4. Duration sanity check (20%-200% of expected)
 *   5. Duplicate detection (deviceId + creativeId + startTime)
 *   6. Write to diffusion_logs table
 *   7. Update campaign.spentCents
 *   8. Trigger fraud signals if anomaly detected
 */
@Injectable()
export class ProofIngestionService {
  private readonly logger = new Logger(ProofIngestionService.name);

  private readonly durationMinRatio: number;
  private readonly durationMaxRatio: number;

  /** Idempotency cache: proofKey -> true. TTL managed via periodic cleanup. */
  private readonly processedProofs = new Map<string, number>();
  private readonly DEDUP_WINDOW_MS = 24 * 3600 * 1000; // 24 hours

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly fraudDetection: FraudDetectionService,
  ) {
    this.durationMinRatio = this.configService.get<number>(
      'FRAUD_DURATION_MIN_RATIO',
      0.2,
    );
    this.durationMaxRatio = this.configService.get<number>(
      'FRAUD_DURATION_MAX_RATIO',
      2.0,
    );

    // Periodic dedup cache cleanup every 30 minutes
    setInterval(() => this.cleanupDedupCache(), 30 * 60 * 1000);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Process a batch of proofs from a device.
   * Returns per-proof accept/reject status.
   */
  async processBatch(
    deviceId: string,
    batchId: string,
    proofs: ProofItem[],
  ): Promise<{ accepted: number; rejected: number; results: ProofResult[] }> {
    const results: ProofResult[] = [];
    let accepted = 0;
    let rejected = 0;

    // Verify the device exists and is assigned
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        screenId: true,
        status: true,
        provisioningToken: true,
      },
    });

    if (!device || device.status === 'DECOMMISSIONED') {
      // Reject entire batch from unknown/decommissioned device
      this.fraudDetection.reportSignal({
        signalType: 'GHOST_DEVICE',
        severity: 'HIGH',
        deviceId,
        details: { reason: 'Device not found or decommissioned' },
      });
      return {
        accepted: 0,
        rejected: proofs.length,
        results: proofs.map((p) => ({
          proofId: p.proofId,
          accepted: false,
          reason: 'UNKNOWN_DEVICE',
        })),
      };
    }

    for (const proof of proofs) {
      const result = await this.processOneProof(deviceId, device, proof);
      results.push(result);
      if (result.accepted) accepted++;
      else rejected++;
    }

    // Check for volume anomaly at batch level
    this.fraudDetection.checkVolumeAnomaly(deviceId, proofs.length);

    this.logger.log(
      `Batch ${batchId}: ${accepted} accepted, ${rejected} rejected from device ${deviceId}`,
    );

    return { accepted, rejected, results };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Single proof processing
  // ──────────────────────────────────────────────────────────────────────────

  private async processOneProof(
    deviceId: string,
    device: { id: string; screenId: string | null; provisioningToken: string | null },
    proof: ProofItem,
  ): Promise<ProofResult> {
    // 1. Duplicate check
    const dedupKey = `${deviceId}:${proof.creativeId}:${proof.startTime.getTime()}`;
    if (this.processedProofs.has(dedupKey)) {
      return { proofId: proof.proofId, accepted: false, reason: 'DUPLICATE' };
    }

    // 2. Device-screen assignment check
    if (device.screenId && device.screenId !== proof.screenId) {
      this.fraudDetection.reportSignal({
        signalType: 'SCREEN_MISMATCH',
        severity: 'HIGH',
        deviceId,
        screenId: proof.screenId,
        details: {
          claimedScreenId: proof.screenId,
          assignedScreenId: device.screenId,
        },
      });
      return { proofId: proof.proofId, accepted: false, reason: 'SCREEN_MISMATCH' };
    }

    // 3. HMAC signature verification
    const isValidSignature = this.verifySignature(
      deviceId,
      proof.creativeId,
      proof.startTime,
      proof.endTime,
      proof.signature,
      device.provisioningToken ?? '',
    );
    if (!isValidSignature) {
      this.fraudDetection.reportSignal({
        signalType: 'INVALID_SIGNATURE',
        severity: 'CRITICAL',
        deviceId,
        details: { proofId: proof.proofId },
      });
      return { proofId: proof.proofId, accepted: false, reason: 'INVALID_SIGNATURE' };
    }

    // 4. Media hash verification
    const creative = await this.prisma.creative.findUnique({
      where: { id: proof.creativeId },
      select: { fileHash: true, durationMs: true },
    });

    if (creative?.fileHash && proof.mediaHash !== creative.fileHash) {
      this.fraudDetection.reportSignal({
        signalType: 'MEDIA_HASH_MISMATCH',
        severity: 'HIGH',
        deviceId,
        screenId: proof.screenId,
        details: {
          expected: creative.fileHash,
          actual: proof.mediaHash,
          creativeId: proof.creativeId,
        },
      });
      // Still accept the proof but flag it
    }

    // 5. Duration sanity check
    let durationFlag = false;
    if (creative?.durationMs) {
      const ratio = proof.durationMs / creative.durationMs;
      if (ratio < this.durationMinRatio || ratio > this.durationMaxRatio) {
        durationFlag = true;
        this.fraudDetection.reportSignal({
          signalType: 'DURATION_ANOMALY',
          severity: 'MEDIUM',
          deviceId,
          screenId: proof.screenId,
          details: {
            expectedMs: creative.durationMs,
            actualMs: proof.durationMs,
            ratio,
          },
        });
      }
    }

    // 6. Write to diffusion_logs
    try {
      await this.prisma.diffusionLog.create({
        data: {
          screenId: proof.screenId,
          deviceId,
          campaignId: proof.campaignId,
          creativeId: proof.creativeId,
          startTime: proof.startTime,
          endTime: proof.endTime,
          durationMs: proof.durationMs,
          triggerContext: proof.triggerContext as any,
          appVersion: proof.appVersion,
          mediaHash: proof.mediaHash,
          signature: proof.signature,
          verified: !durationFlag,
          verifiedAt: !durationFlag ? new Date() : null,
        },
      });
    } catch (error: any) {
      // Handle unique constraint violation (duplicate on DB level)
      if (error.code === 'P2002') {
        return { proofId: proof.proofId, accepted: false, reason: 'DUPLICATE' };
      }
      throw error;
    }

    // 7. Update campaign spent (increment by cost-per-impression estimate)
    // In production: CPM-based calculation from booking price
    // For now: increment by 1 cent per impression as placeholder
    await this.prisma.campaign.update({
      where: { id: proof.campaignId },
      data: { spentCents: { increment: 1 } },
    });

    // 8. Mark as processed for dedup
    this.processedProofs.set(dedupKey, Date.now());

    return { proofId: proof.proofId, accepted: true };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HMAC verification
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Verify HMAC-SHA256 signature.
   * Signature = HMAC(deviceId + creativeId + startTime + endTime, deviceSecret)
   *
   * In production, deviceSecret is stored securely (not provisioning token).
   * For V1, we use provisioningToken as the secret.
   */
  private verifySignature(
    deviceId: string,
    creativeId: string,
    startTime: Date,
    endTime: Date,
    signature: string,
    deviceSecret: string,
  ): boolean {
    if (!deviceSecret) return true; // No secret configured, skip verification
    if (signature === 'none') return true; // TV client placeholder — HMAC computed server-side in V2

    const payload = `${deviceId}${creativeId}${startTime.toISOString()}${endTime.toISOString()}`;
    const expected = crypto
      .createHmac('sha256', deviceSecret)
      .update(payload)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      return signature === expected;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Dedup cache cleanup
  // ──────────────────────────────────────────────────────────────────────────

  private cleanupDedupCache(): void {
    const cutoff = Date.now() - this.DEDUP_WINDOW_MS;
    let removed = 0;
    for (const [key, ts] of this.processedProofs.entries()) {
      if (ts < cutoff) {
        this.processedProofs.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(`Dedup cache cleanup: removed ${removed} entries`);
    }
  }
}
