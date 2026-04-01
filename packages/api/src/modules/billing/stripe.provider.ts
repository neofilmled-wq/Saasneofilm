import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export const STRIPE_CLIENT = 'STRIPE_CLIENT';

export const StripeProvider: Provider = {
  provide: STRIPE_CLIENT,
  useFactory: (config: ConfigService) => {
    const key = config.get<string>('STRIPE_SECRET_KEY', 'sk_test_placeholder');
    return new Stripe(key, {
      apiVersion: '2026-02-25.clover',
      typescript: true,
    });
  },
  inject: [ConfigService],
};
