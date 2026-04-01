import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Re-enable TF1 with DASH stream
  await prisma.tvChannel.updateMany({
    where: { name: 'TF1' },
    data: {
      isActive: true,
      streamUrl: 'https://viamotionhsi.netplus.ch/live/eds/tf1hd/browser-dash/tf1hd.mpd',
    },
  });
  console.log('TF1: enabled with DASH stream');

  // Update France 5 HD with DASH (better quality)
  await prisma.tvChannel.updateMany({
    where: { name: 'France 5' },
    data: {
      streamUrl: 'https://viamotionhsi.netplus.ch/live/eds/france5hd/browser-dash/france5hd.mpd',
    },
  });
  console.log('France 5: updated to DASH HD stream');

  const total = await prisma.tvChannel.count({ where: { isActive: true } });
  console.log(`\nTotal active channels: ${total}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
