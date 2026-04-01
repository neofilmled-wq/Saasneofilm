import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);
  private userIps = new Map<string, Map<string, number>>();
  private readonly retentionMs = 30 * 24 * 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async checkLoginAnomaly(userId: string, ipAddress?: string): Promise<boolean> {
    if (!ipAddress) return false;
    const now = Date.now();
    let known = this.userIps.get(userId);
    if (!known) {
      known = new Map();
      this.userIps.set(userId, known);
    }
    for (const [ip, lastSeen] of known) {
      if (now - lastSeen > this.retentionMs) known.delete(ip);
    }
    const isNewIp = !known.has(ipAddress);
    known.set(ipAddress, now);
    if (isNewIp && known.size > 1) {
      this.logger.warn(`Login anomaly: user ${userId} from new IP ${ipAddress}`);
      try {
        await this.prisma.notification.create({
          data: { userId, type: 'LOGIN_ANOMALY', channel: 'IN_APP', title: 'New login location detected', message: `Login from new IP ${ipAddress} detected.`, data: { ipAddress, detectedAt: new Date().toISOString() } },
        });
      } catch (error) {
        this.logger.error(`Failed to create anomaly notification: ${error}`);
      }
      return true;
    }
    return false;
  }
}