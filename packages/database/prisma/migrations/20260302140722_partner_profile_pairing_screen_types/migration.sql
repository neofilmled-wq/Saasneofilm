-- CreateEnum
CREATE TYPE "ScreenType" AS ENUM ('SMART_TV', 'ANDROID_STICK', 'ANDROID_TV', 'OTHER');

-- CreateEnum
CREATE TYPE "CreativeSource" AS ENUM ('UPLOAD', 'CANVA', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('CANVA');

-- CreateEnum
CREATE TYPE "PairingRequestStatus" AS ENUM ('PENDING', 'CLAIMED', 'EXPIRED');

-- AlterTable
ALTER TABLE "creatives" ADD COLUMN     "canvaDesignId" TEXT,
ADD COLUMN     "source" "CreativeSource" NOT NULL DEFAULT 'UPLOAD';

-- AlterTable
ALTER TABLE "screens" ADD COLUMN     "capacityMaxAdvertisers" INTEGER NOT NULL DEFAULT 40,
ADD COLUMN     "screenType" "ScreenType" NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "third_party_integrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "tokenIv" TEXT NOT NULL,
    "tokenTag" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[],
    "providerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "third_party_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canva_designs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "canvaDesignId" TEXT NOT NULL,
    "title" TEXT,
    "editUrl" TEXT,
    "thumbnailUrl" TEXT,
    "lastExportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canva_designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_profiles" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "companyName" TEXT,
    "logoUrl" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "postCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'FR',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_pairing_requests" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "deviceType" "ScreenType" NOT NULL DEFAULT 'OTHER',
    "pin" TEXT NOT NULL,
    "pinExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" "PairingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "claimedAt" TIMESTAMP(3),
    "claimedByOrgId" TEXT,
    "deviceId" TEXT,
    "screenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_pairing_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "third_party_integrations_organizationId_provider_idx" ON "third_party_integrations"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "third_party_integrations_userId_organizationId_provider_key" ON "third_party_integrations"("userId", "organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "canva_designs_canvaDesignId_key" ON "canva_designs"("canvaDesignId");

-- CreateIndex
CREATE INDEX "canva_designs_organizationId_idx" ON "canva_designs"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_profiles_orgId_key" ON "partner_profiles"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "device_pairing_requests_deviceId_key" ON "device_pairing_requests"("deviceId");

-- CreateIndex
CREATE INDEX "device_pairing_requests_pin_idx" ON "device_pairing_requests"("pin");

-- CreateIndex
CREATE INDEX "device_pairing_requests_status_idx" ON "device_pairing_requests"("status");

-- CreateIndex
CREATE INDEX "device_pairing_requests_claimedByOrgId_idx" ON "device_pairing_requests"("claimedByOrgId");

-- CreateIndex
CREATE INDEX "creatives_canvaDesignId_idx" ON "creatives"("canvaDesignId");

-- AddForeignKey
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_canvaDesignId_fkey" FOREIGN KEY ("canvaDesignId") REFERENCES "canva_designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "third_party_integrations" ADD CONSTRAINT "third_party_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "third_party_integrations" ADD CONSTRAINT "third_party_integrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canva_designs" ADD CONSTRAINT "canva_designs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_profiles" ADD CONSTRAINT "partner_profiles_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_pairing_requests" ADD CONSTRAINT "device_pairing_requests_claimedByOrgId_fkey" FOREIGN KEY ("claimedByOrgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_pairing_requests" ADD CONSTRAINT "device_pairing_requests_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_pairing_requests" ADD CONSTRAINT "device_pairing_requests_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
