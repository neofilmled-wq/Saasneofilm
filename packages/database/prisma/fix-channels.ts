import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Disable channels with .mpd streams (DASH not supported by hls.js)
  const updated = await prisma.tvChannel.updateMany({
    where: {
      OR: [
        { streamUrl: { endsWith: '.mpd' } },
        { streamUrl: null },
      ],
    },
    data: { isActive: false, streamUrl: null },
  });
  console.log(`Disabled ${updated.count} channels without HLS stream`);

  const active = await prisma.tvChannel.findMany({
    where: { isActive: true },
    orderBy: { number: 'asc' },
  });
  console.log(`\nActive channels (${active.length}):`);
  for (const ch of active) {
    console.log(`  [${ch.number}] ${ch.name}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
