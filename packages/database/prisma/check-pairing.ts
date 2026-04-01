import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const devices = await prisma.device.findMany({
    include: { screen: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log('=== Derniers devices ===');
  for (const d of devices) {
    console.log(`  Device: ${d.id} | serial: ${d.serialNumber} | screen: ${d.screen?.name ?? 'none'} | status: ${d.status} | created: ${d.createdAt}`);
  }

  const pairings = await prisma.devicePairingRequest.findMany({
    include: { screen: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log('\n=== Dernières demandes de pairing ===');
  for (const p of pairings) {
    console.log(`  Pairing: ${p.id} | screen: ${p.screen?.name ?? '?'} | status: ${p.status} | pin: ${p.pin} | created: ${p.createdAt}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
