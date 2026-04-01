import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const catScreens = await prisma.catalogueListingScreen.deleteMany({});
  console.log('CatalogueListingScreen:', catScreens.count);

  const catListings = await prisma.catalogueListing.deleteMany({});
  console.log('CatalogueListing:', catListings.count);

  const creatives = await prisma.creative.deleteMany({});
  console.log('Creatives:', creatives.count);

  const targeting = await prisma.campaignTargeting.deleteMany({});
  console.log('CampaignTargeting:', targeting.count);

  const campaigns = await prisma.campaign.deleteMany({});
  console.log('Campaigns:', campaigns.count);

  console.log('\nTout supprimé.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
