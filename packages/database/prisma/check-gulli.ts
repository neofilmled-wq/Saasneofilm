import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const g = await p.tvChannel.findFirst({ where: { name: 'Gulli' } });
  if (g) {
    console.log(`Gulli: active=${g.isActive} url=${g.streamUrl}`);
  } else {
    console.log('Gulli NOT FOUND');
  }
}
main().catch(console.error).finally(() => p.$disconnect());
