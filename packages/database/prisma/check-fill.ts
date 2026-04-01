import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const total = await p.screenFill.count();
  const nonZero = await p.screenFill.count({ where: { activeAdvertiserCount: { gt: 0 } } });
  console.log('Total ScreenFill records:', total);
  console.log('With activeAdvertiserCount > 0:', nonZero);
}

main().finally(() => p.$disconnect());
