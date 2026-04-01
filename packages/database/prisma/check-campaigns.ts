import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const campaigns = await prisma.campaign.findMany({
    include: {
      creatives: { select: { id: true, status: true, type: true, fileUrl: true } },
      targeting: { include: { includedScreens: { select: { id: true, name: true }, take: 3 } } },
    },
  });

  console.log('=== Campaigns ===');
  for (const c of campaigns) {
    console.log(`\n  Campaign: ${c.id}`);
    console.log(`  Name: ${c.name} | Type: ${c.type} | Status: ${c.status}`);
    console.log(`  Dates: ${c.startDate} → ${c.endDate}`);
    console.log(`  Budget: ${c.budgetCents} cents`);
    console.log(`  Creatives: ${c.creatives.length}`);
    for (const cr of c.creatives) {
      console.log(`    Creative: ${cr.id} | type: ${cr.type} | status: ${cr.status} | url: ${cr.fileUrl?.substring(0, 80)}`);
    }
    console.log(`  Targeting: ${c.targeting.length}`);
    for (const t of c.targeting) {
      console.log(`    Screens: ${t.includedScreens.length} (${t.includedScreens.map(s => s.name).join(', ')})`);
    }
  }

  const catalogues = await prisma.catalogueListing.findMany({
    select: { id: true, title: true, status: true, campaignId: true },
  });
  console.log('\n=== Catalogues ===');
  for (const cat of catalogues) {
    console.log(`  ${cat.id} | ${cat.title} | status: ${cat.status} | campaign: ${cat.campaignId}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
