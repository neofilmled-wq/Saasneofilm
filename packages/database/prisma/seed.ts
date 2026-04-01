import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes, createHmac } from 'crypto';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function hmacSignature(
  deviceId: string,
  creativeId: string,
  startTime: Date,
  endTime: Date,
  secret: string,
): string {
  const payload = `${deviceId}:${creativeId}:${startTime.toISOString()}:${endTime.toISOString()}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  );
}

const DEMO_PASSWORD = 'Password123!';

// ─────────────────────────────────────────
// Seed
// ─────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding database...\n');

  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── 1. Platform Admin ──────────────────

  const admin = await prisma.user.create({
    data: {
      email: 'admin@neofilm.com',
      passwordHash: hashedPassword,
      firstName: 'Maxime',
      lastName: 'Durand',
      platformRole: 'SUPER_ADMIN',
      isActive: true,
      mfaEnabled: false,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`✅ Admin: ${admin.email}`);

  // ── 2. Partner Organizations ───────────

  const partnerOrg1 = await prisma.organization.create({
    data: {
      type: 'PARTNER',
      name: 'Cinémas Lumière',
      slug: 'cinemas-lumiere',
      contactEmail: 'contact@cinemas-lumiere.fr',
      contactPhone: '+33 1 42 00 00 01',
      address: '15 Boulevard des Capucines',
      city: 'Paris',
      postCode: '75009',
      country: 'FR',
      commissionRate: 0.3,
      stripeConnectAccountId: 'acct_partner_lumiere_test',
      onboardingCompletedAt: new Date(),
    },
  });

  const partnerOrg2 = await prisma.organization.create({
    data: {
      type: 'PARTNER',
      name: 'Réseau Écran Sud',
      slug: 'reseau-ecran-sud',
      contactEmail: 'contact@ecran-sud.fr',
      contactPhone: '+33 4 91 00 00 02',
      address: '45 Rue de Rome',
      city: 'Marseille',
      postCode: '13001',
      country: 'FR',
      commissionRate: 0.25,
      stripeConnectAccountId: 'acct_partner_ecransud_test',
      onboardingCompletedAt: new Date(),
    },
  });

  console.log(`✅ Partners: ${partnerOrg1.name}, ${partnerOrg2.name}`);

  // ── 3. Partner Users + Memberships ─────

  const partnerUser1 = await prisma.user.create({
    data: {
      email: 'partner@demo.com',
      passwordHash: hashedPassword,
      firstName: 'Jean-Pierre',
      lastName: 'Demo',
      isActive: true,
      emailVerifiedAt: new Date(),
      memberships: {
        create: {
          organizationId: partnerOrg1.id,
          role: 'OWNER',
          acceptedAt: new Date(),
        },
      },
    },
  });

  const partnerUser2 = await prisma.user.create({
    data: {
      email: 'sophie@ecran-sud.fr',
      passwordHash: hashedPassword,
      firstName: 'Sophie',
      lastName: 'Bernard',
      isActive: true,
      emailVerifiedAt: new Date(),
      memberships: {
        create: {
          organizationId: partnerOrg2.id,
          role: 'OWNER',
          acceptedAt: new Date(),
        },
      },
    },
  });

  console.log(
    `✅ Partner Users: ${partnerUser1.email}, ${partnerUser2.email}`,
  );

  // ── 4. Advertiser Organizations ────────

  const advOrg1 = await prisma.organization.create({
    data: {
      type: 'ADVERTISER',
      name: 'FrenchTech Ads',
      slug: 'frenchtech-ads',
      contactEmail: 'ads@frenchtech.io',
      contactPhone: '+33 1 55 00 00 10',
      address: '10 Rue de Rivoli',
      city: 'Paris',
      postCode: '75004',
      country: 'FR',
      vatNumber: 'FR12345678901',
      stripeCustomerId: 'cus_advertiser_frenchtech_test',
      onboardingCompletedAt: new Date(),
    },
  });

  const advOrg2 = await prisma.organization.create({
    data: {
      type: 'ADVERTISER',
      name: 'MéditerranéeFood',
      slug: 'mediterranee-food',
      contactEmail: 'pub@medfood.fr',
      contactPhone: '+33 4 92 00 00 20',
      address: '8 Promenade des Anglais',
      city: 'Nice',
      postCode: '06000',
      country: 'FR',
      vatNumber: 'FR98765432101',
      stripeCustomerId: 'cus_advertiser_medfood_test',
      onboardingCompletedAt: new Date(),
    },
  });

  console.log(`✅ Advertisers: ${advOrg1.name}, ${advOrg2.name}`);

  // ── 5. Advertiser Users + Memberships ──

  const advUser1 = await prisma.user.create({
    data: {
      email: 'advertiser@demo.com',
      passwordHash: hashedPassword,
      firstName: 'Pierre',
      lastName: 'Demo',
      isActive: true,
      emailVerifiedAt: new Date(),
      memberships: {
        create: {
          organizationId: advOrg1.id,
          role: 'OWNER',
          acceptedAt: new Date(),
        },
      },
    },
  });

  const advUser2 = await prisma.user.create({
    data: {
      email: 'marie@medfood.fr',
      passwordHash: hashedPassword,
      firstName: 'Marie',
      lastName: 'Laurent',
      isActive: true,
      emailVerifiedAt: new Date(),
      memberships: {
        create: {
          organizationId: advOrg2.id,
          role: 'OWNER',
          acceptedAt: new Date(),
        },
      },
    },
  });

  console.log(
    `✅ Advertiser Users: ${advUser1.email}, ${advUser2.email}`,
  );

  // ── 6. Screens (5 total) ──────────────

  const screens = await Promise.all([
    prisma.screen.create({
      data: {
        name: 'Lumière - Hall Principal',
        externalRef: 'LUM-HALL-01',
        address: '15 Boulevard des Capucines',
        city: 'Paris',
        postCode: '75009',
        country: 'FR',
        latitude: 48.8711,
        longitude: 2.3281,
        environment: 'CINEMA_LOBBY',
        resolution: '1920x1080',
        orientation: 'LANDSCAPE',
        status: 'ACTIVE',
        monthlyPriceCents: 50000, // 500 EUR/month
        partnerOrgId: partnerOrg1.id,
      },
    }),
    prisma.screen.create({
      data: {
        name: 'Lumière - Couloir Salle 3',
        externalRef: 'LUM-CORR-03',
        address: '15 Boulevard des Capucines',
        city: 'Paris',
        postCode: '75009',
        country: 'FR',
        latitude: 48.8712,
        longitude: 2.3283,
        environment: 'CINEMA_HALLWAY',
        resolution: '1080x1920',
        orientation: 'PORTRAIT',
        status: 'ACTIVE',
        monthlyPriceCents: 35000, // 350 EUR/month
        partnerOrgId: partnerOrg1.id,
      },
    }),
    prisma.screen.create({
      data: {
        name: 'Lumière - Entrée Parking',
        externalRef: 'LUM-PARK-01',
        address: '15 Boulevard des Capucines',
        city: 'Paris',
        postCode: '75009',
        country: 'FR',
        latitude: 48.871,
        longitude: 2.328,
        environment: 'OUTDOOR',
        resolution: '1920x1080',
        orientation: 'LANDSCAPE',
        status: 'ACTIVE',
        monthlyPriceCents: 25000, // 250 EUR/month
        partnerOrgId: partnerOrg1.id,
      },
    }),
    prisma.screen.create({
      data: {
        name: 'Écran Sud - Lobby Prado',
        externalRef: 'ES-PRADO-01',
        address: '45 Rue de Rome',
        city: 'Marseille',
        postCode: '13001',
        country: 'FR',
        latitude: 43.2965,
        longitude: 5.3698,
        environment: 'CINEMA_LOBBY',
        resolution: '3840x2160',
        orientation: 'LANDSCAPE',
        status: 'ACTIVE',
        monthlyPriceCents: 60000, // 600 EUR/month
        partnerOrgId: partnerOrg2.id,
      },
    }),
    prisma.screen.create({
      data: {
        name: 'Écran Sud - Accueil Vieux Port',
        externalRef: 'ES-VP-01',
        address: '2 Quai du Port',
        city: 'Marseille',
        postCode: '13002',
        country: 'FR',
        latitude: 43.2951,
        longitude: 5.3697,
        environment: 'CINEMA_LOBBY',
        resolution: '1920x1080',
        orientation: 'LANDSCAPE',
        status: 'ACTIVE',
        monthlyPriceCents: 45000, // 450 EUR/month
        partnerOrgId: partnerOrg2.id,
      },
    }),
  ]);

  console.log(`✅ Screens: ${screens.length} created`);

  // ── 7. Devices (5, one per screen) ────

  const deviceSecret = 'neofilm-device-secret-2026';

  const devices = await Promise.all(
    screens.map((screen, i) =>
      prisma.device.create({
        data: {
          serialNumber: `NEO-DEV-${String(i + 1).padStart(4, '0')}`,
          status: 'ONLINE',
          macAddress: `AA:BB:CC:DD:EE:${String(i + 1).padStart(2, '0')}`,
          provisioningToken: randomBytes(32).toString('hex'),
          pairedAt: new Date(),
          appVersion: '2.4.1',
          firmwareVersion: '1.2.0',
          osVersion: 'Android 13',
          otaVersion: '2.4.1-stable',
          ipAddress: `192.168.1.${100 + i}`,
          lastPingAt: new Date(),
          screenId: screen.id,
        },
      }),
    ),
  );

  // Add one unpaired test device for TV app testing
  const testProvisioningToken = 'test-provisioning-token-for-tv-app-dev';
  const unpairedDevice = await prisma.device.create({
    data: {
      serialNumber: 'NEO-TV-TEST-0001',
      status: 'PROVISIONING',
      provisioningToken: testProvisioningToken,
    },
  });
  console.log(`✅ Test unpaired device: ${unpairedDevice.serialNumber} (token: ${testProvisioningToken})`);

  // Link active devices to screens
  await Promise.all(
    screens.map((screen, i) =>
      prisma.screen.update({
        where: { id: screen.id },
        data: { activeDeviceId: devices[i].id },
      }),
    ),
  );

  console.log(`✅ Devices: ${devices.length} paired to screens + 1 unpaired test device`);

  // ── 8. Campaigns (3) ──────────────────

  const campaign1 = await prisma.campaign.create({
    data: {
      name: 'Lancement App FrenchTech Q1 2026',
      description: "Campagne de lancement de l'application mobile FrenchTech",
      status: 'ACTIVE',
      type: 'AD_SPOT',
      startDate: new Date('2026-01-15'),
      endDate: new Date('2026-03-31'),
      budgetCents: 1500000, // 15,000 EUR
      spentCents: 420000,
      advertiserOrgId: advOrg1.id,
    },
  });

  const campaign2 = await prisma.campaign.create({
    data: {
      name: 'Menu Été MéditerranéeFood',
      description: 'Promotion du nouveau menu estival dans les cinémas du sud',
      status: 'ACTIVE',
      type: 'AD_SPOT',
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-04-30'),
      budgetCents: 800000, // 8,000 EUR
      spentCents: 150000,
      advertiserOrgId: advOrg2.id,
    },
  });

  const campaign3 = await prisma.campaign.create({
    data: {
      name: 'Catalogue Digital FrenchTech',
      description: 'Catalogue interactif des services FrenchTech',
      status: 'PENDING_REVIEW',
      type: 'CATALOG_LISTING',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-06-30'),
      budgetCents: 500000, // 5,000 EUR
      advertiserOrgId: advOrg1.id,
    },
  });

  // Campaign pending review (for admin approval testing)
  const campaign4 = await prisma.campaign.create({
    data: {
      name: 'Promo Rentrée MéditerranéeFood',
      description: 'Campagne de rentrée pour les restaurants partenaires',
      status: 'PENDING_REVIEW',
      type: 'AD_SPOT',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-10-31'),
      budgetCents: 350000, // 3,500 EUR
      advertiserOrgId: advOrg2.id,
    },
  });

  console.log(
    `✅ Campaigns: ${campaign1.name}, ${campaign2.name}, ${campaign3.name}, ${campaign4.name}`,
  );

  // ── 9. Campaign Targeting ─────────────

  await prisma.campaignTargeting.create({
    data: {
      campaignId: campaign1.id,
      cities: ['Paris'],
      environments: ['CINEMA_LOBBY', 'CINEMA_HALLWAY'],
      includedScreens: {
        connect: screens.slice(0, 3).map((s) => ({ id: s.id })),
      },
      scheduleWindows: [
        { dayOfWeek: [1, 2, 3, 4, 5], startTime: '14:00', endTime: '22:00' },
        { dayOfWeek: [0, 6], startTime: '10:00', endTime: '23:00' },
      ],
    },
  });

  await prisma.campaignTargeting.create({
    data: {
      campaignId: campaign2.id,
      cities: ['Marseille'],
      geoRadiusKm: 50,
      geoLatitude: 43.2965,
      geoLongitude: 5.3698,
      environments: ['CINEMA_LOBBY'],
      includedScreens: {
        connect: screens.slice(3, 5).map((s) => ({ id: s.id })),
      },
    },
  });

  console.log('✅ Campaign targeting configured');

  // ── 10. Creatives ─────────────────────

  const creative1 = await prisma.creative.create({
    data: {
      name: 'FrenchTech App - 30s Spot',
      type: 'VIDEO',
      status: 'READY',
      fileUrl: 's3://neofilm-creatives/frenchtech/app-launch-30s.mp4',
      fileHash: sha256('frenchtech-app-launch-30s'),
      fileSizeBytes: 15_000_000,
      mimeType: 'video/mp4',
      durationMs: 30000,
      width: 1920,
      height: 1080,
      isApproved: true,
      moderationStatus: 'APPROVED' as any,
      campaignId: campaign1.id,
    },
  });

  const creative2 = await prisma.creative.create({
    data: {
      name: 'FrenchTech App - 15s Bumper',
      type: 'VIDEO',
      status: 'READY',
      fileUrl: 's3://neofilm-creatives/frenchtech/app-launch-15s.mp4',
      fileHash: sha256('frenchtech-app-launch-15s'),
      fileSizeBytes: 8_000_000,
      mimeType: 'video/mp4',
      durationMs: 15000,
      width: 1920,
      height: 1080,
      isApproved: true,
      moderationStatus: 'APPROVED' as any,
      campaignId: campaign1.id,
    },
  });

  const creative3 = await prisma.creative.create({
    data: {
      name: 'MedFood Menu - Summer Visual',
      type: 'IMAGE',
      status: 'READY',
      fileUrl: 's3://neofilm-creatives/medfood/summer-menu-2026.jpg',
      fileHash: sha256('medfood-summer-menu-2026'),
      fileSizeBytes: 2_500_000,
      mimeType: 'image/jpeg',
      durationMs: 10000, // 10s display
      width: 1920,
      height: 1080,
      isApproved: true,
      moderationStatus: 'APPROVED' as any,
      campaignId: campaign2.id,
    },
  });

  console.log(`✅ Creatives: 3 created`);

  // ── 11. Bookings ──────────────────────

  const booking1 = await prisma.booking.create({
    data: {
      status: 'ACTIVE',
      monthlyPriceCents: 110000, // 1100 EUR (3 Paris screens)
      billingCycle: 'MONTHLY',
      startDate: new Date('2026-01-15'),
      endDate: new Date('2026-03-31'),
      advertiserOrgId: advOrg1.id,
      campaignId: campaign1.id,
      stripeSubscriptionId: 'sub_frenchtech_q1_test',
      bookingScreens: {
        create: [
          {
            screenId: screens[0].id,
            partnerOrgId: partnerOrg1.id,
            unitPriceCents: 50000,
          },
          {
            screenId: screens[1].id,
            partnerOrgId: partnerOrg1.id,
            unitPriceCents: 35000,
          },
          {
            screenId: screens[2].id,
            partnerOrgId: partnerOrg1.id,
            unitPriceCents: 25000,
          },
        ],
      },
    },
  });

  const booking2 = await prisma.booking.create({
    data: {
      status: 'ACTIVE',
      monthlyPriceCents: 105000, // 1050 EUR (2 Marseille screens)
      billingCycle: 'MONTHLY',
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-04-30'),
      advertiserOrgId: advOrg2.id,
      campaignId: campaign2.id,
      stripeSubscriptionId: 'sub_medfood_spring_test',
      bookingScreens: {
        create: [
          {
            screenId: screens[3].id,
            partnerOrgId: partnerOrg2.id,
            unitPriceCents: 60000,
          },
          {
            screenId: screens[4].id,
            partnerOrgId: partnerOrg2.id,
            unitPriceCents: 45000,
          },
        ],
      },
    },
  });

  console.log(`✅ Bookings: 2 active`);

  // ── 12. Revenue Rules ─────────────────

  await prisma.revenueRule.create({
    data: {
      platformRate: 0.3,
      partnerRate: 0.7,
      effectiveFrom: new Date('2026-01-01'),
      partnerOrgId: null, // global default
    },
  });

  await prisma.revenueRule.create({
    data: {
      platformRate: 0.25,
      partnerRate: 0.75,
      effectiveFrom: new Date('2026-01-01'),
      partnerOrgId: partnerOrg2.id, // special rate for Écran Sud
    },
  });

  console.log('✅ Revenue rules configured');

  // ── 13. AI Wallets ────────────────────

  const wallet1 = await prisma.aIWallet.create({
    data: {
      organizationId: advOrg1.id,
      balanceCredits: 500,
      transactions: {
        create: {
          type: 'RECHARGE',
          credits: 500,
          balance: 500,
          description: 'Initial credit pack',
        },
      },
    },
  });

  await prisma.aIWallet.create({
    data: {
      organizationId: advOrg2.id,
      balanceCredits: 200,
      transactions: {
        create: {
          type: 'BONUS',
          credits: 200,
          balance: 200,
          description: 'Welcome bonus credits',
        },
      },
    },
  });

  console.log('✅ AI Wallets created');

  // ── 14. Schedules ─────────────────────

  const schedule1 = await prisma.schedule.create({
    data: {
      name: 'Paris Hall - Default Schedule',
      isActive: true,
      screenId: screens[0].id,
      slots: {
        create: [
          {
            startTime: new Date('2026-01-15T14:00:00Z'),
            endTime: new Date('2026-01-15T22:00:00Z'),
            dayOfWeek: 1,
            priority: 10,
            campaignId: campaign1.id,
            creativeId: creative1.id,
          },
          {
            startTime: new Date('2026-01-15T14:00:00Z'),
            endTime: new Date('2026-01-15T22:00:00Z'),
            dayOfWeek: 2,
            priority: 10,
            campaignId: campaign1.id,
            creativeId: creative2.id,
          },
        ],
      },
    },
  });

  console.log('✅ Schedules created');

  // ── 15. Diffusion Logs (1000) ─────────

  console.log('⏳ Generating 1000 diffusion logs...');

  const campaignCreativeMap = [
    { campaign: campaign1, creatives: [creative1, creative2], screens: screens.slice(0, 3), devices: devices.slice(0, 3) },
    { campaign: campaign2, creatives: [creative3], screens: screens.slice(3, 5), devices: devices.slice(3, 5) },
  ];

  const diffusionLogData = [];
  const triggers: Array<
    'POWER_ON' | 'OPEN_APP' | 'CHANGE_APP' | 'CATALOG_OPEN' | 'SCHEDULED' | 'MANUAL'
  > = ['SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'OPEN_APP', 'POWER_ON', 'CATALOG_OPEN'];

  for (let i = 0; i < 1000; i++) {
    const group =
      campaignCreativeMap[i < 650 ? 0 : 1]; // 65% campaign1, 35% campaign2
    const screenIdx = i % group.screens.length;
    const creativeIdx = i % group.creatives.length;
    const screen = group.screens[screenIdx];
    const device = group.devices[screenIdx];
    const creative = group.creatives[creativeIdx];

    const startTime = randomDate(
      new Date('2026-01-15'),
      new Date('2026-02-25'),
    );
    const durationMs =
      creative.durationMs! + Math.floor((Math.random() - 0.5) * 1000); // +/- 500ms jitter
    const endTime = new Date(startTime.getTime() + durationMs);

    diffusionLogData.push({
      screenId: screen.id,
      deviceId: device.id,
      campaignId: group.campaign.id,
      creativeId: creative.id,
      startTime,
      endTime,
      durationMs,
      triggerContext: triggers[i % triggers.length],
      appVersion: '2.4.1',
      mediaHash: creative.fileHash ?? sha256(`creative-${creative.id}`),
      signature: hmacSignature(
        device.id,
        creative.id,
        startTime,
        endTime,
        deviceSecret,
      ),
      verified: Math.random() > 0.05, // 95% verified
    });
  }

  // Batch insert in chunks of 100
  for (let i = 0; i < diffusionLogData.length; i += 100) {
    const chunk = diffusionLogData.slice(i, i + 100);
    await prisma.diffusionLog.createMany({ data: chunk });
    process.stdout.write(`\r  Inserted ${Math.min(i + 100, 1000)}/1000`);
  }
  console.log('\n✅ Diffusion logs: 1000 created');

  // ── 16. Screen Live Status ────────────

  await Promise.all(
    screens.map((screen, i) =>
      prisma.screenLiveStatus.create({
        data: {
          screenId: screen.id,
          isOnline: true,
          currentDeviceId: devices[i].id,
          lastHeartbeatAt: new Date(),
          appVersion: '2.4.1',
          cpuPercent: 15 + Math.random() * 30,
          memoryPercent: 40 + Math.random() * 20,
          networkType: 'wifi',
          errorCount24h: Math.floor(Math.random() * 3),
        },
      }),
    ),
  );

  console.log('✅ Screen live status initialized');

  // ── 17. Device Heartbeats (sample) ────

  for (const device of devices) {
    const heartbeats = [];
    for (let j = 0; j < 10; j++) {
      heartbeats.push({
        deviceId: device.id,
        isOnline: true,
        appVersion: '2.4.1',
        uptime: 86400 + j * 60,
        timestamp: new Date(Date.now() - (10 - j) * 60000), // every minute
      });
    }
    await prisma.deviceHeartbeat.createMany({ data: heartbeats });
  }

  console.log('✅ Device heartbeats: 50 sample records');

  // ── 18. Analytics Events (sample) ─────

  const eventTypes = [
    'catalog_open',
    'cta_click',
    'app_launch',
    'screen_wake',
    'creative_loaded',
    'system_error',
  ];

  const analyticsData = [];
  for (let i = 0; i < 200; i++) {
    const screenIdx = i % screens.length;
    analyticsData.push({
      eventType: eventTypes[i % eventTypes.length],
      payload: { source: 'seed', index: i },
      screenId: screens[screenIdx].id,
      deviceId: devices[screenIdx].id,
      campaignId: i % 3 === 0 ? campaign1.id : i % 3 === 1 ? campaign2.id : null,
      orgId: i < 100 ? partnerOrg1.id : partnerOrg2.id,
      orgType: 'PARTNER' as const,
      timestamp: randomDate(new Date('2026-02-01'), new Date('2026-02-25')),
    });
  }

  await prisma.analyticsEvent.createMany({ data: analyticsData });
  console.log('✅ Analytics events: 200 sample records');

  // ── 19. Audit Logs (sample) ───────────

  await prisma.auditLog.createMany({
    data: [
      {
        action: 'CREATE',
        entity: 'Organization',
        entityId: partnerOrg1.id,
        userId: admin.id,
        orgId: partnerOrg1.id,
        severity: 'INFO',
        newData: { name: partnerOrg1.name },
      },
      {
        action: 'CREATE',
        entity: 'Organization',
        entityId: advOrg1.id,
        userId: admin.id,
        orgId: advOrg1.id,
        severity: 'INFO',
        newData: { name: advOrg1.name },
      },
      {
        action: 'CREATE',
        entity: 'Campaign',
        entityId: campaign1.id,
        userId: advUser1.id,
        orgId: advOrg1.id,
        severity: 'INFO',
        newData: { name: campaign1.name },
      },
      {
        action: 'UPDATE',
        entity: 'Campaign',
        entityId: campaign1.id,
        userId: admin.id,
        orgId: advOrg1.id,
        severity: 'INFO',
        oldData: { status: 'DRAFT' },
        newData: { status: 'ACTIVE' },
      },
    ],
  });

  console.log('✅ Audit logs: 4 sample records');

  // ── 20. Notifications (sample) ────────

  await prisma.notification.createMany({
    data: [
      {
        channel: 'IN_APP',
        type: 'campaign_approved',
        title: 'Campagne approuvée',
        message: `Votre campagne "${campaign1.name}" a été approuvée.`,
        userId: advUser1.id,
        data: { campaignId: campaign1.id },
      },
      {
        channel: 'IN_APP',
        type: 'booking_confirmed',
        title: 'Réservation confirmée',
        message: `Booking de 3 écrans chez ${partnerOrg1.name} confirmé.`,
        userId: advUser1.id,
        data: { bookingId: booking1.id },
      },
      {
        channel: 'IN_APP',
        type: 'new_booking',
        title: 'Nouvelle réservation',
        message: `${advOrg1.name} a réservé 3 de vos écrans.`,
        userId: partnerUser1.id,
        data: { bookingId: booking1.id },
      },
    ],
  });

  console.log('✅ Notifications: 3 sample records');

  // ── 21. Platform Settings ───────────
  await Promise.all([
    prisma.platformSetting.create({ data: { key: 'platformName', value: 'NeoFilm' } }),
    prisma.platformSetting.create({ data: { key: 'supportEmail', value: 'support@neofilm.io' } }),
    prisma.platformSetting.create({ data: { key: 'defaultCommission', value: '30' } }),
  ]);
  console.log('✅ Platform settings: 3 entries');

  // ── 22. Schedule Blackouts (sample) ──
  await prisma.scheduleBlackout.create({
    data: {
      name: 'Maintenance serveurs',
      reason: 'Maintenance planifiée des serveurs de diffusion',
      startAt: new Date('2026-03-15T02:00:00Z'),
      endAt: new Date('2026-03-15T06:00:00Z'),
      createdById: admin.id,
    },
  });
  console.log('✅ Schedule blackouts: 1 sample');

  // ── 20. Pending Approval Screen ─────────
  const pendingScreen = await prisma.screen.create({
    data: {
      name: 'Nouveau Écran - Lobby Gaumont',
      address: '1 Place du Capitole',
      city: 'Toulouse',
      postCode: '31000',
      latitude: 43.6047,
      longitude: 1.4442,
      environment: 'CINEMA_LOBBY',
      resolution: '3840x2160',
      orientation: 'LANDSCAPE',
      status: 'PENDING_APPROVAL' as any,
      monthlyPriceCents: 45000,
      partnerOrgId: partnerOrg1.id,
    },
  });
  console.log(`✅ Pending screen: ${pendingScreen.name}`);

  // ── 21. Creatives with moderation statuses ─────
  await prisma.creative.create({
    data: {
      name: 'Promo Été - Vidéo 30s (en attente)',
      type: 'VIDEO',
      status: 'READY',
      fileUrl: 's3://neofilm-creatives/test/promo-ete-30s.mp4',
      fileHash: sha256('promo-ete-30s'),
      fileSizeBytes: 15_000_000,
      mimeType: 'video/mp4',
      durationMs: 30000,
      width: 1920,
      height: 1080,
      isApproved: false,
      moderationStatus: 'PENDING_REVIEW' as any,
      campaignId: campaign1.id,
    },
  });

  await prisma.creative.create({
    data: {
      name: 'Banner Flash Sale (signalé)',
      type: 'IMAGE',
      status: 'READY',
      fileUrl: 's3://neofilm-creatives/test/flash-sale-banner.jpg',
      fileHash: sha256('flash-sale-banner'),
      fileSizeBytes: 3_000_000,
      mimeType: 'image/jpeg',
      durationMs: 8000,
      width: 1920,
      height: 1080,
      isApproved: false,
      moderationStatus: 'FLAGGED' as any,
      moderationReason: 'Contenu potentiellement trompeur',
      campaignId: campaign2.id,
    },
  });

  await prisma.creative.create({
    data: {
      name: 'Spot Radio adapté TV (en attente)',
      type: 'VIDEO',
      status: 'READY',
      fileUrl: 's3://neofilm-creatives/test/spot-radio-tv.mp4',
      fileHash: sha256('spot-radio-tv'),
      fileSizeBytes: 12_000_000,
      mimeType: 'video/mp4',
      durationMs: 20000,
      width: 1920,
      height: 1080,
      isApproved: false,
      moderationStatus: 'PENDING_REVIEW' as any,
      campaignId: campaign1.id,
    },
  });

  console.log('✅ Moderation creatives: 3 (2 pending, 1 flagged)');

  // ── 20. Messaging / Support Conversations ──

  const conv1 = await prisma.conversation.create({
    data: {
      subject: 'Question sur le ciblage géographique',
      status: 'OPEN',
      createdByUserId: advUser1.id,
      organizationId: advOrg1.id,
      lastMessageAt: new Date(Date.now() - 3600_000), // 1h ago
      participants: {
        create: [
          { userId: advUser1.id, role: 'REQUESTER', lastReadAt: new Date() },
          { userId: admin.id, role: 'ADMIN', lastReadAt: new Date(Date.now() - 7200_000) },
        ],
      },
    },
  });

  const conv1Messages = [
    { senderUserId: advUser1.id, body: 'Bonjour, je souhaite cibler uniquement les cinémas à Paris pour ma campagne. Comment configurer le ciblage géographique ?', createdAt: new Date(Date.now() - 7200_000) },
    { senderUserId: admin.id, body: 'Bonjour Pierre ! Vous pouvez configurer le ciblage dans l\'onglet "Ciblage" de votre campagne. Sélectionnez "Paris" dans la liste des villes.', createdAt: new Date(Date.now() - 6000_000) },
    { senderUserId: advUser1.id, body: 'Merci ! Et est-ce possible de cibler un rayon autour d\'une adresse précise ?', createdAt: new Date(Date.now() - 5000_000) },
    { senderUserId: admin.id, body: 'Oui, utilisez le ciblage par rayon. Entrez l\'adresse et définissez un rayon en km. Tous les écrans dans cette zone seront inclus.', createdAt: new Date(Date.now() - 4000_000) },
    { senderUserId: advUser1.id, body: 'Parfait, je vais essayer. Une dernière question : le ciblage est-il immédiat ou faut-il attendre une validation ?', createdAt: new Date(Date.now() - 3600_000) },
  ];

  for (const msg of conv1Messages) {
    await prisma.message.create({
      data: { conversationId: conv1.id, ...msg, type: 'TEXT' },
    });
  }

  const conv2 = await prisma.conversation.create({
    data: {
      subject: 'Problème écran Hall A - pas de signal',
      status: 'OPEN',
      createdByUserId: partnerUser1.id,
      organizationId: partnerOrg1.id,
      lastMessageAt: new Date(Date.now() - 1800_000), // 30min ago
      participants: {
        create: [
          { userId: partnerUser1.id, role: 'REQUESTER', lastReadAt: new Date(Date.now() - 5400_000) },
          { userId: admin.id, role: 'ADMIN', lastReadAt: new Date(Date.now() - 7200_000) },
        ],
      },
    },
  });

  const conv2Messages = [
    { senderUserId: partnerUser1.id, body: 'Bonjour, l\'écran du Hall A (Lumière Opéra) ne reçoit plus de signal depuis ce matin. Le boîtier semble allumé mais l\'écran reste noir.', createdAt: new Date(Date.now() - 7200_000) },
    { senderUserId: admin.id, body: 'Bonjour Jean-Pierre, merci pour le signalement. Je vérifie le statut de l\'appareil. Pouvez-vous confirmer que le câble HDMI est bien branché ?', createdAt: new Date(Date.now() - 6500_000) },
    { senderUserId: partnerUser1.id, body: 'Oui, j\'ai vérifié tous les câbles. Le voyant du boîtier est vert fixe.', createdAt: new Date(Date.now() - 5400_000) },
    { senderUserId: admin.id, body: 'Je vois que l\'appareil est en ligne dans notre système. Je vais tenter un redémarrage à distance. Patientez 2 minutes.', createdAt: new Date(Date.now() - 3600_000) },
    { senderUserId: admin.id, body: 'Le redémarrage est lancé. L\'écran devrait se rallumer sous 1-2 minutes. Pouvez-vous confirmer ?', createdAt: new Date(Date.now() - 1800_000) },
  ];

  for (const msg of conv2Messages) {
    await prisma.message.create({
      data: { conversationId: conv2.id, ...msg, type: 'TEXT' },
    });
  }

  console.log('✅ Messaging: 2 conversations with 10 messages total');

  // ── 23. TV Channels (TNT/IPTV) ───────
  const tvChannels = [
    { name: 'TF1', number: 1, category: 'general', logoUrl: '/channels/tf1.png' },
    { name: 'France 2', number: 2, category: 'general', logoUrl: '/channels/france2.png' },
    { name: 'France 3', number: 3, category: 'general', logoUrl: '/channels/france3.png' },
    { name: 'Canal+', number: 4, category: 'general', logoUrl: '/channels/canalplus.png' },
    { name: 'France 5', number: 5, category: 'general', logoUrl: '/channels/france5.png' },
    { name: 'M6', number: 6, category: 'general', logoUrl: '/channels/m6.png' },
    { name: 'Arte', number: 7, category: 'culture', logoUrl: '/channels/arte.png' },
    { name: 'C8', number: 8, category: 'general', logoUrl: '/channels/c8.png' },
    { name: 'W9', number: 9, category: 'general', logoUrl: '/channels/w9.png' },
    { name: 'TMC', number: 10, category: 'general', logoUrl: '/channels/tmc.png' },
    { name: 'TFX', number: 11, category: 'general', logoUrl: '/channels/tfx.png' },
    { name: 'NRJ 12', number: 12, category: 'general', logoUrl: '/channels/nrj12.png' },
    { name: 'LCP', number: 13, category: 'news', logoUrl: '/channels/lcp.png' },
    { name: 'France 4', number: 14, category: 'kids', logoUrl: '/channels/france4.png' },
    { name: 'BFM TV', number: 15, category: 'news', logoUrl: '/channels/bfmtv.png' },
    { name: 'CNews', number: 16, category: 'news', logoUrl: '/channels/cnews.png' },
    { name: 'CStar', number: 17, category: 'music', logoUrl: '/channels/cstar.png' },
    { name: 'Gulli', number: 18, category: 'kids', logoUrl: '/channels/gulli.png' },
    { name: 'TF1 Series Films', number: 20, category: 'general', logoUrl: '/channels/tf1sf.png' },
    { name: "L'Equipe", number: 21, category: 'sport', logoUrl: '/channels/lequipe.png' },
    { name: 'RMC Story', number: 23, category: 'general', logoUrl: '/channels/rmcstory.png' },
    { name: 'RMC Decouverte', number: 24, category: 'general', logoUrl: '/channels/rmcdec.png' },
    { name: 'LCI', number: 26, category: 'news', logoUrl: '/channels/lci.png' },
    { name: 'franceinfo:', number: 27, category: 'news', logoUrl: '/channels/franceinfo.png' },
  ];

  await prisma.tvChannel.createMany({ data: tvChannels });
  console.log(`✅ TV Channels: ${tvChannels.length} TNT channels`);

  // ── 24. Streaming Services ───────────
  const streamingServices = [
    { name: 'Netflix', logoUrl: '/streaming/netflix.png', color: '#E50914', sortOrder: 1 },
    { name: 'Disney+', logoUrl: '/streaming/disney.png', color: '#113CCF', sortOrder: 2 },
    { name: 'Amazon Prime Video', logoUrl: '/streaming/prime.png', color: '#00A8E1', sortOrder: 3 },
    { name: 'myCANAL', logoUrl: '/streaming/mycanal.png', color: '#1A1A2E', sortOrder: 4 },
    { name: 'Apple TV+', logoUrl: '/streaming/appletv.png', color: '#000000', sortOrder: 5 },
    { name: 'Paramount+', logoUrl: '/streaming/paramount.png', color: '#0064FF', sortOrder: 6 },
    { name: 'France.tv', logoUrl: '/streaming/francetv.png', color: '#0F1C8E', sortOrder: 7 },
    { name: 'ARTE', logoUrl: '/streaming/arte.png', color: '#FA4616', sortOrder: 8 },
    { name: 'M6+', logoUrl: '/streaming/m6plus.png', color: '#F49E1A', sortOrder: 9 },
    { name: 'YouTube', logoUrl: '/streaming/youtube.png', color: '#FF0000', sortOrder: 10 },
  ];

  await prisma.streamingService.createMany({ data: streamingServices });
  console.log(`✅ Streaming Services: ${streamingServices.length} created`);

  // ── 25. Activity Places (per partner org) ───
  const activitiesLumiere = [
    { name: 'Le Petit Cler', description: 'Restaurant bistronomique, cuisine du marche', category: 'RESTAURANT' as const, address: '29 Rue Cler, 75007 Paris', phone: '01 45 51 49 59', sortOrder: 1 },
    { name: 'Spa Diane Barriere', description: 'Spa & bien-etre de luxe', category: 'SPA' as const, address: '33 Av. George V, 75008 Paris', phone: '01 53 67 31 00', sortOrder: 2 },
    { name: 'Musee du Louvre', description: "Le plus grand musee d'art au monde", category: 'CULTURE' as const, address: 'Rue de Rivoli, 75001 Paris', website: 'https://www.louvre.fr', sortOrder: 3 },
    { name: 'Fitness Park Opera', description: 'Salle de sport 24/7', category: 'SPORT' as const, address: '12 Bd des Italiens, 75009 Paris', sortOrder: 4 },
    { name: 'Le Carmen', description: 'Bar & club dans un hotel particulier', category: 'NIGHTLIFE' as const, address: '34 Rue Duperré, 75009 Paris', sortOrder: 5 },
    { name: 'Galeries Lafayette Haussmann', description: 'Grand magasin iconique', category: 'SHOPPING' as const, address: '40 Bd Haussmann, 75009 Paris', sortOrder: 6 },
  ];

  for (const a of activitiesLumiere) {
    await prisma.activityPlace.create({ data: { ...a, orgId: partnerOrg1.id } });
  }

  const activitiesEcranSud = [
    { name: 'Chez Fonfon', description: 'Bouillabaisse legendaire, vue mer', category: 'RESTAURANT' as const, address: '140 Rue du Vallon des Auffes, 13007 Marseille', phone: '04 91 52 14 38', sortOrder: 1 },
    { name: 'Calanques de Cassis', description: 'Randonnee et baignade dans les calanques', category: 'SPORT' as const, address: 'Cassis, 13260', sortOrder: 2 },
    { name: 'MuCEM', description: 'Musee des civilisations de l\'Europe et de la Mediterranee', category: 'CULTURE' as const, address: '7 Prom. Robert Laffont, 13002 Marseille', website: 'https://www.mucem.org', sortOrder: 3 },
    { name: 'Navette Frioul', description: 'Bateau vers les iles du Frioul', category: 'TRANSPORT' as const, address: '1 Quai de la Fraternite, 13001 Marseille', sortOrder: 4 },
  ];

  for (const a of activitiesEcranSud) {
    await prisma.activityPlace.create({ data: { ...a, orgId: partnerOrg2.id } });
  }

  console.log(`✅ Activities: ${activitiesLumiere.length + activitiesEcranSud.length} places`);

  // ── 26. TV Configs (one per partner screen) ──
  await prisma.tvConfig.create({
    data: {
      screenId: screens[0].id,
      orgId: partnerOrg1.id,
      enabledModules: ['TNT', 'STREAMING', 'ACTIVITIES'],
      defaultTab: 'TNT',
      partnerLogoUrl: '/logos/cinemas-lumiere.png',
      welcomeMessage: 'Bienvenue aux Cinemas Lumiere',
      tickerText: 'Seance de 20h30 : Le nouveau film de Xavier Dolan | Happy Hour au bar du lobby de 18h a 19h',
    },
  });

  await prisma.tvConfig.create({
    data: {
      screenId: screens[3].id,
      orgId: partnerOrg2.id,
      enabledModules: ['TNT', 'STREAMING', 'ACTIVITIES'],
      defaultTab: 'ACTIVITIES',
      partnerLogoUrl: '/logos/ecran-sud.png',
      welcomeMessage: 'Bienvenue au Reseau Ecran Sud',
      tickerText: 'Decouvrez les calanques de Cassis | Restaurant Chez Fonfon : bouillabaisse a -20% ce soir',
    },
  });

  console.log('✅ TV Configs: 2 screen configs');

  // ── 27. TV Macros (one per partner screen) ──
  await prisma.tvMacro.create({
    data: {
      screenId: screens[0].id,
      orgId: partnerOrg1.id,
      spotDuration15s: true,
      spotDuration30s: true,
      skipDelayMs: 7000,
      adRotationMs: 15000,
      splitRatio: 70,
      adOnBoot: true,
      adOnTabChange: true,
      adOnAppOpen: true,
      adOnCatalogOpen: false,
      activitiesSplit: true,
      activitiesAdNoSkip: true,
      maxAdsPerHour: 20,
      maxInterstitialsPerSession: 10,
    },
  });

  await prisma.tvMacro.create({
    data: {
      screenId: screens[3].id,
      orgId: partnerOrg2.id,
      spotDuration15s: true,
      spotDuration30s: false, // Only 15s spots for Ecran Sud
      skipDelayMs: 5000, // Shorter skip delay
      adRotationMs: 10000,
      splitRatio: 65,
      adOnBoot: true,
      adOnTabChange: false, // No tab change interstitials
      adOnAppOpen: true,
      adOnCatalogOpen: true,
      activitiesSplit: true,
      activitiesAdNoSkip: true,
      maxAdsPerHour: 15,
      maxInterstitialsPerSession: 8,
    },
  });

  console.log('✅ TV Macros: 2 screen macros');

  // ── 28. Activity Sponsors ──────────────

  // Get activity IDs for sponsoring
  const louvre = await prisma.activityPlace.findFirst({
    where: { name: 'Musee du Louvre', orgId: partnerOrg1.id },
  });
  const chezFonfon = await prisma.activityPlace.findFirst({
    where: { name: 'Chez Fonfon', orgId: partnerOrg2.id },
  });

  if (louvre) {
    await prisma.activitySponsor.create({
      data: {
        activityPlaceId: louvre.id,
        campaignId: campaign1.id,
        startDate: new Date('2026-01-15'),
        endDate: new Date('2026-03-31'),
        priorityBoost: 100,
        isActive: true,
      },
    });
  }

  if (chezFonfon) {
    await prisma.activitySponsor.create({
      data: {
        activityPlaceId: chezFonfon.id,
        campaignId: campaign2.id,
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-04-30'),
        priorityBoost: 50,
        isActive: true,
      },
    });
  }

  console.log('✅ Activity Sponsors: 2 (FrenchTech→Louvre, MedFood→Chez Fonfon)');

  // ── Done ──────────────────────────────

  console.log('\n🎉 Seed complete!');
  console.log('  Summary:');
  console.log('  - 1 platform admin');
  console.log('  - 2 partner orgs (3 + 2 screens + 1 pending)');
  console.log('  - 2 advertiser orgs');
  console.log('  - 6 screens (5 active + 1 pending) + 5 paired devices');
  console.log('  - 4 campaigns (2 active, 1 draft, 1 pending review)');
  console.log('  - 6 creatives (3 approved, 2 pending moderation, 1 flagged)');
  console.log('  - 2 active bookings');
  console.log('  - 1000 diffusion logs');
  console.log('  - 200 analytics events');
  console.log('  - 50 heartbeats + live status for all screens');
  console.log('  - 2 TV macros + 2 activity sponsors');
  console.log('  - Revenue rules, AI wallets, audit logs, notifications');
  console.log('  - Platform settings, schedule blackout');
  console.log('  Demo accounts (password: Password123!):');
  console.log('  - admin@neofilm.com (SUPER_ADMIN)');
  console.log('  - partner@demo.com (PARTNER / Cinémas Lumière)');
  console.log('  - advertiser@demo.com (ADVERTISER / FrenchTech Ads)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
