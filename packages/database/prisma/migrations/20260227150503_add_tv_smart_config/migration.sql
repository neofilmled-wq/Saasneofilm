-- CreateEnum
CREATE TYPE "TvDefaultTab" AS ENUM ('TNT', 'STREAMING', 'ACTIVITIES', 'SETTINGS');

-- CreateEnum
CREATE TYPE "ActivityCategory" AS ENUM ('RESTAURANT', 'SPA', 'SPORT', 'CULTURE', 'NIGHTLIFE', 'SHOPPING', 'TRANSPORT', 'OTHER');

-- CreateTable
CREATE TABLE "tv_configs" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "enabledModules" JSONB NOT NULL DEFAULT '["TNT","STREAMING","ACTIVITIES"]',
    "defaultTab" "TvDefaultTab" NOT NULL DEFAULT 'TNT',
    "partnerLogoUrl" TEXT,
    "welcomeMessage" TEXT,
    "tickerText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tv_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tv_channels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "logoUrl" TEXT,
    "streamUrl" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tv_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streaming_services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "launchUrl" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streaming_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_places" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ActivityCategory" NOT NULL DEFAULT 'OTHER',
    "imageUrl" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "orgId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tv_configs_screenId_key" ON "tv_configs"("screenId");

-- CreateIndex
CREATE INDEX "tv_configs_orgId_idx" ON "tv_configs"("orgId");

-- CreateIndex
CREATE INDEX "tv_channels_category_idx" ON "tv_channels"("category");

-- CreateIndex
CREATE INDEX "tv_channels_isActive_idx" ON "tv_channels"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "tv_channels_number_key" ON "tv_channels"("number");

-- CreateIndex
CREATE INDEX "streaming_services_isActive_sortOrder_idx" ON "streaming_services"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "activity_places_orgId_category_idx" ON "activity_places"("orgId", "category");

-- CreateIndex
CREATE INDEX "activity_places_orgId_isActive_idx" ON "activity_places"("orgId", "isActive");

-- AddForeignKey
ALTER TABLE "tv_configs" ADD CONSTRAINT "tv_configs_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tv_configs" ADD CONSTRAINT "tv_configs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_places" ADD CONSTRAINT "activity_places_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
