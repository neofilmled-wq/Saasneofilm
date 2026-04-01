export interface ICanvaDesign {
  id: string;
  canvaDesignId: string;
  title: string | null;
  editUrl: string | null;
  thumbnailUrl: string | null;
  lastExportedAt: string | null;
  createdAt: string;
}

export interface ICanvaExportRequest {
  format: 'png' | 'jpg' | 'mp4';
  quality?: string;
  width?: number;
  height?: number;
}

export interface ICanvaConnectionStatus {
  connected: boolean;
  providerUserId?: string;
}

export interface ICanvaDesignCreate {
  title: string;
  width: number;
  height: number;
}

export interface ICanvaExportResult {
  creativeId: string;
  fileUrl: string;
  mimeType: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  durationMs?: number;
}
