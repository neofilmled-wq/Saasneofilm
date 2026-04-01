import { CampaignStatus, CreativeType } from '../enums';

export interface ICampaign {
  id: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  startDate: Date;
  endDate: Date;
  budgetCents: number;
  currency: string;
  advertiserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreative {
  id: string;
  name: string;
  type: CreativeType;
  fileUrl: string;
  fileSizeBytes?: number;
  durationMs?: number;
  width?: number;
  height?: number;
  isApproved: boolean;
  campaignId: string;
  createdAt: Date;
  updatedAt: Date;
}
