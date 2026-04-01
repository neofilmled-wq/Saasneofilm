import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { DeviceAuthController } from './device-auth.controller';
import { DeviceAuthService } from './device-auth.service';
import { MfaService } from './mfa.service';
import { MfaController } from './mfa.controller';
import { BruteForceService } from './brute-force.service';
import { AnomalyService } from './anomaly.service';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { TvAuthController } from './tv-auth.controller';
import { TvAuthService } from './tv-auth.service';
import { PartnerGatewayModule } from '../partner-gateway/partner-gateway.module';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { AdminModule } from '../admin/admin.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'change-this-in-production-minimum-32-chars'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRATION', '15m') as any },
      }),
    }),
    AuditModule,
    UsersModule,
    AdminModule,
    EmailModule,
    PartnerGatewayModule,
  ],
  controllers: [AuthController, DeviceAuthController, TvAuthController, MfaController, OAuthController, OnboardingController],
  providers: [AuthService, JwtStrategy, LocalStrategy, DeviceAuthService, TvAuthService, MfaService, BruteForceService, AnomalyService, OAuthService, OnboardingService],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
