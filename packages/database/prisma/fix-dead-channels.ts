import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const SIBPROD = 'https://raw.githubusercontent.com/Sibprod/streams/main/ressources/dm/py/hls';

const FIXES: Record<string, string | null> = {
  // DEAD channels → replace with Sibprod Dailymotion proxied streams
  'CNews':        `${SIBPROD}/cnews.m3u8`,
  'CStar':        `${SIBPROD}/cstar.m3u8`,
  'RMC Story':    `${SIBPROD}/rmcstory.m3u8`,
  'franceinfo':   `${SIBPROD}/franceinfotv.m3u8`,

  // These have no public stream at all → disable
  'France 3':     null,
  'France 4':     null,
  'Canal+':       null,
  'C8':           null,
  'M6':           null,
  'Chérie 25':    null,
};

async function main() {
  for (const [name, url] of Object.entries(FIXES)) {
    if (url) {
      await p.tvChannel.updateMany({
        where: { name },
        data: { streamUrl: url, isActive: true },
      });
      console.log(`✅ ${name}: updated`);
    } else {
      await p.tvChannel.updateMany({
        where: { name },
        data: { isActive: false, streamUrl: null },
      });
      console.log(`❌ ${name}: disabled (no public stream)`);
    }
  }

  const active = await p.tvChannel.count({ where: { isActive: true } });
  console.log(`\nTotal active: ${active}`);
}

main().catch(console.error).finally(() => p.$disconnect());
