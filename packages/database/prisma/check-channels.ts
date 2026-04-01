import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const channels = await prisma.tvChannel.findMany({
    take: 10,
    orderBy: { number: 'asc' },
  });
  console.log(`Total channels: ${await prisma.tvChannel.count()}`);
  for (const ch of channels) {
    console.log(`  [${ch.position}] ${ch.name} | url: ${ch.streamUrl?.substring(0, 80)} | type: ${ch.streamType}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
