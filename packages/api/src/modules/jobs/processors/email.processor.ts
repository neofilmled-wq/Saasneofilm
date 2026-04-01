import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';

export interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
}

@Processor(QUEUE_NAMES.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  async process(job: Job<EmailJobData>): Promise<void> {
    const { to, subject, template } = job.data;
    this.logger.log(`Processing email job ${job.id}: ${template} → ${to} (${subject})`);

    // TODO: Integrate with real email provider (SendGrid, SES, Resend)
    // For now, log the email that would be sent
    this.logger.debug(`Email sent: to=${to}, subject=${subject}, template=${template}`);
  }
}
