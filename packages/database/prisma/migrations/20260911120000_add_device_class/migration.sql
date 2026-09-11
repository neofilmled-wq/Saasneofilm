-- Legitimacy class of the TV/coworking client (real box vs browser/VM).
CREATE TYPE "DeviceClass" AS ENUM ('HARDWARE', 'EMULATOR', 'BROWSER', 'UNKNOWN');

ALTER TABLE "devices"
  ADD COLUMN "deviceClass" "DeviceClass" NOT NULL DEFAULT 'UNKNOWN';
