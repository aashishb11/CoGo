import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';

describe('StripeService', () => {
  const buildConfig = (
    overrides: Partial<Record<string, string>> = {},
  ): ConfigService => {
    const map: Record<string, string> = {
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_payments',
      STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_test_connect',
      WALLET_RETURN_URL: 'cogo://wallet',
      CONNECT_RETURN_URL: 'cogo://wallet/payout-account',
      CONNECT_REFRESH_URL: 'cogo://wallet/payout-account?refresh=1',
      ...overrides,
    };
    return {
      getOrThrow: <T>(key: string): T => {
        const value = map[key];
        if (value === undefined) {
          throw new Error(`Missing config key ${key}`);
        }
        return value as unknown as T;
      },
    } as ConfigService;
  };

  it('verifies a signed payments webhook payload', () => {
    const service = new StripeService(buildConfig());
    const payload = JSON.stringify({
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test' } },
    });
    const signature = StripeService.generateTestSignature(
      payload,
      'whsec_test_payments',
    );

    const event = service.constructPaymentsEvent(payload, signature);

    expect(event.id).toBe('evt_test_123');
    expect(event.type).toBe('checkout.session.completed');
  });

  it('rejects a payments webhook signed with the connect secret', () => {
    const service = new StripeService(buildConfig());
    const payload = JSON.stringify({ id: 'evt_x', type: 'whatever' });
    const signature = StripeService.generateTestSignature(
      payload,
      'whsec_test_connect',
    );

    expect(() => service.constructPaymentsEvent(payload, signature)).toThrow();
  });

  it('verifies a signed connect webhook payload', () => {
    const service = new StripeService(buildConfig());
    const payload = JSON.stringify({
      id: 'evt_connect_1',
      type: 'account.updated',
      data: { object: { id: 'acct_1' } },
    });
    const signature = StripeService.generateTestSignature(
      payload,
      'whsec_test_connect',
    );

    const event = service.constructConnectEvent(payload, signature);

    expect(event.id).toBe('evt_connect_1');
  });
});
