import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PartnerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(orgId: string) {
    const profile = await this.prisma.partnerProfile.findUnique({
      where: { orgId },
      include: { org: { select: { name: true, contactEmail: true, contactPhone: true, commissionRate: true } } },
    });
    // Return an empty shell if no profile yet (first visit)
    if (!profile) {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true, contactEmail: true, contactPhone: true, commissionRate: true, address: true, city: true, postCode: true, country: true },
      });
      if (!org) throw new NotFoundException('Organization not found');
      return {
        orgId,
        companyName: org.name,
        contactEmail: org.contactEmail,
        contactPhone: org.contactPhone ?? null,
        logoUrl: null,
        address: org.address ?? null,
        city: org.city ?? null,
        postCode: org.postCode ?? null,
        country: org.country,
        latitude: null,
        longitude: null,
        timezone: 'Europe/Paris',
        isVerified: false,
        commissionRate: org.commissionRate ?? null,
      };
    }
    return { ...profile, commissionRate: profile.org.commissionRate };
  }

  async upsertProfile(orgId: string, data: {
    companyName?: string;
    logoUrl?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    city?: string;
    postCode?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
  }) {
    const allowed = ['companyName', 'logoUrl', 'contactEmail', 'contactPhone', 'address', 'city', 'postCode', 'country', 'latitude', 'longitude', 'timezone'];
    const clean: any = {};
    for (const key of allowed) {
      if ((data as any)[key] !== undefined) clean[key] = (data as any)[key];
    }

    const profile = await this.prisma.partnerProfile.upsert({
      where: { orgId },
      create: { orgId, ...clean },
      update: clean,
    });

    // Mirror name + phone + email back to the org
    const orgUpdate: any = {};
    if (data.companyName) orgUpdate.name = data.companyName;
    if (data.contactEmail) orgUpdate.contactEmail = data.contactEmail;
    if (data.contactPhone) orgUpdate.contactPhone = data.contactPhone;
    if (Object.keys(orgUpdate).length > 0) {
      await this.prisma.organization.update({ where: { id: orgId }, data: orgUpdate });
    }

    return profile;
  }
}
