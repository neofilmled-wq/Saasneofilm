import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminGateway } from '../admin/admin.gateway';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminGateway: AdminGateway,
  ) {}

  async getOnboardingStatus(userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      include: { organization: true },
    });
    if (!membership) {
      return { completed: false, orgType: null };
    }
    return {
      completed: !!membership.organization.onboardingCompletedAt,
      orgType: membership.organization.type,
      orgId: membership.organization.id,
      orgName: membership.organization.name,
    };
  }

  async completeOnboarding(userId: string, data: any) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      include: { organization: true },
    });
    if (!membership) throw new NotFoundException('No organization found');

    const org = await this.prisma.organization.update({
      where: { id: membership.organizationId },
      data: {
        name: data.name || membership.organization.name,
        contactEmail: data.contactEmail || membership.organization.contactEmail,
        contactPhone: data.contactPhone,
        city: data.city,
        address: data.address,
        postCode: data.postCode,
        onboardingCompletedAt: new Date(),
      },
    });

    // Emit WS events
    if (org.type === 'PARTNER') this.adminGateway.emitPartnersChanged();
    if (org.type === 'ADVERTISER') this.adminGateway.emitAdvertisersChanged();
    this.adminGateway.emitDashboardUpdate();

    this.logger.log(`Onboarding completed for org ${org.name} (${org.type})`);
    return { completed: true, orgType: org.type, orgId: org.id, orgName: org.name };
  }
}
