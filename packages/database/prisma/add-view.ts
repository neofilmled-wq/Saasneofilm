import { PrismaClient } from '@prisma/client';
import { createHmac } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const screen = await prisma.screen.findFirst({ where: { name: { contains: 'ception 270' } } });
  if (!screen) { console.log('Screen not found'); return; }
  console.log('Screen:', screen.id, screen.name);

  const existing = await prisma.diffusionLog.findFirst({ where: { screenId: screen.id } });
  if (!existing) { console.log('No existing log for this screen'); return; }

  const now = new Date();
  const endTime = new Date(now.getTime() + 15000);
  const payload = `${existing.deviceId}:${existing.creativeId}:${now.toISOString()}:${endTime.toISOString()}`;
  const signature = createHmac('sha256', 'neofilm-device-secret-2026').update(payload).digest('hex');

  await prisma.diffusionLog.create({
    data: {
      screenId: screen.id,
      deviceId: existing.deviceId,
      campaignId: existing.campaignId,
      creativeId: existing.creativeId,
      startTime: now,
      endTime,
      durationMs: 15000,
      triggerContext: 'SCHEDULED',
      appVersion: '2.4.1',
      mediaHash: existing.mediaHash,
      signature,
      verified: true,
    },
  });
  console.log('Done! +1 vue added');
}

main().catch(console.error).finally(() => prisma.$disconnect());
