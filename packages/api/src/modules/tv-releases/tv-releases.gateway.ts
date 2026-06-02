import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceGateway } from '../device-gateway/device.gateway';
import type { AppRelease } from '@prisma/client';

/**
 * Pushes `tv:update:available` to every device that matches an active release.
 *
 * Not a WebSocketGateway itself — leverages DeviceGateway which already manages
 * the `/devices` namespace and the per-device socket rooms. We just compute the
 * recipient list (variant + targetScreenIds + rolloutPercent) and emit through it.
 */
@Injectable()
export class TvReleasesGateway {
  private readonly logger = new Logger(TvReleasesGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceGateway: DeviceGateway,
  ) {}

  /**
   * Notify every targeted device that a new release is live. Receivers' React
   * side forwards the event to the native bridge which runs the OTA pipeline.
   *
   * Bucketing for rolloutPercent uses a stable hash of the device serialNumber
   * so the same 10% bucket always gets canary updates and the picture is
   * deterministic across reconnects.
   */
  async broadcastUpdateAvailable(release: AppRelease) {
    // Resolve eligible devices once on the server. The Android side ALSO
    // re-applies its own rollout check, but doing it here too means we don't
    // wake up every TV in the fleet for a 10% rollout.
    const screens = await this.prisma.screen.findMany({
      where: {
        activeDeviceId: { not: null },
        ...(release.targetScreenIds.length > 0
          ? { id: { in: release.targetScreenIds } }
          : {}),
      },
      select: {
        id: true,
        activeDeviceId: true,
        activeDevice: { select: { serialNumber: true } },
      },
    });

    const payload = {
      releaseId: release.id,
      versionName: release.versionName,
      versionCode: release.versionCode,
      isRequired: release.isRequired,
    };

    let pushed = 0;
    for (const screen of screens) {
      if (!screen.activeDeviceId) continue;
      const serial = screen.activeDevice?.serialNumber ?? screen.activeDeviceId;
      if (!isInRolloutBucket(serial, release.rolloutPercent)) continue;
      await this.deviceGateway.pushToScreen(screen.id, 'tv:update:available', payload);
      pushed++;
    }

    this.logger.log(
      `Release ${release.versionName} (${release.id}) pushed to ${pushed}/${screens.length} eligible devices ` +
        `(rollout=${release.rolloutPercent}%, target=${release.targetScreenIds.length ? release.targetScreenIds.length + ' screens' : 'all'})`,
    );
  }
}

/**
 * Deterministic [0, 100) bucket for a device identifier. Stable across server
 * restarts so a device that was canary-included stays in the canary group as
 * we ramp from 10% → 50% → 100%.
 */
export function isInRolloutBucket(deviceKey: string, rolloutPercent: number): boolean {
  if (rolloutPercent >= 100) return true;
  if (rolloutPercent <= 0) return false;
  // djb2 — fast, no crypto deps, plenty for an UX-level bucket assignment.
  let hash = 5381;
  for (let i = 0; i < deviceKey.length; i++) {
    hash = ((hash << 5) + hash + deviceKey.charCodeAt(i)) | 0;
  }
  const bucket = Math.abs(hash) % 100;
  return bucket < rolloutPercent;
}
