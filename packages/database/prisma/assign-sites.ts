import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Get all sites for Cinémas Lumière
  const org = await prisma.organization.findFirst({ where: { name: 'Cinémas Lumière' } });
  if (!org) { console.log('Org not found'); return; }

  const existingSites = await prisma.site.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } });
  console.log(`Existing sites: ${existingSites.map(s => s.name).join(', ')}`);

  // Get all screens without a site for this org
  const orphanScreens = await prisma.screen.findMany({
    where: { partnerOrgId: org.id, siteId: null },
    select: { id: true, name: true, city: true },
  });
  console.log(`Screens without site: ${orphanScreens.length}`);

  if (orphanScreens.length === 0) {
    console.log('All screens already assigned!');
    return;
  }

  // Create new sites based on cities
  const screensByCity = new Map<string, typeof orphanScreens>();
  for (const screen of orphanScreens) {
    const city = screen.city || 'Autre';
    if (!screensByCity.has(city)) screensByCity.set(city, []);
    screensByCity.get(city)!.push(screen);
  }

  // For each city, create sites of ~20 screens each (cinema-like batches)
  const siteNames: Record<string, string[]> = {
    'Clermont-Ferrand': ['Cinéma Capitole', 'Cinéma Le Rio', 'Pathé Jaude', 'Cinéma Les Ambiances', 'Méga CGR Clermont'],
    'Lyon': ['Pathé Bellecour', 'UGC Confluence', 'Cinéma Lumière Terreaux', 'Institut Lumière'],
    'Paris': ['UGC Ciné Cité Bercy', 'Pathé Beaugrenelle', 'MK2 Bibliothèque', 'Le Grand Rex'],
    'Marseille': ['Pathé Plan de Campagne', 'Le César Marseille', 'Artplexe Canebière'],
    'Bordeaux': ['Mégarama Bordeaux', 'UGC Ciné Cité Bordeaux', 'Utopia Bordeaux'],
    'Toulouse': ['Gaumont Wilson', 'Cinéma ABC Toulouse'],
    'Nice': ['Pathé Masséna', 'Cinéma Mercury Nice'],
    'Biarritz': ['Le Royal Biarritz', 'Cinéma Le Colisée'],
    'Annecy': ['Pathé Annecy', 'Cinéma Les Nemours'],
    'Aix-en-Provence': ['Le Cézanne Aix', 'Pathé Aix'],
    'Montpellier': ['Gaumont Multiplexe', 'Diagonal Capitole'],
    'Nantes': ['Gaumont Nantes', 'Cinéma Katorza'],
    'Strasbourg': ['UGC Ciné Cité Strasbourg', 'Star Saint-Exupéry'],
    'Lille': ['UGC Ciné Cité Lille', 'Majestic Lille'],
  };

  let totalAssigned = 0;

  for (const [city, screens] of screensByCity) {
    const names = siteNames[city] || [`Cinéma ${city}`];
    const screensPerSite = Math.ceil(screens.length / names.length);

    for (let i = 0; i < names.length && i * screensPerSite < screens.length; i++) {
      const batch = screens.slice(i * screensPerSite, (i + 1) * screensPerSite);
      if (batch.length === 0) continue;

      // Check if site already exists
      let site = await prisma.site.findFirst({ where: { name: names[i], organizationId: org.id } });
      if (!site) {
        site = await prisma.site.create({
          data: {
            name: names[i],
            organizationId: org.id,
            city,
            category: 'CINEMA',
          },
        });
        console.log(`  Created site: ${site.name} (${city})`);
      }

      await prisma.screen.updateMany({
        where: { id: { in: batch.map(s => s.id) } },
        data: { siteId: site.id },
      });

      console.log(`    Assigned ${batch.length} screens to ${site.name}`);
      totalAssigned += batch.length;
    }
  }

  // Also assign screens from Réseau Écran Sud
  const org2 = await prisma.organization.findFirst({ where: { name: 'Réseau Écran Sud' } });
  if (org2) {
    const orphan2 = await prisma.screen.findMany({
      where: { partnerOrgId: org2.id, siteId: null },
      select: { id: true, city: true },
    });

    if (orphan2.length > 0) {
      const byCity2 = new Map<string, typeof orphan2>();
      for (const s of orphan2) {
        const c = s.city || 'Autre';
        if (!byCity2.has(c)) byCity2.set(c, []);
        byCity2.get(c)!.push(s);
      }

      for (const [city, screens] of byCity2) {
        let site = await prisma.site.findFirst({ where: { organizationId: org2.id, city } });
        if (!site) {
          site = await prisma.site.create({
            data: {
              name: `Hôtel ${city} Plaza`,
              organizationId: org2.id,
              city,
              category: 'HOTEL',
            },
          });
          console.log(`  Created site: ${site.name} (${city})`);
        }
        await prisma.screen.updateMany({
          where: { id: { in: screens.map(s => s.id) } },
          data: { siteId: site.id },
        });
        console.log(`    Assigned ${screens.length} screens to ${site.name}`);
        totalAssigned += screens.length;
      }
    }
  }

  console.log(`\nDone! Total assigned: ${totalAssigned}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
