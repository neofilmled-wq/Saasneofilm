import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  await p.tvChannel.updateMany({
    where: { name: 'France 2' },
    data: { streamUrl: 'https://kiki.alkaya.fr/live/france2/mono.m3u8' },
  });
  console.log('France 2: proxied via HTTPS');

  await p.tvChannel.updateMany({
    where: { name: 'France 5' },
    data: { streamUrl: 'https://kiki.alkaya.fr/live/france5/mono.m3u8' },
  });
  console.log('France 5: proxied via HTTPS');
}

main().catch(console.error).finally(() => p.$disconnect());
