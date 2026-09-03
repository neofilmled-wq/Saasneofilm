-- CreateEnum: distinguishes Airbnb TVs (legacy app) from Coworking TVs.
CREATE TYPE "ScreenUsage" AS ENUM ('AIRBNB', 'COWORKING');

-- AlterTable: per-screen product/experience, chosen at screen creation.
ALTER TABLE "screens" ADD COLUMN "usage" "ScreenUsage" NOT NULL DEFAULT 'AIRBNB';
