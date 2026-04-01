import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface GhostScreenSignal {
  screenId: string;
  screenName: string;
  partnerOrgId: string;
  lastHeartbeat: Date | null;
}

export interface ImpossibleImpressionsSignal {
  screenId: string;
  count: number;
  threshold: number;
}

export interface SelfDealingSignal {
  bookingId: string;
  advertiserOrgId: string;
  partnerOrgId: string;
  sharedUserId: string;
}

export interface DeviceCloningSignal {
  deviceId: string;
  ipAddresses: string[];
  timestamp: Date;
}

export interface SpoofedLogsSignal {
  screenId: string;
  unverifiedCount: number;
}

export interface ChargebackAbuseSignal {
  advertiserOrgId: string;
  organizationName: string;
  disputeCount: number;
}

export interface FraudSignalReport {
  timestamp: Date;
  ghostScreens: GhostScreenSignal[];
  impossibleImpressions: ImpossibleImpressionsSignal[];
  selfDealing: SelfDealingSignal[];
  deviceCloning: DeviceCloningSignal[];
  spoofedLogs: SpoofedLogsSignal[];
  chargebackAbuse: ChargebackAbuseSignal[];
  totalSignals: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────────────

@Injectable()
export class FraudDetectionService {
  private readonly logger = new Logger(FraudDetectionService.name);

  /** Configurable threshold for impossible impressions per screen in 24h */
  private readonly impressionThreshold: number;

  /** Configurable threshold for unverified logs per screen in 24h */
  private readonly unverifiedLogThreshold: number;

  /** Configurable threshold for chargeback disputes in 90 days */
  private readonly chargebackDisputeThreshold: number;

  /** Configurable number of days without heartbeat for ghost screen detection */
  private readonly ghostScreenDays: number;

  constructor(private readonly prisma: PrismaService) {
    this.impressionThreshold = parseInt(
      process.env.FRAUD_IMPRESSION_THRESHOLD ?? '2000',
      10,
    );
    this.unverifiedLogThreshold = parseInt(
      process.env.FRAUD_UNVERIFIED_LOG_THRESHOLD ?? '10',
      10,
    );
    this.chargebackDisputeThreshold = parseInt(
      process.env.FRAUD_CHARGEBACK_DISPUTE_THRESHOLD ?? '2',
      10,
    );
    this.ghostScreenDays = parseInt(
      process.env.FRAUD_GHOST_SCREEN_DAYS ?? '7',
      10,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Master orchestrator
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Run ALL fraud detection checks in parallel and return a consolidated report.
   */
  async runAllChecks(): Promise<FraudSignalReport> {
    this.logger.log('Running all fraud detection checks...');

    const [
      ghostScreens,
      impossibleImpressions,
      selfDealing,
      deviceCloning,
      spoofedLogs,
      chargebackAbuse,
    ] = await Promise.all([
      this.detectGhostScreens(),
      this.detectImpossibleImpressions(),
      this.detectSelfDealing(),
      this.detectDeviceCloning(),
      this.detectSpoofedLogs(),
      this.detectChargebackAbuse(),
    ]);

    const totalSignals =
      ghostScreens.length +
      impossibleImpressions.length +
      selfDealing.length +
      deviceCloning.length +
      spoofedLogs.length +
      chargebackAbuse.length;

    this.logger.log(
      `Fraud detection complete: ${totalSignals} total signals found ` +
        `(ghost=${ghostScreens.length}, impressions=${impossibleImpressions.length}, ` +
        `selfDealing=${selfDealing.length}, cloning=${deviceCloning.length}, ` +
        `spoofed=${spoofedLogs.length}, chargeback=${chargebackAbuse.length})`,
    );

    return {
      timestamp: new Date(),
      ghostScreens,
      impossibleImpressions,
      selfDealing,
      deviceCloning,
      spoofedLogs,
      chargebackAbuse,
      totalSignals,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule: Ghost Screens
  // Screens that are ACTIVE with an ACTIVE booking but NO device heartbeats
  // in the configured window (default 7 days).
  // ──────────────────────────────────────────────────────────────────────────

  async detectGhostScreens(): Promise<GhostScreenSignal[]> {
    this.logger.debug('Checking for ghost screens...');

    const cutoff = new Date(
      Date.now() - this.ghostScreenDays * 24 * 60 * 60 * 1000,
    );

    try {
      // Find ACTIVE screens in ACTIVE bookings with no recent heartbeats
      const results: Array<{
        screen_id: string;
        screen_name: string;
        partner_org_id: string;
        last_heartbeat: Date | null;
      }> = await this.prisma.$queryRaw`
        SELECT
          s.id            AS screen_id,
          s.name          AS screen_name,
          s."partnerOrgId" AS partner_org_id,
          (
            SELECT MAX(dh.timestamp)
            FROM device_heartbeats dh
            INNER JOIN devices d ON d.id = dh."deviceId"
            WHERE d."screenId" = s.id
          ) AS last_heartbeat
        FROM screens s
        INNER JOIN booking_screens bs ON bs."screenId" = s.id
        INNER JOIN bookings b ON b.id = bs."bookingId"
        WHERE s.status = 'ACTIVE'
          AND b.status = 'ACTIVE'
          AND bs."removedAt" IS NULL
          AND (
            NOT EXISTS (
              SELECT 1
              FROM device_heartbeats dh
              INNER JOIN devices d ON d.id = dh."deviceId"
              WHERE d."screenId" = s.id
                AND dh.timestamp >= ${cutoff}
            )
          )
        GROUP BY s.id, s.name, s."partnerOrgId"
      `;

      const signals: GhostScreenSignal[] = results.map((row) => ({
        screenId: row.screen_id,
        screenName: row.screen_name,
        partnerOrgId: row.partner_org_id,
        lastHeartbeat: row.last_heartbeat,
      }));

      if (signals.length > 0) {
        this.logger.warn(`Ghost screens detected: ${signals.length}`);
      }

      return signals;
    } catch (error) {
      this.logger.error(`Ghost screen detection failed: ${error}`);
      return [];
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule: Impossible Impressions
  // Screens with DiffusionLog count exceeding threshold in last 24 hours.
  // ──────────────────────────────────────────────────────────────────────────

  async detectImpossibleImpressions(): Promise<ImpossibleImpressionsSignal[]> {
    this.logger.debug('Checking for impossible impression counts...');

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      const results = await this.prisma.diffusionLog.groupBy({
        by: ['screenId'],
        where: {
          startTime: { gte: since },
        },
        _count: { id: true },
      });

      const signals: ImpossibleImpressionsSignal[] = results
        .filter((row) => row._count.id > this.impressionThreshold)
        .map((row) => ({
          screenId: row.screenId,
          count: row._count.id,
          threshold: this.impressionThreshold,
        }));

      if (signals.length > 0) {
        this.logger.warn(
          `Impossible impression counts detected on ${signals.length} screen(s)`,
        );
      }

      return signals;
    } catch (error) {
      this.logger.error(`Impossible impression detection failed: ${error}`);
      return [];
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule: Self-Dealing
  // Bookings where the advertiser org and a partner org (via BookingScreen)
  // share a common user in Memberships.
  // Uses raw query for the complex multi-table JOIN.
  // ──────────────────────────────────────────────────────────────────────────

  async detectSelfDealing(): Promise<SelfDealingSignal[]> {
    this.logger.debug('Checking for self-dealing bookings...');

    try {
      const results: Array<{
        booking_id: string;
        advertiser_org_id: string;
        partner_org_id: string;
        shared_user_id: string;
      }> = await this.prisma.$queryRaw`
        SELECT DISTINCT
          b.id              AS booking_id,
          b."advertiserOrgId" AS advertiser_org_id,
          bs."partnerOrgId"   AS partner_org_id,
          m_adv."userId"      AS shared_user_id
        FROM bookings b
        INNER JOIN booking_screens bs ON bs."bookingId" = b.id
        INNER JOIN memberships m_adv ON m_adv."organizationId" = b."advertiserOrgId"
        INNER JOIN memberships m_ptr ON m_ptr."organizationId" = bs."partnerOrgId"
        WHERE m_adv."userId" = m_ptr."userId"
          AND b.status NOT IN ('CANCELLED', 'EXPIRED')
          AND bs."removedAt" IS NULL
      `;

      const signals: SelfDealingSignal[] = results.map((row) => ({
        bookingId: row.booking_id,
        advertiserOrgId: row.advertiser_org_id,
        partnerOrgId: row.partner_org_id,
        sharedUserId: row.shared_user_id,
      }));

      if (signals.length > 0) {
        this.logger.warn(
          `Self-dealing detected in ${signals.length} booking(s)`,
        );
      }

      return signals;
    } catch (error) {
      this.logger.error(`Self-dealing detection failed: ${error}`);
      return [];
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule: Device Cloning
  // Devices that have heartbeats from multiple distinct IP addresses within
  // the same hour. Uses raw query to cross-reference Device.ipAddress
  // snapshots with heartbeat timestamps.
  // ──────────────────────────────────────────────────────────────────────────

  async detectDeviceCloning(): Promise<DeviceCloningSignal[]> {
    this.logger.debug('Checking for device cloning...');

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      // Find devices where different IPs appear in heartbeats within the same
      // hour window. Since DeviceHeartbeat does not store ipAddress directly,
      // we detect cloning by looking at devices whose ipAddress field changed
      // multiple times alongside heartbeats — using the AnalyticsEvent table
      // which stores ipAddress per event, or falling back to checking if
      // multiple devices share the same serialNumber pattern.
      //
      // Practical approach: find devices that reported heartbeats while their
      // recorded ipAddress was different from their previous heartbeat window.
      // We use a raw query that aggregates distinct device IP snapshots per
      // hour bucket from the devices table updated_at and heartbeat timestamps.
      const results: Array<{
        device_id: string;
        ip_addresses: string;
        hour_bucket: Date;
      }> = await this.prisma.$queryRaw`
        WITH heartbeat_hours AS (
          SELECT
            dh."deviceId" AS device_id,
            date_trunc('hour', dh.timestamp) AS hour_bucket,
            d."ipAddress" AS ip_address
          FROM device_heartbeats dh
          INNER JOIN devices d ON d.id = dh."deviceId"
          WHERE dh.timestamp >= ${since}
            AND d."ipAddress" IS NOT NULL
        ),
        -- Also check analytics events for the same device with different IPs
        analytics_ips AS (
          SELECT
            ae."deviceId" AS device_id,
            date_trunc('hour', ae.timestamp) AS hour_bucket,
            ae."ipAddress" AS ip_address
          FROM analytics_events ae
          WHERE ae."deviceId" IS NOT NULL
            AND ae."ipAddress" IS NOT NULL
            AND ae.timestamp >= ${since}
        ),
        combined AS (
          SELECT device_id, hour_bucket, ip_address FROM heartbeat_hours
          UNION
          SELECT device_id, hour_bucket, ip_address FROM analytics_ips
        ),
        multi_ip AS (
          SELECT
            device_id,
            hour_bucket,
            array_agg(DISTINCT ip_address) AS ip_addresses,
            count(DISTINCT ip_address) AS ip_count
          FROM combined
          GROUP BY device_id, hour_bucket
          HAVING count(DISTINCT ip_address) > 1
        )
        SELECT
          device_id,
          array_to_string(ip_addresses, ',') AS ip_addresses,
          hour_bucket
        FROM multi_ip
        ORDER BY hour_bucket DESC
      `;

      const signals: DeviceCloningSignal[] = results.map((row) => ({
        deviceId: row.device_id,
        ipAddresses: row.ip_addresses.split(','),
        timestamp: row.hour_bucket,
      }));

      if (signals.length > 0) {
        this.logger.warn(
          `Device cloning suspected on ${signals.length} device-hour pair(s)`,
        );
      }

      return signals;
    } catch (error) {
      this.logger.error(`Device cloning detection failed: ${error}`);
      return [];
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule: Spoofed Logs
  // DiffusionLogs where verified=false grouped by screenId.
  // Returns screens with >threshold unverified logs in last 24h.
  // ──────────────────────────────────────────────────────────────────────────

  async detectSpoofedLogs(): Promise<SpoofedLogsSignal[]> {
    this.logger.debug('Checking for spoofed diffusion logs...');

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      const results = await this.prisma.diffusionLog.groupBy({
        by: ['screenId'],
        where: {
          verified: false,
          startTime: { gte: since },
        },
        _count: { id: true },
      });

      const signals: SpoofedLogsSignal[] = results
        .filter((row) => row._count.id > this.unverifiedLogThreshold)
        .map((row) => ({
          screenId: row.screenId,
          unverifiedCount: row._count.id,
        }));

      if (signals.length > 0) {
        this.logger.warn(
          `Spoofed logs detected on ${signals.length} screen(s)`,
        );
      }

      return signals;
    } catch (error) {
      this.logger.error(`Spoofed logs detection failed: ${error}`);
      return [];
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule: Chargeback Abuse
  // Advertiser orgs with more than threshold dispute events in last 90 days.
  // ──────────────────────────────────────────────────────────────────────────

  async detectChargebackAbuse(): Promise<ChargebackAbuseSignal[]> {
    this.logger.debug('Checking for chargeback abuse...');

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    try {
      // StripeWebhookEvent does not directly link to an organization.
      // We parse the payload to extract the customer ID and join with
      // StripeCustomer -> Organization. Using raw query for performance.
      const results: Array<{
        advertiser_org_id: string;
        organization_name: string;
        dispute_count: string; // bigint comes as string from raw queries
      }> = await this.prisma.$queryRaw`
        SELECT
          o.id    AS advertiser_org_id,
          o.name  AS organization_name,
          COUNT(*) AS dispute_count
        FROM stripe_webhook_events swe
        INNER JOIN stripe_customers sc
          ON sc."stripeCustomerId" = swe.payload->>'customer'
             OR sc."stripeCustomerId" = swe.payload->'data'->'object'->>'customer'
        INNER JOIN organizations o
          ON o.id = sc."organizationId"
        WHERE swe."eventType" = 'charge.dispute.created'
          AND swe."createdAt" >= ${since}
          AND o.type = 'ADVERTISER'
        GROUP BY o.id, o.name
        HAVING COUNT(*) > ${this.chargebackDisputeThreshold}
      `;

      const signals: ChargebackAbuseSignal[] = results.map((row) => ({
        advertiserOrgId: row.advertiser_org_id,
        organizationName: row.organization_name,
        disputeCount: parseInt(String(row.dispute_count), 10),
      }));

      if (signals.length > 0) {
        this.logger.warn(
          `Chargeback abuse detected for ${signals.length} organization(s)`,
        );
      }

      return signals;
    } catch (error) {
      this.logger.error(`Chargeback abuse detection failed: ${error}`);
      return [];
    }
  }
}
