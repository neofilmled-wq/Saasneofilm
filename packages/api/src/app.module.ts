import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as path from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ScreensModule } from './modules/screens/screens.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { CreativesModule } from './modules/creatives/creatives.module';
import { DevicesModule } from './modules/devices/devices.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { DiffusionModule } from './modules/diffusion/diffusion.module';
import { BillingModule } from './modules/billing/billing.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { RevenueModule } from './modules/revenue/revenue.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { FraudModule } from './modules/fraud/fraud.module';
import { ExportsModule } from './modules/exports/exports.module';
import { RedisModule } from './modules/redis/redis.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { StorageModule } from './modules/storage/storage.module';
import { DeviceGatewayModule } from './modules/device-gateway/device-gateway.module';
import { AdminModule } from './modules/admin/admin.module';
import { EmailModule } from './modules/email/email.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { TvConfigModule } from './modules/tv-config/tv-config.module';
import { CanvaModule } from './modules/canva/canva.module';
import { PartnerGatewayModule } from './modules/partner-gateway/partner-gateway.module';
import { PartnerProfileModule } from './modules/partner-profile/partner-profile.module';
import { TvStreamsModule } from './modules/tv-streams/tv-streams.module';
import { PartnerCommissionsModule } from './modules/partner-commissions/partner-commissions.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { AdvertiserGatewayModule } from './modules/advertiser-gateway/advertiser-gateway.module';
import { AdsEngineModule } from './modules/ads-engine/ads-engine.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { VenuesModule } from './modules/venues/venues.module';
import { SitesModule } from './modules/sites/sites.module';
import { TvAppDownloadModule } from './modules/tv-app-download/tv-app-download.module';
import { JwtAuthGuard, RolesGuard, PermissionsGuard } from './common/guards';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(__dirname, '..', '..', '..', '.env'),
        path.resolve(__dirname, '..', '.env'),
        '.env',
      ],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    RedisModule,
    JobsModule,
    StorageModule,
    AuditModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ScreensModule,
    CampaignsModule,
    CreativesModule,
    DevicesModule,
    SchedulesModule,
    InvoicesModule,
    AnalyticsModule,
    HealthModule,
    DiffusionModule,
    BillingModule,
    WebhooksModule,
    RevenueModule,
    PayoutsModule,
    FraudModule,
    ExportsModule,
    DeviceGatewayModule,
    AdminModule,
    MessagingModule,
    TvConfigModule,
    CanvaModule,
    PartnerGatewayModule,
    PartnerProfileModule,
    TvStreamsModule,
    PartnerCommissionsModule,
    CatalogueModule,
    PricingModule,
    AdvertiserGatewayModule,
    AdsEngineModule,
    RealtimeModule,
    VenuesModule,
    SitesModule,
    TvAppDownloadModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
