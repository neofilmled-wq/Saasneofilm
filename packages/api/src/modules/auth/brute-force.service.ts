import { Injectable, ForbiddenException, Logger } from '@nestjs/common';

interface AttemptRecord {
  count: number;
  timestamps: number[];
  lockedUntil: number | null;
}

@Injectable()
export class BruteForceService {
  private readonly logger = new Logger(BruteForceService.name);
  private attempts = new Map<string, AttemptRecord>();
  private readonly windowMs = 30 * 60 * 1000;
  private readonly thresholds = [
    { attempts: 5, lockMinutes: 15 },
    { attempts: 10, lockMinutes: 60 },
    { attempts: 20, lockMinutes: 1440 },
  ];

  async checkLockout(email: string): Promise<void> {
    const record = this.attempts.get(email);
    if (!record || !record.lockedUntil) return;
    if (Date.now() < record.lockedUntil) {
      const remainingMs = record.lockedUntil - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      this.logger.warn(`Blocked login attempt for locked account: ${email}`);
      throw new ForbiddenException(`Account is temporarily locked. Try again in ${remainingMinutes} minute(s).`);
    }
    this.attempts.delete(email);
  }

  async recordFailedAttempt(email: string): Promise<Date | null> {
    const now = Date.now();
    let record = this.attempts.get(email);
    if (!record) {
      record = { count: 0, timestamps: [], lockedUntil: null };
      this.attempts.set(email, record);
    }
    record.timestamps = record.timestamps.filter((t) => now - t < this.windowMs);
    record.timestamps.push(now);
    record.count = record.timestamps.length;
    for (let i = this.thresholds.length - 1; i >= 0; i--) {
      const threshold = this.thresholds[i];
      if (record.count >= threshold.attempts) {
        const lockUntil = now + threshold.lockMinutes * 60 * 1000;
        record.lockedUntil = lockUntil;
        this.logger.warn(`Account locked: ${email} after ${record.count} failed attempts`);
        return new Date(lockUntil);
      }
    }
    return null;
  }

  async resetAttempts(email: string): Promise<void> {
    this.attempts.delete(email);
  }
}