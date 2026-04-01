import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { page: number; limit: number; type?: string }) {
    const { page, limit, type } = params;
    const where: any = {};
    if (type) where.type = type;

    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { memberships: true, screens: true, campaigns: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organization.count({ where }),
    ]);
    return { data: organizations, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        memberships: {
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        },
        screens: { take: 10, orderBy: { createdAt: 'desc' } },
        _count: { select: { memberships: true, screens: true, campaigns: true } },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async create(data: any) {
    return this.prisma.organization.create({ data });
  }

  /**
   * Create an advertiser organization with an owner user account + membership.
   * Returns { organization, user, temporaryPassword } so admin can share credentials.
   */
  async createAdvertiserWithOwner(data: {
    name: string;
    slug: string;
    contactEmail: string;
    city?: string;
    address?: string;
    vatNumber?: string;
    ownerFirstName?: string;
    ownerLastName?: string;
  }) {
    if (!data.name?.trim()) throw new BadRequestException('Le nom est requis');
    if (!data.slug?.trim()) throw new BadRequestException('Le slug est requis');
    if (!data.contactEmail?.trim()) throw new BadRequestException("L'email de contact est requis");

    // Check slug uniqueness
    const existingSlug = await this.prisma.organization.findUnique({ where: { slug: data.slug } });
    if (existingSlug) throw new ConflictException('Ce slug est déjà utilisé');

    // Check if a user with this email already exists
    const existingUser = await this.prisma.user.findUnique({ where: { email: data.contactEmail } });

    // Generate temporary password
    const temporaryPassword = crypto.randomBytes(6).toString('base64url');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create the organization
      const organization = await tx.organization.create({
        data: {
          type: 'ADVERTISER',
          name: data.name.trim(),
          slug: data.slug.trim(),
          contactEmail: data.contactEmail.trim(),
          city: data.city?.trim() || null,
          address: data.address?.trim() || null,
          vatNumber: data.vatNumber?.trim() || null,
        },
        include: {
          _count: { select: { memberships: true, screens: true, campaigns: true } },
        },
      });

      // 2. Create or reuse user account
      let user;
      if (existingUser) {
        user = existingUser;
      } else {
        user = await tx.user.create({
          data: {
            email: data.contactEmail.trim(),
            firstName: data.ownerFirstName?.trim() || data.name.trim(),
            lastName: data.ownerLastName?.trim() || '',
            passwordHash,
            isActive: true,
          },
          select: { id: true, email: true, firstName: true, lastName: true },
        });
      }

      // 3. Create OWNER membership linking user to org (upsert in case user already exists)
      await tx.membership.upsert({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: organization.id,
          },
        },
        create: {
          userId: user.id,
          organizationId: organization.id,
          role: 'OWNER',
        },
        update: {
          role: 'OWNER',
        },
      });

      return { organization, user };
    });

    return {
      ...result.organization,
      owner: result.user,
      temporaryPassword: existingUser ? undefined : temporaryPassword,
    };
  }

  async update(id: string, data: any) {
    await this.findById(id);

    // If slug is changing, check uniqueness
    if (data.slug) {
      const existingSlug = await this.prisma.organization.findFirst({
        where: { slug: data.slug, id: { not: id } },
      });
      if (existingSlug) throw new ConflictException('Ce slug est déjà utilisé');
    }

    // Clean nullable fields
    const cleanData = { ...data };
    if (cleanData.city === '') cleanData.city = null;
    if (cleanData.address === '') cleanData.address = null;
    if (cleanData.vatNumber === '') cleanData.vatNumber = null;
    // contactEmail is required, ensure it's not null/empty
    if ('contactEmail' in cleanData && !cleanData.contactEmail?.trim()) {
      delete cleanData.contactEmail;
    }

    return this.prisma.organization.update({
      where: { id },
      data: cleanData,
      include: {
        _count: { select: { memberships: true, screens: true, campaigns: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    await this.prisma.organization.delete({ where: { id } });
    return { message: 'Organization deleted successfully' };
  }
}
