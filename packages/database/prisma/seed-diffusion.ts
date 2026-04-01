import { PrismaClient } from '@prisma/client';
import { createHash, createHmac } from 'crypto';

const prisma = new PrismaClient();

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function hmacSignature(
  deviceId: string,
  creativeId: string,
  startTime: Date,
  endTime: Date,
  secret: string,
): string {
  const payload = `${deviceId}:${creativeId}:${startTime.toISOString()}:${endTime.toISOString()}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  );
}

const deviceSecret = 'neofilm-device-secret-2026';

async function main() {
  // Find all AD_SPOT campaigns with their targeting screens and creatives
  const adSpotCampaigns = await prisma.campaign.findMany({
    where: { type: 'AD_SPOT' },
    include: {
      targeting: {
        include: {
          includedScreens: true,
        },
      },
      creatives: true,
    },
  });

  console.log(`Found ${adSpotCampaigns.length} AD_SPOT campaigns`);

  // Get all devices (we need at least one device for the logs)
  const devices = await prisma.device.findMany({ take: 10 });
  if (devices.length === 0) {
    console.error('No devices found in DB. Cannot create DiffusionLog without a device.');
    return;
  }

  const triggers: Array<'POWER_ON' | 'OPEN_APP' | 'CHANGE_APP' | 'CATALOG_OPEN' | 'SCHEDULED' | 'MANUAL'> =
    ['SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'OPEN_APP', 'POWER_ON', 'CATALOG_OPEN'];

  let totalCreated = 0;

  for (const campaign of adSpotCampaigns) {
    const screens = campaign.targeting?.includedScreens ?? [];
    const creatives = campaign.creatives ?? [];

    if (screens.length === 0) {
      console.log(`  Campaign "${campaign.name}" (${campaign.id}) — no screens targeted, skipping`);
      continue;
    }

    if (creatives.length === 0) {
      console.log(`  Campaign "${campaign.name}" (${campaign.id}) — no creatives, skipping`);
      continue;
    }

    // Check if this campaign already has diffusion logs
    const existingCount = await prisma.diffusionLog.count({
      where: { campaignId: campaign.id },
    });
    if (existingCount > 0) {
      console.log(`  Campaign "${campaign.name}" (${campaign.id}) — already has ${existingCount} logs, skipping`);
      continue;
    }

    console.log(`  Campaign "${campaign.name}" (${campaign.id}) — ${screens.length} screens, ${creatives.length} creatives`);

    // Generate between 200-800 logs per screen (random)
    const diffusionLogData = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const now = new Date();

    for (const screen of screens) {
      const logsForScreen = 200 + Math.floor(Math.random() * 600); // 200-800 per screen
      const device = devices[Math.floor(Math.random() * devices.length)];

      for (let i = 0; i < logsForScreen; i++) {
        const creative = creatives[i % creatives.length];
        const startTime = randomDate(thirtyDaysAgo, now);
        const durationMs = (creative.durationMs ?? 15000) + Math.floor((Math.random() - 0.5) * 1000);
        const endTime = new Date(startTime.getTime() + durationMs);

        diffusionLogData.push({
          screenId: screen.id,
          deviceId: device.id,
          campaignId: campaign.id,
          creativeId: creative.id,
          startTime,
          endTime,
          durationMs,
          triggerContext: triggers[i % triggers.length],
          appVersion: '2.4.1',
          mediaHash: creative.fileHash ?? sha256(`creative-${creative.id}`),
          signature: hmacSignature(device.id, creative.id, startTime, endTime, deviceSecret),
          verified: Math.random() > 0.05,
        });
      }
    }

    // Batch insert in chunks of 100
    for (let i = 0; i < diffusionLogData.length; i += 100) {
      const chunk = diffusionLogData.slice(i, i + 100);
      await prisma.diffusionLog.createMany({ data: chunk });
    }

    console.log(`    ✅ Created ${diffusionLogData.length} diffusion logs`);
    totalCreated += diffusionLogData.length;
  }

  console.log(`\n✅ Done! Total diffusion logs created: ${totalCreated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
