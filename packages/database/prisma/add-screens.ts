import { PrismaClient, ScreenEnvironment, ScreenStatus } from '@prisma/client';

const prisma = new PrismaClient();

const ENVIRONMENTS: ScreenEnvironment[] = [
  'CINEMA_LOBBY',
  'CINEMA_HALLWAY',
  'HOTEL_LOBBY',
  'HOTEL_ROOM',
  'RESTAURANT',
  'RETAIL',
  'OUTDOOR',
  'OTHER',
];

const ORIENTATIONS = ['LANDSCAPE', 'PORTRAIT'] as const;
const STATUSES: ScreenStatus[] = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'INACTIVE', 'MAINTENANCE'];

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randPrice(): number {
  const prices = [15000, 20000, 25000, 30000, 35000, 40000, 50000, 60000, 75000];
  return rand(prices);
}

function jitter(base: number, range: number): number {
  return base + (Math.random() - 0.5) * range;
}

const CLERMONT_VENUES = [
  'Cinéma Le Rio', 'Cinéma Capitole', 'Centre Commercial Jaude', 'Hôtel Mercure',
  'Hôtel Ibis Centre', 'Palais des Sports', 'Stade Marcel Michelin', 'Zénith d\'Auvergne',
  'CHU Gabriel Montpied', 'Université Clermont Auvergne', 'Grand Hotel de la Poste',
  'Restaurant Le Moulin', 'Brasserie La Cigale', 'Marché Saint-Pierre',
  'Gare SNCF Clermont', 'Aéroport Aulnat', 'Mairie de Clermont', 'Vulcania Accueil',
  'Bowling de Clermont', 'Patinoire Clermont', 'Piscine Polydome', 'Laser Game',
  'Cinéma CGR', 'Auchan Jaude', 'Leclerc Riom',
];

const CLERMONT_ADDRESSES = [
  'Place de Jaude', 'Rue Blatin', 'Rue du 11 Novembre', 'Avenue des États-Unis',
  'Rue Gaultier de Biauzat', 'Boulevard Côte Blatin', 'Rue Philippe Marcombes',
  'Avenue de la République', 'Rue Fontgieve', 'Rue des Gras',
  'Place de la Victoire', 'Rue Massillon', 'Boulevard Lafayette', 'Rue du Terrail',
  'Avenue Julien', 'Rue du Commerce', 'Rue Pasteur', 'Place Delille',
  'Rue Gonod', 'Rue du Dr Roux',
];

const OTHER_CITIES = [
  { city: 'Paris', postCode: '75001', lat: 48.8566, lng: 2.3522, count: 160 },
  { city: 'Lyon', postCode: '69001', lat: 45.748, lng: 4.8357, count: 100 },
  { city: 'Marseille', postCode: '13001', lat: 43.2965, lng: 5.3698, count: 80 },
  { city: 'Bordeaux', postCode: '33000', lat: 44.8378, lng: -0.5792, count: 60 },
  { city: 'Toulouse', postCode: '31000', lat: 43.6047, lng: 1.4442, count: 60 },
  { city: 'Nice', postCode: '06000', lat: 43.7102, lng: 7.262, count: 50 },
  { city: 'Nantes', postCode: '44000', lat: 47.2184, lng: -1.5536, count: 50 },
  { city: 'Strasbourg', postCode: '67000', lat: 48.5734, lng: 7.7521, count: 40 },
  { city: 'Montpellier', postCode: '34000', lat: 43.6119, lng: 3.8772, count: 40 },
  { city: 'Lille', postCode: '59000', lat: 50.6292, lng: 3.0573, count: 40 },
  { city: 'Rennes', postCode: '35000', lat: 48.1173, lng: -1.6778, count: 30 },
  { city: 'Reims', postCode: '51100', lat: 49.2583, lng: 4.0317, count: 30 },
  { city: 'Dijon', postCode: '21000', lat: 47.322, lng: 5.0415, count: 20 },
  { city: 'Grenoble', postCode: '38000', lat: 45.1885, lng: 5.7245, count: 20 },
  { city: 'Rouen', postCode: '76000', lat: 49.4432, lng: 1.0999, count: 20 },
  { city: 'Toulon', postCode: '83000', lat: 43.1242, lng: 5.928, count: 20 },
  { city: 'Angers', postCode: '49000', lat: 47.4784, lng: -0.5632, count: 15 },
  { city: 'Metz', postCode: '57000', lat: 49.1193, lng: 6.1757, count: 15 },
  { city: 'Caen', postCode: '14000', lat: 49.1829, lng: -0.3707, count: 15 },
  { city: 'Orléans', postCode: '45000', lat: 47.9029, lng: 1.9093, count: 15 },
  { city: 'Limoges', postCode: '87000', lat: 45.8336, lng: 1.2611, count: 10 },
  { city: 'Perpignan', postCode: '66000', lat: 42.6887, lng: 2.8948, count: 10 },
];

async function main() {
  console.log('🌱 Ajout de 1000 écrans...\n');

  const partners = await prisma.organization.findMany({
    where: { type: 'PARTNER' },
    select: { id: true, name: true },
  });

  if (partners.length === 0) {
    throw new Error('Aucune organisation partenaire trouvée. Lance d\'abord pnpm db:seed');
  }

  console.log(`📋 Partenaires: ${partners.map(p => p.name).join(', ')}\n`);

  let total = 0;

  // ── 100 écrans à Clermont-Ferrand ─────────────────────────────────────────

  console.log('🏔️  Création des 100 écrans à Clermont-Ferrand...');

  const clermontScreens = [];
  for (let i = 0; i < 100; i++) {
    const venueIdx = i % CLERMONT_VENUES.length;
    const addrIdx = i % CLERMONT_ADDRESSES.length;
    const partner = partners[i % partners.length];
    const orientation = rand(ORIENTATIONS);

    clermontScreens.push({
      name: `${CLERMONT_VENUES[venueIdx]} - Écran ${Math.floor(i / CLERMONT_VENUES.length) + 1}`,
      externalRef: `CLF-${String(i + 1).padStart(3, '0')}`,
      address: CLERMONT_ADDRESSES[addrIdx],
      city: 'Clermont-Ferrand',
      postCode: '63000',
      country: 'FR',
      latitude: jitter(45.7797, 0.04),
      longitude: jitter(3.0863, 0.04),
      environment: rand(ENVIRONMENTS),
      resolution: orientation === 'PORTRAIT' ? '1080x1920' : rand(['1920x1080', '3840x2160', '1280x720'] as const),
      orientation,
      status: rand(STATUSES),
      monthlyPriceCents: randPrice(),
      partnerOrgId: partner.id,
    });
  }

  await prisma.screen.createMany({ data: clermontScreens, skipDuplicates: true });
  total += 100;
  console.log(`  ✅ 100 écrans Clermont-Ferrand créés`);

  // ── 400 écrans dans les autres villes ─────────────────────────────────────

  console.log('🗺️  Création des 400 écrans dans les autres villes...');

  for (const cityData of OTHER_CITIES) {
    const cityScreens = [];
    for (let i = 0; i < cityData.count; i++) {
      const partner = partners[i % partners.length];
      const orientation = rand(ORIENTATIONS);
      const prefix = cityData.city.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);

      cityScreens.push({
        name: `${cityData.city} - Écran ${String(i + 1).padStart(3, '0')}`,
        externalRef: `${prefix}-${String(i + 1).padStart(3, '0')}`,
        address: `${i + 1} Rue Principale`,
        city: cityData.city,
        postCode: cityData.postCode,
        country: 'FR',
        latitude: jitter(cityData.lat, 0.05),
        longitude: jitter(cityData.lng, 0.05),
        environment: rand(ENVIRONMENTS),
        resolution: orientation === 'PORTRAIT' ? '1080x1920' : rand(['1920x1080', '3840x2160', '1280x720'] as const),
        orientation,
        status: rand(STATUSES),
        monthlyPriceCents: randPrice(),
        partnerOrgId: partner.id,
      });
    }

    await prisma.screen.createMany({ data: cityScreens, skipDuplicates: true });
    total += cityData.count;
    console.log(`  ✅ ${cityData.count} écrans ${cityData.city} créés`);
  }

  console.log(`\n🎉 Total ajouté: ${total} écrans`);
  const grandTotal = await prisma.screen.count();
  console.log(`📊 Total écrans en base: ${grandTotal}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
