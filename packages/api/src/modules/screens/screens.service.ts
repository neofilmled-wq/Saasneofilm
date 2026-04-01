import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminGateway } from '../admin/admin.gateway';
import { PartnerGateway } from '../partner-gateway/partner.gateway';

@Injectable()
export class ScreensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminGateway: AdminGateway,
    private readonly partnerGateway: PartnerGateway,
  ) {}

  async findAll(params: {
    page: number;
    limit: number;
    status?: string;
    partnerOrgId?: string;
    connectivity?: string;
    search?: string;
  }) {
    const { page, limit, status, partnerOrgId, search } = params;
    const where: any = {};
    if (status) where.status = status;
    if (partnerOrgId) where.partnerOrgId = partnerOrgId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [screens, total] = await Promise.all([
      this.prisma.screen.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          partnerOrg: { select: { name: true } },
          screenLiveStatus: { select: { isOnline: true, lastHeartbeatAt: true, cpuPercent: true, memoryPercent: true } },
          _count: { select: { devices: true, schedules: true, targetIncluded: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.screen.count({ where }),
    ]);
    return { data: screens, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const screen = await this.prisma.screen.findUnique({
      where: { id },
      include: {
        partnerOrg: true,
        devices: true,
        schedules: { include: { slots: true } },
        screenLiveStatus: true,
      },
    });
    if (!screen) throw new NotFoundException('Screen not found');
    return screen;
  }

  /** Pick only fields that exist on the Prisma Screen model. */
  private sanitize(data: any) {
    const allowed = [
      'name', 'externalRef', 'address', 'city', 'postCode', 'country',
      'latitude', 'longitude', 'environment', 'screenType', 'resolution',
      'orientation', 'timezone', 'status', 'monthlyPriceCents', 'currency',
      'maintenanceMode', 'maintenanceReason', 'partnerOrgId', 'activeDeviceId',
      'capacityMaxAdvertisers',
    ];
    const clean: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) clean[key] = data[key];
    }
    return clean;
  }

  async create(data: any) {
    const screen = await this.prisma.screen.create({ data: this.sanitize(data) });
    this.adminGateway.emitScreensChanged();
    this.adminGateway.emitDashboardUpdate();
    if (data.partnerOrgId) this.partnerGateway.emitScreensChanged(data.partnerOrgId);
    return screen;
  }

  async update(id: string, data: any) {
    const existing = await this.findById(id);
    const screen = await this.prisma.screen.update({ where: { id }, data: this.sanitize(data) });
    this.adminGateway.emitScreensChanged();
    this.adminGateway.emitDashboardUpdate();
    this.partnerGateway.emitScreensChanged(existing.partnerOrgId);
    return screen;
  }

  async remove(id: string) {
    const existing = await this.findById(id);
    await this.prisma.screen.delete({ where: { id } });
    this.partnerGateway.emitScreensChanged(existing.partnerOrgId);
    return { message: 'Screen deleted successfully' };
  }

  async setMaintenance(id: string, reason?: string) {
    const existing = await this.findById(id);
    const screen = await this.prisma.screen.update({
      where: { id },
      data: {
        status: 'MAINTENANCE',
        maintenanceMode: true,
        maintenanceReason: reason ?? null,
      },
    });
    this.adminGateway.emitScreensChanged();
    this.partnerGateway.emitScreensChanged(existing.partnerOrgId);
    this.partnerGateway.emitScreenStatusChanged(existing.partnerOrgId, id, 'MAINTENANCE');
    return screen;
  }

  async setDisabled(id: string) {
    const existing = await this.findById(id);
    const screen = await this.prisma.screen.update({
      where: { id },
      data: { status: 'INACTIVE', maintenanceMode: false },
    });
    this.adminGateway.emitScreensChanged();
    this.partnerGateway.emitScreensChanged(existing.partnerOrgId);
    return screen;
  }

  async publish(id: string) {
    const existing = await this.findById(id);
    const screen = await this.prisma.screen.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        maintenanceMode: false,
        maintenanceReason: null,
        approvedAt: new Date(),
      },
    });
    this.adminGateway.emitScreensChanged();
    this.partnerGateway.emitScreensChanged(existing.partnerOrgId);
    return screen;
  }

  /** Bulk create screens from CSV rows.
   *  Returns { created, errors } where errors has per-row messages.
   */
  async bulkCreate(partnerOrgId: string, rows: Array<Record<string, any>>) {
    const created: any[] = [];
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.name) throw new Error('Missing required field: name');
        const screen = await this.prisma.screen.create({
          data: this.sanitize({ ...row, partnerOrgId }),
        });
        created.push(screen);
      } catch (err: any) {
        errors.push({ row: i + 1, message: err.message ?? 'Unknown error' });
      }
    }

    if (created.length > 0) {
      this.adminGateway.emitScreensChanged();
      this.adminGateway.emitDashboardUpdate();
      this.partnerGateway.emitScreensChanged(partnerOrgId);
    }

    return { created, errors, total: rows.length };
  }

  /**
   * Approximate city-centre coordinates for French cities.
   * Used as fallback when a screen has no lat/lng in the DB.
   */
  private static readonly CITY_COORDS: Record<string, { lat: number; lng: number }> = {
    paris: { lat: 48.8566, lng: 2.3522 },
    marseille: { lat: 43.2965, lng: 5.3698 },
    lyon: { lat: 45.764, lng: 4.8357 },
    toulouse: { lat: 43.6047, lng: 1.4442 },
    nice: { lat: 43.7102, lng: 7.262 },
    nantes: { lat: 47.2184, lng: -1.5536 },
    bordeaux: { lat: 44.8378, lng: -0.5792 },
    montpellier: { lat: 43.6108, lng: 3.8767 },
    strasbourg: { lat: 48.5734, lng: 7.7521 },
    lille: { lat: 50.6292, lng: 3.0573 },
    rennes: { lat: 48.1173, lng: -1.6778 },
    reims: { lat: 49.2583, lng: 4.0317 },
    grenoble: { lat: 45.1885, lng: 5.7245 },
    dijon: { lat: 47.322, lng: 5.0415 },
    angers: { lat: 47.4784, lng: -0.5632 },
    tours: { lat: 47.3941, lng: 0.6848 },
    rouen: { lat: 49.4432, lng: 1.0993 },
    cannes: { lat: 43.5528, lng: 7.0174 },
    nancy: { lat: 48.6921, lng: 6.1844 },
    caen: { lat: 49.1829, lng: -0.3707 },
    toulon: { lat: 43.1242, lng: 5.928 },
    saint: { lat: 45.4397, lng: 4.3872 }, // Saint-Étienne prefix
    clermont: { lat: 45.7772, lng: 3.087 },
    limoges: { lat: 45.8315, lng: 1.2578 },
    amiens: { lat: 49.894, lng: 2.2957 },
    perpignan: { lat: 42.6986, lng: 2.8956 },
    metz: { lat: 49.1193, lng: 6.1757 },
    brest: { lat: 48.3905, lng: -4.4860 },
  };

  /** Resolve screen coordinates, falling back to city-centre if lat/lng are missing. */
  private resolveCoords(
    city: string | null,
    lat: number | null,
    lng: number | null,
  ): { lat: number; lng: number } | null {
    if (lat != null && lng != null) return { lat, lng };
    // Try the first word of the city name (handles "Saint-Étienne", "Aix-en-Provence" etc.)
    const key = city
      ?.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip accents
      .split(/[-\s,]/)[0] ?? '';
    return ScreensService.CITY_COORDS[key] ?? null;
  }

  /** Return ACTIVE screens with live status + occupancy for advertiser targeting map */
  async findForMap() {
    const screens = await this.prisma.screen.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        latitude: true,
        longitude: true,
        environment: true,
        screenType: true,
        status: true,
        monthlyPriceCents: true,
        currency: true,
        resolution: true,
        capacityMaxAdvertisers: true,
        partnerOrg: { select: { name: true } },
        screenLiveStatus: { select: { isOnline: true } },
        targetIncluded: {
          where: { campaign: { status: 'ACTIVE' } },
          select: { campaign: { select: { advertiserOrgId: true } } },
        },
      },
      orderBy: { city: 'asc' },
    });

    return screens.map((s) => {
      const distinctAdvertisers = new Set(
        s.targetIncluded.map((t) => t.campaign.advertiserOrgId),
      ).size;
      const cap = s.capacityMaxAdvertisers ?? 40;
      // Use stored coordinates or fall back to city-centre approximation
      const coords = this.resolveCoords(s.city, s.latitude, s.longitude);
      return {
        ...s,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        hasExactCoords: s.latitude != null && s.longitude != null,
        targetIncluded: undefined,
        occupancy: {
          advertisersCount: distinctAdvertisers,
          capacity: cap,
          remainingSlots: Math.max(0, cap - distinctAdvertisers),
          isFull: distinctAdvertisers >= cap,
          fillPercent: Math.round((distinctAdvertisers / cap) * 100),
        },
      };
    });
  }

  /** Partner-facing map: only this partner's screens with occupancy */
  async findForPartnerMap(partnerOrgId: string) {
    const screens = await this.prisma.screen.findMany({
      where: { partnerOrgId, status: { not: 'DECOMMISSIONED' } },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        latitude: true,
        longitude: true,
        environment: true,
        screenType: true,
        status: true,
        maintenanceMode: true,
        capacityMaxAdvertisers: true,
        screenLiveStatus: { select: { isOnline: true, lastHeartbeatAt: true } },
        targetIncluded: {
          where: { campaign: { status: 'ACTIVE' } },
          select: { campaign: { select: { advertiserOrgId: true } } },
        },
      },
      orderBy: { city: 'asc' },
    });

    return screens.map((s) => {
      const distinctAdvertisers = new Set(
        s.targetIncluded.map((t) => t.campaign.advertiserOrgId),
      ).size;
      const cap = s.capacityMaxAdvertisers ?? 40;
      return {
        ...s,
        targetIncluded: undefined,
        occupancy: {
          advertisersCount: distinctAdvertisers,
          capacity: cap,
          remainingSlots: Math.max(0, cap - distinctAdvertisers),
          isFull: distinctAdvertisers >= cap,
          fillPercent: Math.round((distinctAdvertisers / cap) * 100),
        },
      };
    });
  }

  /** Online / Offline / Maintenance / Disconnected counts for a partner */
  async getStatusSummary(partnerOrgId: string) {
    const screens = await this.prisma.screen.findMany({
      where: { partnerOrgId, status: { not: 'DECOMMISSIONED' } },
      select: {
        id: true,
        status: true,
        maintenanceMode: true,
        screenLiveStatus: { select: { isOnline: true, lastHeartbeatAt: true } },
      },
    });

    let online = 0;
    let offline = 0;
    let maintenance = 0;
    let needsReconnect = 0;

    const now = Date.now();
    const THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

    for (const s of screens) {
      if (s.status === 'MAINTENANCE' || s.maintenanceMode) {
        maintenance++;
        continue;
      }
      if (s.screenLiveStatus?.isOnline) {
        online++;
      } else {
        offline++;
        // Flag as "needs reconnect" if offline for > threshold
        const lastSeen = s.screenLiveStatus?.lastHeartbeatAt;
        if (lastSeen && now - new Date(lastSeen).getTime() > THRESHOLD_MS) {
          needsReconnect++;
        }
      }
    }

    return {
      total: screens.length,
      online,
      offline,
      maintenance,
      needsReconnect,
    };
  }

  /** Ranking: screens ordered by distinct active advertiser count desc */
  async getRanking(partnerOrgId: string, limit = 20) {
    const screens = await this.prisma.screen.findMany({
      where: { partnerOrgId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        screenType: true,
        capacityMaxAdvertisers: true,
        screenLiveStatus: { select: { isOnline: true } },
        targetIncluded: {
          where: { campaign: { status: 'ACTIVE' } },
          select: { campaign: { select: { advertiserOrgId: true } } },
        },
        diffusionLogs: {
          select: { id: true },
          where: {
            startTime: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
      },
    });

    const ranked = screens.map((s) => {
      const distinctAdvertisers = new Set(
        s.targetIncluded.map((t) => t.campaign.advertiserOrgId),
      ).size;
      return {
        id: s.id,
        name: s.name,
        city: s.city,
        address: s.address,
        screenType: s.screenType,
        isOnline: s.screenLiveStatus?.isOnline ?? false,
        capacityMaxAdvertisers: s.capacityMaxAdvertisers,
        advertisersCount: distinctAdvertisers,
        impressions30d: s.diffusionLogs.length,
        fillPercent: Math.round((distinctAdvertisers / (s.capacityMaxAdvertisers ?? 40)) * 100),
      };
    });

    return ranked
      .sort((a, b) => b.advertisersCount - a.advertisersCount || b.impressions30d - a.impressions30d)
      .slice(0, limit);
  }

  /**
   * Re-pair: invalidate existing device pairing for a screen and generate a fresh PIN.
   * The TV will show the pairing screen again on next heartbeat timeout.
   */
  async rePair(screenId: string, partnerOrgId: string) {
    const screen = await this.prisma.screen.findFirst({
      where: { id: screenId, partnerOrgId },
      select: { id: true, name: true, partnerOrgId: true },
    });
    if (!screen) throw new NotFoundException('Screen not found');

    // Revoke the current device token by clearing activeDeviceId
    await this.prisma.screen.update({
      where: { id: screenId },
      data: { activeDeviceId: null },
    });

    // Expire any pending pairing requests for this screen
    await this.prisma.devicePairingRequest.updateMany({
      where: { screenId, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });

    // Generate new pairing PIN
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const pinExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const pairingRequest = await this.prisma.devicePairingRequest.create({
      data: {
        screenId,
        pin,
        pinExpiresAt,
        status: 'PENDING',
        serialNumber: `re-pair-${screenId}`,
      },
    });

    this.partnerGateway.emitScreensChanged(partnerOrgId);

    return {
      screenId,
      pin,
      pinExpiresAt,
      pairingRequestId: pairingRequest.id,
    };
  }
}
