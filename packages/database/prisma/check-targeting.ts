import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const campaigns = await p.campaign.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
  });

  for (const c of campaigns) {
    const targeting = await p.campaignTargeting.findFirst({
      where: { campaignId: c.id },
      include: {
        includedScreens: {
          select: { id: true, partnerOrgId: true, partnerOrg: { select: { name: true } } },
        },
      },
    });

    const byOrg = new Map<string, number>();
    for (const s of targeting?.includedScreens ?? []) {
      const name = s.partnerOrg.name;
      byOrg.set(name, (byOrg.get(name) ?? 0) + 1);
    }

    console.log(`Campaign "${c.name}" — ${targeting?.includedScreens?.length ?? 0} screens:`);
    for (const [org, count] of byOrg) {
      console.log(`  ${org}: ${count}`);
    }
  }
}

main().finally(() => p.$disconnect());
