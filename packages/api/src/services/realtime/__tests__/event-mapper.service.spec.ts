import { EventMapperService } from '../event-mapper.service';

describe('EventMapperService', () => {
  let mapper: EventMapperService;

  beforeEach(() => {
    mapper = new EventMapperService();
  });

  describe('Campaign mappings', () => {
    it('should resolve Campaign:created to admin + advertiser rooms', () => {
      const result = mapper.resolve('Campaign', 'created', {
        id: 'camp_1',
        advertiserOrgId: 'org_adv_1',
      });

      expect(result).not.toBeNull();
      expect(result!.clientEventName).toBe('realtime:campaign:created');
      expect(result!.actorRoleTargets).toContain('admin');
      expect(result!.actorRoleTargets).toContain('advertiser');
      expect(result!.rooms).toContain('admin');
      expect(result!.rooms).toContain('advertiser:org_adv_1');
    });

    it('should resolve Campaign:updated with device target', () => {
      const result = mapper.resolve('Campaign', 'updated', {
        id: 'camp_1',
        advertiserOrgId: 'org_adv_1',
      });

      expect(result!.actorRoleTargets).toContain('device');
    });
  });

  describe('Screen mappings', () => {
    it('should resolve Screen:updated to admin + partner rooms', () => {
      const result = mapper.resolve('Screen', 'updated', {
        id: 'screen_1',
        partnerOrgId: 'org_partner_1',
      });

      expect(result).not.toBeNull();
      expect(result!.clientEventName).toBe('realtime:screen:updated');
      expect(result!.rooms).toContain('admin');
      expect(result!.rooms).toContain('partner:org_partner_1');
    });
  });

  describe('AdPlacement mappings', () => {
    it('should resolve AdPlacement:updated to admin + screen rooms', () => {
      const result = mapper.resolve('AdPlacement', 'updated', {
        id: 'ap_1',
        screenId: 'screen_1',
      });

      expect(result).not.toBeNull();
      expect(result!.rooms).toContain('admin');
      expect(result!.rooms).toContain('screen:screen_1');
      expect(result!.actorRoleTargets).toContain('device');
    });
  });

  describe('Booking mappings', () => {
    it('should resolve Booking:created to admin + advertiser + partner rooms', () => {
      const result = mapper.resolve('Booking', 'created', {
        id: 'book_1',
        advertiserOrgId: 'org_adv_1',
        partnerOrgId: 'org_partner_1',
      });

      expect(result).not.toBeNull();
      expect(result!.rooms).toContain('admin');
      expect(result!.rooms).toContain('advertiser:org_adv_1');
      expect(result!.rooms).toContain('partner:org_partner_1');
    });
  });

  describe('edge cases', () => {
    it('should return null for untracked model', () => {
      const result = mapper.resolve('User', 'updated', { id: 'user_1' });
      expect(result).toBeNull();
    });

    it('should handle missing orgId gracefully', () => {
      const result = mapper.resolve('Campaign', 'created', { id: 'camp_1' });

      expect(result).not.toBeNull();
      expect(result!.rooms).toContain('admin');
      expect(result!.rooms).not.toContain('advertiser:undefined');
    });

    it('should handle ScreenLiveStatus mapping', () => {
      const result = mapper.resolve('ScreenLiveStatus', 'updated', {
        id: 'sls_1',
        partnerOrgId: 'org_partner_1',
      });

      expect(result).not.toBeNull();
      expect(result!.clientEventName).toBe('realtime:screenstatus:updated');
      expect(result!.actorRoleTargets).toContain('partner');
    });

    it('should handle AIWallet mapping', () => {
      const result = mapper.resolve('AIWallet', 'updated', {
        id: 'wallet_1',
        organizationId: 'org_adv_1',
      });

      expect(result).not.toBeNull();
      expect(result!.rooms).toContain('advertiser:org_adv_1');
    });
  });
});
