import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { page: number; limit: number; platformRole?: string }) {
    const { page, limit, platformRole } = params;
    const where: any = {};
    if (platformRole) where.platformRole = platformRole;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          platformRole: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data: users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        platformRole: true,
        isActive: true,
        avatar: true,
        createdAt: true,
        lastLoginAt: true,
        memberships: {
          include: { organization: { select: { id: true, name: true, type: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async update(id: string, data: any, actor?: { id?: string; platformRole?: string }) {
    await this.findById(id);

    // Mass-assignment + privilege-escalation guard. `data` was passed to Prisma
    // verbatim, so an ADMIN could PATCH their own id with
    // { platformRole: 'SUPER_ADMIN' } and self-promote — or flip anyone's role,
    // password or verification. Only profile fields and isActive are freely
    // writable; platformRole is SUPER_ADMIN-only and can never be set on oneself.
    const ALLOWED = ['firstName', 'lastName', 'phone', 'isActive'];
    const clean: any = {};
    for (const k of ALLOWED) if (data[k] !== undefined) clean[k] = data[k];

    if (data.platformRole !== undefined) {
      const isSuperAdmin = actor?.platformRole === 'SUPER_ADMIN';
      const targetingSelf = actor?.id && actor.id === id;
      if (!isSuperAdmin) {
        throw new ForbiddenException('Seul un SUPER_ADMIN peut modifier le rôle plateforme.');
      }
      if (targetingSelf) {
        throw new ForbiddenException('Un administrateur ne peut pas modifier son propre rôle.');
      }
      clean.platformRole = data.platformRole;
    }

    return this.prisma.user.update({
      where: { id },
      data: clean,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        platformRole: true,
        isActive: true,
      },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'User deleted successfully' };
  }
}
