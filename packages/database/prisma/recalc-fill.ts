import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Get all screens targeted by ACTIVE campaigns
  const targetings = await prisma.campaignTargeting.findMany({
    where: { campaign: { status: 'ACTIVE' } },
    include: {
      includedScreens: { select: { id: true } },
      campaign: { select: { advertiserOrgId: true } },
    },
  });

  // Build map: screenId -> Set<advertiserOrgId>
  const screenAdvMap = new Map<string, Set<string>>();
  for (const t of targetings) {
    for (const screen of t.includedScreens) {
      if (!screenAdvMap.has(screen.id)) screenAdvMap.set(screen.id, new Set());
      screenAdvMap.get(screen.id)!.add(t.campaign.advertiserOrgId);
    }
  }

  console.log(`Screens with active campaigns: ${screenAdvMap.size}`);

  let updated = 0;
  for (const [screenId, advSet] of screenAdvMap) {
    await prisma.screenFill.upsert({
      where: { screenId },
      create: { screenId, activeAdvertiserCount: advSet.size },
      update: { activeAdvertiserCount: advSet.size },
    });
    updated++;
  }

  console.log(`Updated ${updated} ScreenFill records`);

  // Show sample
  const samples = await prisma.screenFill.findMany({ take: 5, orderBy: { activeAdvertiserCount: 'desc' } });
  for (const s of samples) {
    console.log(`  Screen ${s.screenId}: ${s.activeAdvertiserCount} advertisers`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
