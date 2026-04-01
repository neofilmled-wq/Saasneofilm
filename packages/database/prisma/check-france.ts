import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const chs = await p.tvChannel.findMany({ orderBy: { number: 'asc' } });
  for (const c of chs) {
    console.log(`[${c.number}] ${c.name} | active: ${c.isActive} | url: ${c.streamUrl ?? 'NULL'}`);
  }
}

main().catch(console.error).finally(() => p.$disconnect());
