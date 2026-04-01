import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // TF1 - no public HLS available, disable
  await prisma.tvChannel.updateMany({
    where: { name: 'TF1' },
    data: { isActive: false, streamUrl: null },
  });
  console.log('TF1: disabled (no stable public HLS stream)');

  // France 5 - use alternative stream
  await prisma.tvChannel.updateMany({
    where: { name: 'France 5' },
    data: { streamUrl: 'http://69.64.57.208/france5/mono.m3u8' },
  });
  console.log('France 5: updated to alternative stream');

  // Check all channels
  const channels = await prisma.tvChannel.findMany({
    where: { isActive: true },
    orderBy: { number: 'asc' },
  });
  console.log(`\n${channels.length} active channels`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
