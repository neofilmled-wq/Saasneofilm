import { AnomalyService } from './anomaly.service';

describe('AnomalyService', () => {
  let service: AnomalyService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      notification: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    service = new AnomalyService(mockPrisma);
  });

  it('should return false when no IP is provided', async () => {
    const result = await service.checkLoginAnomaly('user1');
    expect(result).toBe(false);
  });

  it('should return false on first login (no prior IPs to compare)', async () => {
    const result = await service.checkLoginAnomaly('user1', '1.1.1.1');
    expect(result).toBe(false);
  });

  it('should return false when logging in from same IP', async () => {
    await service.checkLoginAnomaly('user1', '1.1.1.1');
    const result = await service.checkLoginAnomaly('user1', '1.1.1.1');
    expect(result).toBe(false);
  });

  it('should detect anomaly when logging in from a new IP', async () => {
    await service.checkLoginAnomaly('user1', '1.1.1.1');
    const result = await service.checkLoginAnomaly('user1', '2.2.2.2');
    expect(result).toBe(true);
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user1',
          type: 'LOGIN_ANOMALY',
        }),
      }),
    );
  });

  it('should isolate users', async () => {
    await service.checkLoginAnomaly('user1', '1.1.1.1');
    const result = await service.checkLoginAnomaly('user2', '2.2.2.2');
    expect(result).toBe(false);
  });
});
