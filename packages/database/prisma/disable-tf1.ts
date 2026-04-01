import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  await p.tvChannel.updateMany({ where: { name: 'TF1' }, data: { isActive: false, streamUrl: null } });
  console.log('TF1 disabled — no public stream available');

  // Also revert France 5 to HLS (DASH might be geo-blocked too)
  await p.tvChannel.updateMany({ where: { name: 'France 5' }, data: { streamUrl: 'http://69.64.57.208/france5/mono.m3u8' } });
  console.log('France 5 reverted to HLS');

  const active = await p.tvChannel.count({ where: { isActive: true } });
  console.log(`Active channels: ${active}`);
}

main().catch(console.error).finally(() => p.$disconnect());
