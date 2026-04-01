import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const campaigns = await prisma.campaign.findMany({
    include: {
      creatives: { select: { id: true, status: true, type: true } },
      targeting: { include: { _count: { select: { includedScreens: true } } } },
    },
  });

  console.log('=== Current state ===');
  for (const c of campaigns) {
    console.log(`  Campaign: ${c.name} | Status: ${c.status} | Creatives: ${c.creatives.map(cr => `${cr.type}:${cr.status}`).join(', ')}`);
    console.log(`  Targeting: ${c.targeting ? `${c.targeting._count.includedScreens} screens` : 'NONE'}`);
  }

  // Approve all creatives that are not READY
  const approvedCreatives = await prisma.creative.updateMany({
    where: { status: { not: 'READY' } },
    data: { status: 'READY' },
  });
  console.log(`\nCreatives approved: ${approvedCreatives.count}`);

  // Activate all campaigns that are not ACTIVE
  const activatedCampaigns = await prisma.campaign.updateMany({
    where: { status: { not: 'ACTIVE' } },
    data: { status: 'ACTIVE' },
  });
  console.log(`Campaigns activated: ${activatedCampaigns.count}`);

  // Publish all catalogue listings
  const publishedCatalogues = await prisma.catalogueListing.updateMany({
    where: { status: { not: 'ACTIVE' } },
    data: { status: 'ACTIVE' },
  });
  console.log(`Catalogues published: ${publishedCatalogues.count}`);

  // Check if campaigns have targeting
  const campaignsNoTargeting = await prisma.campaign.findMany({
    where: { targeting: null },
    select: { id: true, name: true },
  });
  if (campaignsNoTargeting.length > 0) {
    console.log(`\nWARNING: ${campaignsNoTargeting.length} campaigns have NO screen targeting:`);
    for (const c of campaignsNoTargeting) {
      console.log(`  - ${c.name} (${c.id})`);
    }

    // Get the paired screen
    const device = await prisma.device.findFirst({
      where: { status: 'ONLINE' },
      select: { screenId: true, screen: { select: { name: true } } },
    });

    if (device?.screenId) {
      console.log(`\nAdding targeting to paired screen: ${device.screen?.name} (${device.screenId})`);
      for (const c of campaignsNoTargeting) {
        await prisma.campaignTargeting.create({
          data: {
            campaignId: c.id,
            includedScreens: { connect: [{ id: device.screenId }] },
          },
        });
        console.log(`  ✅ Targeting added for: ${c.name}`);
      }
    }
  }

  console.log('\nDone!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
