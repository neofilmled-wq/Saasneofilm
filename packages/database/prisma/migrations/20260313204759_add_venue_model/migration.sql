-- CreateEnum
CREATE TYPE "VenueCategory" AS ENUM ('HOTEL', 'CONCIERGERIE', 'AIRBNB', 'RESTAURANT', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductScope" AS ENUM ('DIFFUSION', 'CATALOGUE', 'BOTH');

-- CreateEnum
CREATE TYPE "VisibilityMode" AS ENUM ('PUB_ONLY', 'CATALOGUE_ONLY', 'PUB_AND_CATALOGUE');

-- CreateEnum
CREATE TYPE "AdPlacementStatus" AS ENUM ('ELIGIBLE', 'COOLDOWN', 'CAPPED', 'SERVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AdTier" AS ENUM ('FORCED', 'PREMIUM', 'STANDARD', 'HOUSE');

-- CreateEnum
CREATE TYPE "AdEventType" AS ENUM ('IMPRESSION', 'SKIP', 'COMPLETE', 'CLICK', 'ERROR', 'DECISION_SERVED', 'CACHE_HIT', 'CACHE_MISS');

-- DropIndex
DROP INDEX "catalogue_listings_advertiserOrgId_status_idx";

-- AlterTable
ALTER TABLE "booking_screens" ADD COLUMN     "productScope" "ProductScope" NOT NULL DEFAULT 'DIFFUSION';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "breakdown" JSONB,
ADD COLUMN     "catalogueTvCount" INTEGER,
ADD COLUMN     "diffusionTvCount" INTEGER,
ADD COLUMN     "durationMonths" INTEGER,
ADD COLUMN     "monthlyAmountEur" DOUBLE PRECISION,
ADD COLUMN     "productScope" "ProductScope";

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "category" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "objective" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "catalogue_listings" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "visibilityMode" "VisibilityMode" NOT NULL DEFAULT 'PUB_AND_CATALOGUE';

-- AlterTable
ALTER TABLE "partner_profiles" ADD COLUMN     "directorFullName" TEXT,
ADD COLUMN     "directorIdCardUrl" TEXT,
ADD COLUMN     "isSuspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kbisUrl" TEXT,
ADD COLUMN     "siretNumber" TEXT,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionReason" TEXT;

-- AlterTable
ALTER TABLE "screens" ADD COLUMN     "venueId" TEXT;

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "VenueCategory" NOT NULL DEFAULT 'OTHER',
    "address" TEXT,
    "city" TEXT,
    "postCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'FR',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "partnerOrgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screen_fills" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "activeAdvertiserCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screen_fills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_placements" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "tier" "AdTier" NOT NULL DEFAULT 'STANDARD',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "status" "AdPlacementStatus" NOT NULL DEFAULT 'ELIGIBLE',
    "playsToday" INTEGER NOT NULL DEFAULT 0,
    "playsThisHour" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),
    "maxPlaysPerHour" INTEGER NOT NULL DEFAULT 10,
    "maxPlaysPerDay" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_rule_sets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "campaignId" TEXT,
    "maxPlaysPerScreenPerHour" INTEGER NOT NULL DEFAULT 6,
    "maxPlaysPerScreenPerDay" INTEGER NOT NULL DEFAULT 60,
    "cooldownAfterPlayMs" INTEGER NOT NULL DEFAULT 300000,
    "noConsecutiveSameAdv" BOOLEAN NOT NULL DEFAULT true,
    "premiumRatio" INTEGER NOT NULL DEFAULT 60,
    "standardRatio" INTEGER NOT NULL DEFAULT 40,
    "maxAdvertisersPerScreen" INTEGER NOT NULL DEFAULT 40,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_rule_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_decision_cache" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "decision" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "triggerType" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "invalidatedAt" TIMESTAMP(3),
    "invalidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_decision_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_events" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "campaignId" TEXT,
    "creativeId" TEXT,
    "advertiserId" TEXT,
    "eventType" "AdEventType" NOT NULL,
    "triggerType" TEXT,
    "durationMs" INTEGER,
    "completionPercent" INTEGER,
    "skipped" BOOLEAN,
    "signature" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screen_capacity_snapshots" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "activeAdvertiserCount" INTEGER NOT NULL,
    "maxCapacity" INTEGER NOT NULL DEFAULT 40,
    "fillPercent" DOUBLE PRECISION NOT NULL,
    "topAdvertiserIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screen_capacity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "venues_partnerOrgId_idx" ON "venues"("partnerOrgId");

-- CreateIndex
CREATE INDEX "venues_city_idx" ON "venues"("city");

-- CreateIndex
CREATE UNIQUE INDEX "screen_fills_screenId_key" ON "screen_fills"("screenId");

-- CreateIndex
CREATE INDEX "ad_placements_screenId_status_idx" ON "ad_placements"("screenId", "status");

-- CreateIndex
CREATE INDEX "ad_placements_screenId_tier_priority_idx" ON "ad_placements"("screenId", "tier", "priority");

-- CreateIndex
CREATE INDEX "ad_placements_advertiserId_screenId_idx" ON "ad_placements"("advertiserId", "screenId");

-- CreateIndex
CREATE INDEX "ad_placements_lastPlayedAt_idx" ON "ad_placements"("lastPlayedAt");

-- CreateIndex
CREATE INDEX "ad_placements_cooldownUntil_idx" ON "ad_placements"("cooldownUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ad_placements_campaignId_screenId_key" ON "ad_placements"("campaignId", "screenId");

-- CreateIndex
CREATE UNIQUE INDEX "ad_rule_sets_campaignId_key" ON "ad_rule_sets"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "ad_decision_cache_screenId_key" ON "ad_decision_cache"("screenId");

-- CreateIndex
CREATE INDEX "ad_decision_cache_expiresAt_idx" ON "ad_decision_cache"("expiresAt");

-- CreateIndex
CREATE INDEX "ad_decision_cache_screenId_version_idx" ON "ad_decision_cache"("screenId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ad_events_idempotencyKey_key" ON "ad_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ad_events_screenId_timestamp_idx" ON "ad_events"("screenId", "timestamp");

-- CreateIndex
CREATE INDEX "ad_events_campaignId_timestamp_idx" ON "ad_events"("campaignId", "timestamp");

-- CreateIndex
CREATE INDEX "ad_events_deviceId_timestamp_idx" ON "ad_events"("deviceId", "timestamp");

-- CreateIndex
CREATE INDEX "ad_events_eventType_timestamp_idx" ON "ad_events"("eventType", "timestamp");

-- CreateIndex
CREATE INDEX "ad_events_advertiserId_screenId_timestamp_idx" ON "ad_events"("advertiserId", "screenId", "timestamp");

-- CreateIndex
CREATE INDEX "ad_events_timestamp_idx" ON "ad_events"("timestamp");

-- CreateIndex
CREATE INDEX "screen_capacity_snapshots_date_idx" ON "screen_capacity_snapshots"("date");

-- CreateIndex
CREATE INDEX "screen_capacity_snapshots_screenId_date_idx" ON "screen_capacity_snapshots"("screenId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "screen_capacity_snapshots_screenId_date_key" ON "screen_capacity_snapshots"("screenId", "date");

-- CreateIndex
CREATE INDEX "campaigns_groupId_idx" ON "campaigns"("groupId");

-- CreateIndex
CREATE INDEX "catalogue_listings_advertiserOrgId_status_visibilityMode_idx" ON "catalogue_listings"("advertiserOrgId", "status", "visibilityMode");

-- CreateIndex
CREATE INDEX "catalogue_listings_campaignId_idx" ON "catalogue_listings"("campaignId");

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_partnerOrgId_fkey" FOREIGN KEY ("partnerOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screens" ADD CONSTRAINT "screens_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_fills" ADD CONSTRAINT "screen_fills_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_listings" ADD CONSTRAINT "catalogue_listings_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
