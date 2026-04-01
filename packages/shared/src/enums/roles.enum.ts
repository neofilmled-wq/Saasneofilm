/** Platform-level roles (on User.platformRole, nullable) — matches Prisma PlatformRole */
export enum PlatformRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  SUPPORT = 'SUPPORT',
}

/** Organization type — matches Prisma OrgType */
export enum OrgType {
  PARTNER = 'PARTNER',
  ADVERTISER = 'ADVERTISER',
}

/** Organization-level roles (on Membership.role) — matches Prisma OrgRole */
export enum OrgRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

/** @deprecated Use PlatformRole + OrgType instead. Kept for backward compatibility. */
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  SUPPORT = 'SUPPORT',
  PARTNER = 'PARTNER',
  ADVERTISER = 'ADVERTISER',
  DEVICE = 'DEVICE',
}

export enum DeviceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  PROVISIONING = 'PROVISIONING',
  ERROR = 'ERROR',
  DECOMMISSIONED = 'DECOMMISSIONED',
}

export enum CampaignStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
  FINISHED = 'FINISHED',
}

export enum CreativeType {
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
}

export enum InvoiceStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum CreativeSource {
  UPLOAD = 'UPLOAD',
  CANVA = 'CANVA',
  AI_GENERATED = 'AI_GENERATED',
}

export enum IntegrationProvider {
  CANVA = 'CANVA',
}
