-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('PARTNER', 'ADVERTISER');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ScreenStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'SUSPENDED', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "ScreenEnvironment" AS ENUM ('CINEMA_LOBBY', 'CINEMA_HALLWAY', 'HOTEL_LOBBY', 'HOTEL_ROOM', 'RESTAURANT', 'RETAIL', 'OUTDOOR', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'PROVISIONING', 'ERROR', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('AD_SPOT', 'CATALOG_LISTING');

-- CreateEnum
CREATE TYPE "CreativeType" AS ENUM ('VIDEO', 'IMAGE');

-- CreateEnum
CREATE TYPE "CreativeStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UptimePolicy" AS ENUM ('PAY_REGARDLESS', 'PAY_PRO_RATA_UPTIME', 'PAY_ONLY_IF_DELIVERED');

-- CreateEnum
CREATE TYPE "ResumePolicy" AS ENUM ('AUTO_RESUME', 'MANUAL_RESUME');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'UNPAID', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "RevenueShareStatus" AS ENUM ('PENDING', 'CALCULATED', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "DiffusionTrigger" AS ENUM ('POWER_ON', 'OPEN_APP', 'CHANGE_APP', 'CATALOG_OPEN', 'SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "AITransactionType" AS ENUM ('RECHARGE', 'USAGE', 'REFUND', 'BONUS', 'EXPIRY');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "platformRole" "PlatformRole",
    "emailVerifiedAt" TIMESTAMP(3),
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaBackupCodesHash" TEXT[],
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "type" "OrgType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "address" TEXT,
    "city" TEXT,
    "postCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'FR',
    "vatNumber" TEXT,
    "billingAddress" TEXT,
    "siretNumber" TEXT,
    "stripeConnectAccountId" TEXT,
    "stripeCustomerId" TEXT,
    "commissionRate" DOUBLE PRECISION,
    "onboardingCompletedAt" TIMESTAMP(3),
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "flaggedAt" TIMESTAMP(3),
    "flagReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invitedBy" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screens" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalRef" TEXT,
    "address" TEXT,
    "city" TEXT,
    "postCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'FR',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "environment" "ScreenEnvironment" NOT NULL DEFAULT 'OTHER',
    "resolution" TEXT,
    "orientation" TEXT NOT NULL DEFAULT 'LANDSCAPE',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "status" "ScreenStatus" NOT NULL DEFAULT 'INACTIVE',
    "monthlyPriceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "partnerOrgId" TEXT NOT NULL,
    "activeDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'PROVISIONING',
    "macAddress" TEXT,
    "provisioningToken" TEXT,
    "pairedAt" TIMESTAMP(3),
    "unpairedAt" TIMESTAMP(3),
    "appVersion" TEXT,
    "firmwareVersion" TEXT,
    "osVersion" TEXT,
    "otaVersion" TEXT,
    "ipAddress" TEXT,
    "lastPingAt" TIMESTAMP(3),
    "screenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "CampaignType" NOT NULL DEFAULT 'AD_SPOT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "budgetCents" INTEGER NOT NULL,
    "spentCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "advertiserOrgId" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_targeting" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "geoRadiusKm" DOUBLE PRECISION,
    "geoLatitude" DOUBLE PRECISION,
    "geoLongitude" DOUBLE PRECISION,
    "cities" TEXT[],
    "environments" "ScreenEnvironment"[],
    "scheduleWindows" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_targeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creatives" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CreativeType" NOT NULL,
    "status" "CreativeStatus" NOT NULL DEFAULT 'UPLOADING',
    "fileUrl" TEXT NOT NULL,
    "fileHash" TEXT,
    "fileSizeBytes" INTEGER,
    "mimeType" TEXT,
    "durationMs" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "moderationReason" TEXT,
    "moderatedBy" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "campaignId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "screenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_slots" (
    "id" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "dayOfWeek" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scheduleId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'DRAFT',
    "monthlyPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "stripeSubscriptionId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "resumePolicy" "ResumePolicy" NOT NULL DEFAULT 'AUTO_RESUME',
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "advertiserOrgId" TEXT NOT NULL,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_screens" (
    "id" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "bookingId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "partnerOrgId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_screens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_customers" (
    "id" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_subscriptions" (
    "id" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "customerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_invoices" (
    "id" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "amountDueCents" INTEGER NOT NULL,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "hostedUrl" TEXT,
    "pdfUrl" TEXT,
    "customerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lineItems" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_payments" (
    "id" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "paymentMethod" TEXT,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_rules" (
    "id" TEXT NOT NULL,
    "platformRate" DOUBLE PRECISION NOT NULL,
    "partnerRate" DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "partnerOrgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_shares" (
    "id" TEXT NOT NULL,
    "status" "RevenueShareStatus" NOT NULL DEFAULT 'PENDING',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalRevenueCents" INTEGER NOT NULL,
    "platformShareCents" INTEGER NOT NULL,
    "partnerShareCents" INTEGER NOT NULL,
    "platformRate" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "calculatedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "partnerOrgId" TEXT NOT NULL,
    "payoutId" TEXT,
    "invoiceId" TEXT,
    "breakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "stripeTransferId" TEXT,
    "stripePayoutId" TEXT,
    "failureReason" TEXT,
    "partnerOrgId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_payout_profiles" (
    "id" TEXT NOT NULL,
    "stripeConnectAccountId" TEXT NOT NULL,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "uptimePolicy" "UptimePolicy" NOT NULL DEFAULT 'PAY_REGARDLESS',
    "partnerOrgId" TEXT NOT NULL,
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_payout_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vatNumber" TEXT,
    "vatNumberValid" BOOLEAN NOT NULL DEFAULT false,
    "vatValidatedAt" TIMESTAMP(3),
    "taxExempt" BOOLEAN NOT NULL DEFAULT false,
    "taxCountry" TEXT NOT NULL DEFAULT 'FR',
    "taxRegion" TEXT,
    "stripeTaxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_share_line_items" (
    "id" TEXT NOT NULL,
    "revenueShareId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingScreenId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "screenName" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "daysActive" INTEGER NOT NULL,
    "totalDaysInPeriod" INTEGER NOT NULL,
    "proratedAmountCents" INTEGER NOT NULL,
    "finalAmountCents" INTEGER NOT NULL,
    "uptimePolicyApplied" BOOLEAN NOT NULL DEFAULT false,
    "uptimeRatio" DOUBLE PRECISION,
    "verifiedDiffusionCount" INTEGER,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_share_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_line_items" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "revenueShareId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diffusion_logs" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "triggerContext" "DiffusionTrigger" NOT NULL,
    "appVersion" TEXT NOT NULL,
    "mediaHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diffusion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_heartbeats" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL,
    "appVersion" TEXT,
    "uptime" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_metrics" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "cpuPercent" DOUBLE PRECISION,
    "memoryPercent" DOUBLE PRECISION,
    "diskPercent" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "networkType" TEXT,
    "networkSpeed" DOUBLE PRECISION,
    "signalStrength" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_error_logs" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "code" TEXT,
    "message" TEXT NOT NULL,
    "stackTrace" TEXT,
    "context" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screen_live_status" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "currentDeviceId" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "appVersion" TEXT,
    "cpuPercent" DOUBLE PRECISION,
    "memoryPercent" DOUBLE PRECISION,
    "currentCampaignId" TEXT,
    "currentCreativeId" TEXT,
    "networkType" TEXT,
    "errorCount24h" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screen_live_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_wallets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "balanceCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_transactions" (
    "id" TEXT NOT NULL,
    "type" "AITransactionType" NOT NULL,
    "credits" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "walletId" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "screenId" TEXT,
    "deviceId" TEXT,
    "campaignId" TEXT,
    "creativeId" TEXT,
    "userId" TEXT,
    "orgId" TEXT,
    "orgType" "OrgType",
    "sessionId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT,
    "orgId" TEXT,
    "oldData" JSONB,
    "newData" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_blackouts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reason" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "screenId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_blackouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_IncludedScreens" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_IncludedScreens_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ExcludedScreens" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ExcludedScreens_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_platformRole_idx" ON "users"("platformRole");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE INDEX "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_providerAccountId_key" ON "oauth_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripeConnectAccountId_key" ON "organizations"("stripeConnectAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripeCustomerId_key" ON "organizations"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "organizations_type_idx" ON "organizations"("type");

-- CreateIndex
CREATE INDEX "organizations_slug_idx" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "memberships_organizationId_idx" ON "memberships"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON "memberships"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "screens_externalRef_key" ON "screens"("externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "screens_activeDeviceId_key" ON "screens"("activeDeviceId");

-- CreateIndex
CREATE INDEX "screens_partnerOrgId_idx" ON "screens"("partnerOrgId");

-- CreateIndex
CREATE INDEX "screens_city_idx" ON "screens"("city");

-- CreateIndex
CREATE INDEX "screens_status_idx" ON "screens"("status");

-- CreateIndex
CREATE INDEX "screens_latitude_longitude_idx" ON "screens"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "devices_serialNumber_key" ON "devices"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "devices_provisioningToken_key" ON "devices"("provisioningToken");

-- CreateIndex
CREATE INDEX "devices_screenId_idx" ON "devices"("screenId");

-- CreateIndex
CREATE INDEX "devices_status_idx" ON "devices"("status");

-- CreateIndex
CREATE INDEX "devices_lastPingAt_idx" ON "devices"("lastPingAt");

-- CreateIndex
CREATE INDEX "campaigns_advertiserOrgId_idx" ON "campaigns"("advertiserOrgId");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_type_idx" ON "campaigns"("type");

-- CreateIndex
CREATE INDEX "campaigns_startDate_endDate_idx" ON "campaigns"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_targeting_campaignId_key" ON "campaign_targeting"("campaignId");

-- CreateIndex
CREATE INDEX "creatives_campaignId_idx" ON "creatives"("campaignId");

-- CreateIndex
CREATE INDEX "creatives_status_idx" ON "creatives"("status");

-- CreateIndex
CREATE INDEX "creatives_fileHash_idx" ON "creatives"("fileHash");

-- CreateIndex
CREATE INDEX "schedules_screenId_idx" ON "schedules"("screenId");

-- CreateIndex
CREATE INDEX "schedule_slots_scheduleId_startTime_endTime_idx" ON "schedule_slots"("scheduleId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "schedule_slots_campaignId_idx" ON "schedule_slots"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_stripeSubscriptionId_key" ON "bookings"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_stripeCheckoutSessionId_key" ON "bookings"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "bookings_advertiserOrgId_idx" ON "bookings"("advertiserOrgId");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "bookings_startDate_endDate_idx" ON "bookings"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "booking_screens_screenId_idx" ON "booking_screens"("screenId");

-- CreateIndex
CREATE INDEX "booking_screens_partnerOrgId_idx" ON "booking_screens"("partnerOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_screens_bookingId_screenId_key" ON "booking_screens"("bookingId", "screenId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_customers_stripeCustomerId_key" ON "stripe_customers"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "stripe_customers_organizationId_idx" ON "stripe_customers"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_subscriptions_stripeSubscriptionId_key" ON "stripe_subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "stripe_subscriptions_organizationId_idx" ON "stripe_subscriptions"("organizationId");

-- CreateIndex
CREATE INDEX "stripe_subscriptions_status_idx" ON "stripe_subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_invoices_stripeInvoiceId_key" ON "stripe_invoices"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_invoices_invoiceNumber_key" ON "stripe_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "stripe_invoices_organizationId_idx" ON "stripe_invoices"("organizationId");

-- CreateIndex
CREATE INDEX "stripe_invoices_status_idx" ON "stripe_invoices"("status");

-- CreateIndex
CREATE INDEX "stripe_invoices_periodStart_periodEnd_idx" ON "stripe_invoices"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_payments_stripePaymentIntentId_key" ON "stripe_payments"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "stripe_payments_customerId_idx" ON "stripe_payments"("customerId");

-- CreateIndex
CREATE INDEX "stripe_payments_status_idx" ON "stripe_payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_events_stripeEventId_key" ON "stripe_webhook_events"("stripeEventId");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_eventType_idx" ON "stripe_webhook_events"("eventType");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_processed_idx" ON "stripe_webhook_events"("processed");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_createdAt_idx" ON "stripe_webhook_events"("createdAt");

-- CreateIndex
CREATE INDEX "revenue_rules_partnerOrgId_idx" ON "revenue_rules"("partnerOrgId");

-- CreateIndex
CREATE INDEX "revenue_rules_effectiveFrom_effectiveTo_idx" ON "revenue_rules"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "revenue_shares_status_idx" ON "revenue_shares"("status");

-- CreateIndex
CREATE INDEX "revenue_shares_periodStart_periodEnd_idx" ON "revenue_shares"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_shares_partnerOrgId_periodStart_periodEnd_key" ON "revenue_shares"("partnerOrgId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_stripeTransferId_key" ON "payouts"("stripeTransferId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_stripePayoutId_key" ON "payouts"("stripePayoutId");

-- CreateIndex
CREATE INDEX "payouts_partnerOrgId_idx" ON "payouts"("partnerOrgId");

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "partner_payout_profiles_stripeConnectAccountId_key" ON "partner_payout_profiles"("stripeConnectAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_payout_profiles_partnerOrgId_key" ON "partner_payout_profiles"("partnerOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_profiles_organizationId_key" ON "tax_profiles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_profiles_stripeTaxId_key" ON "tax_profiles"("stripeTaxId");

-- CreateIndex
CREATE INDEX "revenue_share_line_items_revenueShareId_idx" ON "revenue_share_line_items"("revenueShareId");

-- CreateIndex
CREATE INDEX "revenue_share_line_items_bookingScreenId_idx" ON "revenue_share_line_items"("bookingScreenId");

-- CreateIndex
CREATE INDEX "revenue_share_line_items_screenId_idx" ON "revenue_share_line_items"("screenId");

-- CreateIndex
CREATE INDEX "payout_line_items_revenueShareId_idx" ON "payout_line_items"("revenueShareId");

-- CreateIndex
CREATE UNIQUE INDEX "payout_line_items_payoutId_revenueShareId_key" ON "payout_line_items"("payoutId", "revenueShareId");

-- CreateIndex
CREATE INDEX "diffusion_logs_screenId_startTime_idx" ON "diffusion_logs"("screenId", "startTime");

-- CreateIndex
CREATE INDEX "diffusion_logs_campaignId_startTime_idx" ON "diffusion_logs"("campaignId", "startTime");

-- CreateIndex
CREATE INDEX "diffusion_logs_deviceId_startTime_idx" ON "diffusion_logs"("deviceId", "startTime");

-- CreateIndex
CREATE INDEX "diffusion_logs_creativeId_startTime_idx" ON "diffusion_logs"("creativeId", "startTime");

-- CreateIndex
CREATE INDEX "diffusion_logs_startTime_idx" ON "diffusion_logs"("startTime");

-- CreateIndex
CREATE INDEX "diffusion_logs_verified_idx" ON "diffusion_logs"("verified");

-- CreateIndex
CREATE INDEX "device_heartbeats_deviceId_timestamp_idx" ON "device_heartbeats"("deviceId", "timestamp");

-- CreateIndex
CREATE INDEX "device_heartbeats_timestamp_idx" ON "device_heartbeats"("timestamp");

-- CreateIndex
CREATE INDEX "device_metrics_deviceId_timestamp_idx" ON "device_metrics"("deviceId", "timestamp");

-- CreateIndex
CREATE INDEX "device_metrics_timestamp_idx" ON "device_metrics"("timestamp");

-- CreateIndex
CREATE INDEX "device_error_logs_deviceId_timestamp_idx" ON "device_error_logs"("deviceId", "timestamp");

-- CreateIndex
CREATE INDEX "device_error_logs_severity_timestamp_idx" ON "device_error_logs"("severity", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "screen_live_status_screenId_key" ON "screen_live_status"("screenId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_wallets_organizationId_key" ON "ai_wallets"("organizationId");

-- CreateIndex
CREATE INDEX "ai_transactions_walletId_createdAt_idx" ON "ai_transactions"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_transactions_type_idx" ON "ai_transactions"("type");

-- CreateIndex
CREATE INDEX "analytics_events_eventType_timestamp_idx" ON "analytics_events"("eventType", "timestamp");

-- CreateIndex
CREATE INDEX "analytics_events_screenId_timestamp_idx" ON "analytics_events"("screenId", "timestamp");

-- CreateIndex
CREATE INDEX "analytics_events_deviceId_timestamp_idx" ON "analytics_events"("deviceId", "timestamp");

-- CreateIndex
CREATE INDEX "analytics_events_campaignId_timestamp_idx" ON "analytics_events"("campaignId", "timestamp");

-- CreateIndex
CREATE INDEX "analytics_events_orgId_timestamp_idx" ON "analytics_events"("orgId", "timestamp");

-- CreateIndex
CREATE INDEX "analytics_events_timestamp_idx" ON "analytics_events"("timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_orgId_timestamp_idx" ON "audit_logs"("orgId", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_action_timestamp_idx" ON "audit_logs"("action", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_settings_key_key" ON "platform_settings"("key");

-- CreateIndex
CREATE INDEX "schedule_blackouts_startAt_endAt_idx" ON "schedule_blackouts"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "schedule_blackouts_screenId_idx" ON "schedule_blackouts"("screenId");

-- CreateIndex
CREATE INDEX "_IncludedScreens_B_index" ON "_IncludedScreens"("B");

-- CreateIndex
CREATE INDEX "_ExcludedScreens_B_index" ON "_ExcludedScreens"("B");

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screens" ADD CONSTRAINT "screens_partnerOrgId_fkey" FOREIGN KEY ("partnerOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screens" ADD CONSTRAINT "screens_activeDeviceId_fkey" FOREIGN KEY ("activeDeviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_advertiserOrgId_fkey" FOREIGN KEY ("advertiserOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_targeting" ADD CONSTRAINT "campaign_targeting_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_advertiserOrgId_fkey" FOREIGN KEY ("advertiserOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_screens" ADD CONSTRAINT "booking_screens_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_screens" ADD CONSTRAINT "booking_screens_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_screens" ADD CONSTRAINT "booking_screens_partnerOrgId_fkey" FOREIGN KEY ("partnerOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_customers" ADD CONSTRAINT "stripe_customers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_subscriptions" ADD CONSTRAINT "stripe_subscriptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "stripe_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_subscriptions" ADD CONSTRAINT "stripe_subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_invoices" ADD CONSTRAINT "stripe_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "stripe_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_invoices" ADD CONSTRAINT "stripe_invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_payments" ADD CONSTRAINT "stripe_payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "stripe_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_payments" ADD CONSTRAINT "stripe_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "stripe_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_rules" ADD CONSTRAINT "revenue_rules_partnerOrgId_fkey" FOREIGN KEY ("partnerOrgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_shares" ADD CONSTRAINT "revenue_shares_partnerOrgId_fkey" FOREIGN KEY ("partnerOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_shares" ADD CONSTRAINT "revenue_shares_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_partnerOrgId_fkey" FOREIGN KEY ("partnerOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_payout_profiles" ADD CONSTRAINT "partner_payout_profiles_partnerOrgId_fkey" FOREIGN KEY ("partnerOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_share_line_items" ADD CONSTRAINT "revenue_share_line_items_revenueShareId_fkey" FOREIGN KEY ("revenueShareId") REFERENCES "revenue_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_line_items" ADD CONSTRAINT "payout_line_items_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_line_items" ADD CONSTRAINT "payout_line_items_revenueShareId_fkey" FOREIGN KEY ("revenueShareId") REFERENCES "revenue_shares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diffusion_logs" ADD CONSTRAINT "diffusion_logs_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diffusion_logs" ADD CONSTRAINT "diffusion_logs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diffusion_logs" ADD CONSTRAINT "diffusion_logs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diffusion_logs" ADD CONSTRAINT "diffusion_logs_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "creatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_heartbeats" ADD CONSTRAINT "device_heartbeats_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_metrics" ADD CONSTRAINT "device_metrics_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_error_logs" ADD CONSTRAINT "device_error_logs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_live_status" ADD CONSTRAINT "screen_live_status_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_wallets" ADD CONSTRAINT "ai_wallets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_transactions" ADD CONSTRAINT "ai_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "ai_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_blackouts" ADD CONSTRAINT "schedule_blackouts_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_blackouts" ADD CONSTRAINT "schedule_blackouts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IncludedScreens" ADD CONSTRAINT "_IncludedScreens_A_fkey" FOREIGN KEY ("A") REFERENCES "campaign_targeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IncludedScreens" ADD CONSTRAINT "_IncludedScreens_B_fkey" FOREIGN KEY ("B") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExcludedScreens" ADD CONSTRAINT "_ExcludedScreens_A_fkey" FOREIGN KEY ("A") REFERENCES "campaign_targeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExcludedScreens" ADD CONSTRAINT "_ExcludedScreens_B_fkey" FOREIGN KEY ("B") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
