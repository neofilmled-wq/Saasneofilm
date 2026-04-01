import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue.constants';

export interface DeviceStatusJobData {
  type: 'CHECK_STALE' | 'CLEANUP_METRICS';
  thresholdMinutes?: number;
}

@Processor(QUEUE_NAMES.DEVICE_STATUS)
export class DeviceStatusProcessor extends WorkerHost {
  private readonly logger = new Logger(DeviceStatusProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<DeviceStatusJobData>): Promise<void> {
    const { type } = job.data;

    switch (type) {
      case 'CHECK_STALE':
        await this.checkStaleDevices(job.data.thresholdMinutes ?? 5);
        break;
      case 'CLEANUP_METRICS':
        await this.cleanupOldMetrics();
        break;
    }
  }

  private async checkStaleDevices(thresholdMinutes: number): Promise<void> {
    const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    // Mark screen live statuses as offline if heartbeat is stale
    const staleScreens = await this.prisma.screenLiveStatus.findMany({
      where: {
        isOnline: true,
        lastHeartbeatAt: { lt: threshold },
      },
      select: { screenId: true },
    });

    if (staleScreens.length > 0) {
      await this.prisma.screenLiveStatus.updateMany({
        where: {
          screenId: { in: staleScreens.map((s) => s.screenId) },
        },
        data: { isOnline: false },
      });

      this.logger.log(`Marked ${staleScreens.length} screens as offline (stale heartbeat)`);
    }
  }

  private async cleanupOldMetrics(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000); // 30 days

    const { count } = await this.prisma.deviceMetrics.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });

    if (count > 0) {
      this.logger.log(`Cleaned up ${count} old device metrics records`);
    }
  }
}
