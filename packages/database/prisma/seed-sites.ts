import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // --- Cinémas Lumière (PARTNER) ---
  const org1 = await prisma.organization.findFirst({ where: { name: 'Cinémas Lumière' } });
  if (!org1) { console.log('Cinémas Lumière not found'); return; }

  const screens1 = await prisma.screen.findMany({
    where: { partnerOrgId: org1.id, siteId: null },
    select: { id: true, name: true, city: true },
  });
  console.log(`Cinémas Lumière: ${screens1.length} screens without site`);

  const cinemaSites: Record<string, string[]> = {
    'Clermont-Ferrand': ['Cinéma Capitole', 'Cinéma Le Rio', 'Pathé Jaude'],
    'Lyon': ['Pathé Bellecour', 'UGC Confluence', 'Cinéma Lumière Terreaux'],
    'Paris': ['UGC Ciné Cité Bercy', 'Pathé Beaugrenelle', 'MK2 Bibliothèque'],
    'Marseille': ['Pathé Plan de Campagne', 'Le César Marseille'],
    'Bordeaux': ['Mégarama Bordeaux', 'UGC Ciné Cité Bordeaux'],
    'Toulouse': ['Gaumont Wilson', 'Cinéma ABC Toulouse'],
    'Nice': ['Pathé Masséna', 'Cinéma Mercury Nice'],
    'Biarritz': ['Le Royal Biarritz'],
    'Annecy': ['Pathé Annecy'],
    'Aix-en-Provence': ['Le Cézanne Aix'],
    'Montpellier': ['Gaumont Multiplexe'],
    'Nantes': ['Gaumont Nantes'],
    'Strasbourg': ['UGC Ciné Cité Strasbourg'],
    'Lille': ['UGC Ciné Cité Lille'],
  };

  // Group screens by city
  const screensByCity1 = new Map<string, typeof screens1>();
  for (const s of screens1) {
    const city = s.city || 'Autre';
    if (!screensByCity1.has(city)) screensByCity1.set(city, []);
    screensByCity1.get(city)!.push(s);
  }

  let totalAssigned = 0;

  for (const [city, screens] of screensByCity1) {
    const siteNames = cinemaSites[city] || [`Cinéma ${city}`];
    const perSite = Math.ceil(screens.length / siteNames.length);

    for (let i = 0; i < siteNames.length && i * perSite < screens.length; i++) {
      const batch = screens.slice(i * perSite, (i + 1) * perSite);
      if (batch.length === 0) continue;

      let site = await prisma.site.findFirst({ where: { name: siteNames[i], organizationId: org1.id } });
      if (!site) {
        site = await prisma.site.create({
          data: {
            name: siteNames[i],
            organizationId: org1.id,
            city,
            category: 'cinema',
          },
        });
        console.log(`  Created: ${site.name} (${city})`);
      }

      await prisma.screen.updateMany({
        where: { id: { in: batch.map(s => s.id) } },
        data: { siteId: site.id },
      });
      console.log(`    → ${batch.length} screens assigned`);
      totalAssigned += batch.length;
    }
  }

  // --- Réseau Écran Sud (PARTNER) ---
  const org2 = await prisma.organization.findFirst({ where: { name: 'Réseau Écran Sud' } });
  if (org2) {
    const screens2 = await prisma.screen.findMany({
      where: { partnerOrgId: org2.id, siteId: null },
      select: { id: true, city: true },
    });
    console.log(`\nRéseau Écran Sud: ${screens2.length} screens without site`);

    const screensByCity2 = new Map<string, typeof screens2>();
    for (const s of screens2) {
      const city = s.city || 'Autre';
      if (!screensByCity2.has(city)) screensByCity2.set(city, []);
      screensByCity2.get(city)!.push(s);
    }

    for (const [city, screens] of screensByCity2) {
      let site = await prisma.site.findFirst({ where: { organizationId: org2.id, city } });
      if (!site) {
        site = await prisma.site.create({
          data: {
            name: `Hôtel ${city} Plaza`,
            organizationId: org2.id,
            city,
            category: 'hotel',
          },
        });
        console.log(`  Created: ${site.name} (${city})`);
      }
      await prisma.screen.updateMany({
        where: { id: { in: screens.map(s => s.id) } },
        data: { siteId: site.id },
      });
      console.log(`    → ${screens.length} screens assigned`);
      totalAssigned += screens.length;
    }
  }

  console.log(`\nDone! Total assigned: ${totalAssigned}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
