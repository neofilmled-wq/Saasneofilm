import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const creatives = await prisma.creative.deleteMany({});
  console.log('Creatives supprimés:', creatives.count);

  const targeting = await prisma.campaignTargeting.deleteMany({});
  console.log('CampaignTargeting supprimés:', targeting.count);

  const campaigns = await prisma.campaign.deleteMany({});
  console.log('Campagnes supprimées:', campaigns.count);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
