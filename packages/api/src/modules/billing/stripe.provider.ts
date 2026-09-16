import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export const STRIPE_CLIENT = 'STRIPE_CLIENT';

export const StripeProvider: Provider = {
  provide: STRIPE_CLIENT,
  useFactory: (config: ConfigService) => {
    // Empty default (not a fake sk_… literal): in dev/prod the real key comes
    // from the environment; an empty key simply makes Stripe calls fail loudly
    // rather than embedding a secret-shaped placeholder that trips scanners.
    const key = config.get<string>('STRIPE_SECRET_KEY', '');
    return new Stripe(key, {
      apiVersion: '2026-02-25.clover',
      typescript: true,
    });
  },
  inject: [ConfigService],
};
