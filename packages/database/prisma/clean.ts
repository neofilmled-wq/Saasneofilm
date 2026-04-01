import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  Suppression des campagnes et écrans...');

  // Supprimer les données liées aux campagnes
  await prisma.diffusionLog.deleteMany({});
  await prisma.analyticsEvent.deleteMany({});
  await prisma.scheduleSlot.deleteMany({});
  await prisma.scheduleBlackout.deleteMany({});
  await prisma.schedule.deleteMany({});
  await prisma.bookingScreen.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.campaignTargeting.deleteMany({});
  await prisma.campaign.deleteMany({});
  await prisma.creative.deleteMany({});
  console.log('✅ Campagnes supprimées');

  // Supprimer les données liées aux écrans
  await prisma.deviceHeartbeat.deleteMany({});
  await prisma.deviceMetrics.deleteMany({});
  await prisma.deviceErrorLog.deleteMany({});
  await prisma.screenLiveStatus.deleteMany({});
  await prisma.tvMacro.deleteMany({});
  await prisma.tvConfig.deleteMany({});
  await prisma.device.deleteMany({});
  await prisma.screen.deleteMany({});
  console.log('✅ Écrans supprimés');

  console.log('🎉 Terminé !');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
