import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const screens = await prisma.catalogueListingScreen.deleteMany({});
  console.log('CatalogueListingScreen supprimés:', screens.count);

  const listings = await prisma.catalogueListing.deleteMany({});
  console.log('CatalogueListing supprimés:', listings.count);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
