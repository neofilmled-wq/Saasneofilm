import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Set all screens to ACTIVE
  const updated = await prisma.screen.updateMany({
    where: { status: { not: 'ACTIVE' } },
    data: { status: 'ACTIVE' },
  });
  console.log('Screens set to ACTIVE:', updated.count);

  // 2. Create ScreenLiveStatus (isOnline=true) for screens that don't have one
  const screens = await prisma.screen.findMany({
    where: { screenLiveStatus: null },
    select: { id: true },
  });
  if (screens.length > 0) {
    await prisma.screenLiveStatus.createMany({
      data: screens.map((s) => ({
        screenId: s.id,
        isOnline: true,
        lastHeartbeatAt: new Date(),
      })),
      skipDuplicates: true,
    });
    console.log('ScreenLiveStatus created (online):', screens.length);
  }

  // 3. Set existing offline ScreenLiveStatus to online
  const onlined = await prisma.screenLiveStatus.updateMany({
    where: { isOnline: false },
    data: { isOnline: true, lastHeartbeatAt: new Date() },
  });
  console.log('ScreenLiveStatus set online:', onlined.count);

  const total = await prisma.screen.count({ where: { status: 'ACTIVE' } });
  console.log('Total ACTIVE screens:', total);
  const online = await prisma.screenLiveStatus.count({ where: { isOnline: true } });
  console.log('Total online screens:', online);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
