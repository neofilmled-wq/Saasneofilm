import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const listings = await prisma.catalogueListing.findMany({
    include: { screens: true },
  });
  console.log('Total listings:', listings.length);
  for (const l of listings) {
    console.log('\n--- Listing:', l.id, '---');
    console.log('title:', l.title);
    console.log('description:', l.description);
    console.log('category:', l.category);
    console.log('imageUrl:', l.imageUrl);
    console.log('phone:', l.phone);
    console.log('address:', l.address);
    console.log('ctaUrl:', l.ctaUrl);
    console.log('promoCode:', l.promoCode);
    console.log('keywords:', l.keywords);
    console.log('status:', l.status);
    console.log('screens:', l.screens.length);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
