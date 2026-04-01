import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const chs = await p.tvChannel.findMany({ where: { isActive: true }, orderBy: { number: 'asc' } });

  for (const ch of chs) {
    const url = ch.streamUrl || '';
    let status = 'OK';
    if (!url) status = 'NO URL';
    else if (url.startsWith('http://')) status = 'HTTP (needs proxy)';
    else if (url.includes('LeBazarDeBryan')) status = 'DEAD (GitHub redirect)';
    else if (url.includes('viamotionhsi.netplus.ch')) status = 'SWISS (may be geo-blocked)';
    else status = 'HTTPS OK';

    console.log(`[${ch.number}] ${ch.name.padEnd(20)} | ${status.padEnd(25)} | ${url.substring(0, 70)}`);
  }
}

main().catch(console.error).finally(() => p.$disconnect());
