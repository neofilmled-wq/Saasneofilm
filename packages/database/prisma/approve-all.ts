import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const creatives = await prisma.creative.findMany({
    select: { id: true, status: true, moderationStatus: true, type: true, name: true },
  });
  console.log('=== Creatives ===');
  for (const c of creatives) {
    console.log(`  ${c.name} | type: ${c.type} | status: ${c.status} | moderation: ${c.moderationStatus}`);
  }

  const updated = await prisma.creative.updateMany({
    where: { moderationStatus: { not: 'APPROVED' } },
    data: { moderationStatus: 'APPROVED' },
  });
  console.log(`\nCreatives approved (moderation): ${updated.count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
