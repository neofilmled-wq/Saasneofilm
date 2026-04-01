-- CreateEnum
CREATE TYPE "CatalogueStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateTable
CREATE TABLE "catalogue_listings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "imageUrl" TEXT,
    "ctaUrl" TEXT,
    "promoCode" TEXT,
    "keywords" TEXT[],
    "status" "CatalogueStatus" NOT NULL DEFAULT 'DRAFT',
    "advertiserOrgId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogue_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_listing_screens" (
    "id" TEXT NOT NULL,
    "catalogueListingId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,

    CONSTRAINT "catalogue_listing_screens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalogue_listings_advertiserOrgId_status_idx" ON "catalogue_listings"("advertiserOrgId", "status");

-- CreateIndex
CREATE INDEX "catalogue_listing_screens_screenId_idx" ON "catalogue_listing_screens"("screenId");

-- CreateIndex
CREATE UNIQUE INDEX "catalogue_listing_screens_catalogueListingId_screenId_key" ON "catalogue_listing_screens"("catalogueListingId", "screenId");

-- AddForeignKey
ALTER TABLE "catalogue_listings" ADD CONSTRAINT "catalogue_listings_advertiserOrgId_fkey" FOREIGN KEY ("advertiserOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_listing_screens" ADD CONSTRAINT "catalogue_listing_screens_catalogueListingId_fkey" FOREIGN KEY ("catalogueListingId") REFERENCES "catalogue_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_listing_screens" ADD CONSTRAINT "catalogue_listing_screens_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
