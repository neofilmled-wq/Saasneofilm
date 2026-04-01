import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const total = await p.screen.count();
  const byStatus = await p.screen.groupBy({ by: ['status'], _count: { id: true } });
  console.log('Total screens:', total);
  for (const g of byStatus) {
    console.log(`  ${g.status}: ${g._count.id}`);
  }

  const liveStatuses = await p.screenLiveStatus.findMany({ select: { isOnline: true } });
  const online = liveStatuses.filter(s => s.isOnline).length;
  const offline = liveStatuses.filter(s => !s.isOnline).length;
  const noStatus = total - liveStatuses.length;
  console.log(`\nLive status:`);
  console.log(`  Online: ${online}`);
  console.log(`  Offline: ${offline}`);
  console.log(`  No live status record: ${noStatus}`);
}

main().finally(() => p.$disconnect());
