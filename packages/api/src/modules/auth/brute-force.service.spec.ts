import { ForbiddenException } from '@nestjs/common';
import { BruteForceService } from './brute-force.service';

describe('BruteForceService', () => {
  let service: BruteForceService;

  beforeEach(() => {
    service = new BruteForceService();
  });

  it('should allow login on first attempt', async () => {
    await expect(service.checkLockout('test@test.com')).resolves.toBeUndefined();
  });

  it('should not lock after fewer than 5 attempts', async () => {
    for (let i = 0; i < 4; i++) {
      await service.recordFailedAttempt('test@test.com');
    }
    await expect(service.checkLockout('test@test.com')).resolves.toBeUndefined();
  });

  it('should lock after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await service.recordFailedAttempt('test@test.com');
    }
    await expect(service.checkLockout('test@test.com')).rejects.toThrow(ForbiddenException);
  });

  it('should reset attempts on successful login', async () => {
    for (let i = 0; i < 5; i++) {
      await service.recordFailedAttempt('test@test.com');
    }
    await service.resetAttempts('test@test.com');
    await expect(service.checkLockout('test@test.com')).resolves.toBeUndefined();
  });

  it('should return lockUntil Date when locking', async () => {
    for (let i = 0; i < 4; i++) {
      await service.recordFailedAttempt('test@test.com');
    }
    const result = await service.recordFailedAttempt('test@test.com');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBeGreaterThan(Date.now());
  });

  it('should isolate attempts per email', async () => {
    for (let i = 0; i < 5; i++) {
      await service.recordFailedAttempt('user1@test.com');
    }
    await expect(service.checkLockout('user2@test.com')).resolves.toBeUndefined();
  });
});
