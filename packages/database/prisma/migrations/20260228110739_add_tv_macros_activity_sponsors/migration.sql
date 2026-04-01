-- CreateTable
CREATE TABLE "tv_macros" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "spotDuration15s" BOOLEAN NOT NULL DEFAULT true,
    "spotDuration30s" BOOLEAN NOT NULL DEFAULT true,
    "skipDelayMs" INTEGER NOT NULL DEFAULT 7000,
    "adRotationMs" INTEGER NOT NULL DEFAULT 15000,
    "splitRatio" INTEGER NOT NULL DEFAULT 70,
    "adOnBoot" BOOLEAN NOT NULL DEFAULT true,
    "adOnTabChange" BOOLEAN NOT NULL DEFAULT true,
    "adOnAppOpen" BOOLEAN NOT NULL DEFAULT true,
    "adOnCatalogOpen" BOOLEAN NOT NULL DEFAULT false,
    "activitiesSplit" BOOLEAN NOT NULL DEFAULT true,
    "activitiesAdNoSkip" BOOLEAN NOT NULL DEFAULT true,
    "maxAdsPerHour" INTEGER NOT NULL DEFAULT 20,
    "maxInterstitialsPerSession" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tv_macros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_sponsors" (
    "id" TEXT NOT NULL,
    "activityPlaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "priorityBoost" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tv_macros_screenId_key" ON "tv_macros"("screenId");

-- CreateIndex
CREATE INDEX "tv_macros_orgId_idx" ON "tv_macros"("orgId");

-- CreateIndex
CREATE INDEX "activity_sponsors_campaignId_idx" ON "activity_sponsors"("campaignId");

-- CreateIndex
CREATE INDEX "activity_sponsors_startDate_endDate_idx" ON "activity_sponsors"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "activity_sponsors_activityPlaceId_campaignId_key" ON "activity_sponsors"("activityPlaceId", "campaignId");

-- AddForeignKey
ALTER TABLE "tv_macros" ADD CONSTRAINT "tv_macros_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tv_macros" ADD CONSTRAINT "tv_macros_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_sponsors" ADD CONSTRAINT "activity_sponsors_activityPlaceId_fkey" FOREIGN KEY ("activityPlaceId") REFERENCES "activity_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_sponsors" ADD CONSTRAINT "activity_sponsors_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
