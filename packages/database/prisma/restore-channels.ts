import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  // TF1 - only available as DASH (.mpd) on iptv-org
  await p.tvChannel.updateMany({
    where: { name: 'TF1' },
    data: { isActive: true, streamUrl: 'https://viamotionhsi.netplus.ch/live/eds/tf1hd/browser-dash/tf1hd.mpd' },
  });
  console.log('TF1: enabled (DASH)');

  // France 3 - only available as DASH on iptv-org
  await p.tvChannel.updateMany({
    where: { name: 'France 3' },
    data: { isActive: true, streamUrl: 'https://viamotionhsi.netplus.ch/live/eds/france3hd/browser-dash/france3hd.mpd' },
  });
  console.log('France 3: enabled (DASH)');

  // France 4 - only available as DASH on iptv-org
  await p.tvChannel.updateMany({
    where: { name: 'France 4' },
    data: { isActive: true, streamUrl: 'https://viamotionhsi.netplus.ch/live/eds/france4hd/browser-dash/france4hd.mpd' },
  });
  console.log('France 4: enabled (DASH)');

  // CNews - back to viamotionhsi (was working before)
  await p.tvChannel.updateMany({
    where: { name: 'CNews' },
    data: { streamUrl: 'https://viamotionhsi.netplus.ch/live/eds/itele/browser-HLS8/itele.m3u8' },
  });
  console.log('CNews: restored to viamotionhsi');

  const active = await p.tvChannel.count({ where: { isActive: true } });
  console.log(`\nTotal active: ${active}`);
}

main().catch(console.error).finally(() => p.$disconnect());
