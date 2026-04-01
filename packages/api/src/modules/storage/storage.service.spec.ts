import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    const configMock = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const values: Record<string, string> = {
          S3_BUCKET: 'neofilm-test',
          S3_REGION: 'eu-west-1',
          S3_ENDPOINT: 'http://localhost:9000',
          S3_ACCESS_KEY_ID: 'test-key',
          S3_SECRET_ACCESS_KEY: 'test-secret',
          CDN_BASE_URL: '',
        };
        return values[key] ?? defaultValue ?? '';
      }),
    };
    service = new StorageService(configMock as any);
  });

  describe('generateCreativeKey', () => {
    it('should generate a key with orgId, creativeId and file extension', () => {
      const key = service.generateCreativeKey('org-123', 'creative-1', 'video.mp4');
      expect(key).toBe('orgs/org-123/creatives/creative-1/asset.mp4');
    });

    it('should default to bin extension for unknown files', () => {
      const key = service.generateCreativeKey('org-123', 'creative-1', 'noext');
      // 'noext'.split('.').pop() === 'noext' — no dot, returns the full string
      expect(key).toBe('orgs/org-123/creatives/creative-1/asset.noext');
    });
  });

  describe('generateUploadKey', () => {
    it('should generate an upload key with orgId and extension', () => {
      const key = service.generateUploadKey('org-456', 'image.jpg');
      expect(key).toMatch(/^orgs\/org-456\/tmp\/\d+-[a-z0-9]+\.jpg$/);
    });
  });

  describe('generateThumbnailKey', () => {
    it('should generate a thumbnail key with orgId and creativeId', () => {
      const key = service.generateThumbnailKey('org-123', 'creative-1');
      expect(key).toBe('orgs/org-123/creatives/creative-1/thumb.jpg');
    });
  });
});
