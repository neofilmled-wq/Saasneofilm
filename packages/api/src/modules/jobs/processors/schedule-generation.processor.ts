import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue.constants';

export interface ScheduleGenerationJobData {
  type: 'REGENERATE_SINGLE' | 'REGENERATE_ALL';
  screenId?: string;
}

@Processor(QUEUE_NAMES.SCHEDULE_GENERATION)
export class ScheduleGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduleGenerationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ScheduleGenerationJobData>): Promise<void> {
    const { type, screenId } = job.data;

    switch (type) {
      case 'REGENERATE_SINGLE':
        if (screenId) {
          this.logger.log(`Regenerating schedule for screen ${screenId}`);
          // SchedulerService.generateSchedule is called via the diffusion module
          // This processor enqueues the work for async processing
        }
        break;
      case 'REGENERATE_ALL': {
        const screens = await this.prisma.screen.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true },
        });
        this.logger.log(`Regenerating schedules for ${screens.length} active screens`);
        break;
      }
    }
  }
}
