import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DB } from '@core/database/database.module';
import { MailService } from './mail.service';

const mockConfig: Record<string, string> = {
  BREVO_API_KEY: 'test-api-key',
  BREVO_API_URL: 'https://api.brevo.com/v3/smtp/email',
  MAIL_FROM_NAME: 'CoGo',
  MAIL_FROM_EMAIL: 'test@cogo.app',
  BETTER_AUTH_URL: 'https://api.test',
};

const TEST_VERIFY = {
  userId: 'user-1',
  email: 'test@example.com',
  url: 'http://localhost:3000/api/auth/verify-email?token=abc',
};

const TEST_RESET = {
  userId: 'user-1',
  email: 'test@example.com',
  url: 'http://localhost:3000/api/auth/reset-password?token=abc',
};

const mockFetch = (overrides: Partial<Response> = {}) =>
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(''),
    ...overrides,
  } as Response);

const buildDbMock = (locale: string | null | undefined) => ({
  select: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest
          .fn()
          .mockResolvedValue(locale === undefined ? [] : [{ locale }]),
      }),
    }),
  }),
});

const lastBody = (): Record<string, unknown> => {
  const calls = (global.fetch as jest.Mock).mock.calls as [
    string,
    { body: string },
  ][];
  return JSON.parse(calls[0][1].body) as Record<string, unknown>;
};

const buildService = async (
  locale: string | null | undefined,
  configOverrides: Partial<Record<string, string | undefined>> = {},
): Promise<MailService> => {
  const merged = { ...mockConfig, ...configOverrides };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MailService,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => merged[key],
          getOrThrow: (key: string) => {
            const value = merged[key];
            if (!value) throw new Error(`Missing config: ${key}`);
            return value;
          },
        },
      },
      { provide: DB, useValue: buildDbMock(locale) },
    ],
  }).compile();

  return module.get<MailService>(MailService);
};

describe('MailService', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  describe('sendVerificationEmail', () => {
    it('uses the user locale when present (ca)', async () => {
      mockFetch();
      const service = await buildService('ca');

      await service.sendVerificationEmail(TEST_VERIFY);

      expect(lastBody().subject).toBe('Verifica el teu correu electrònic');
    });

    it('uses English when profile locale is en', async () => {
      mockFetch();
      const service = await buildService('en');

      await service.sendVerificationEmail(TEST_VERIFY);

      expect(lastBody().subject).toBe('Verify your email address');
    });

    it('falls back to es when profile row is missing', async () => {
      mockFetch();
      const service = await buildService(undefined);

      await service.sendVerificationEmail(TEST_VERIFY);

      expect(lastBody().subject).toBe('Verifica tu correo electrónico');
    });

    it('falls back to es when locale is null', async () => {
      mockFetch();
      const service = await buildService(null);

      await service.sendVerificationEmail(TEST_VERIFY);

      expect(lastBody().subject).toBe('Verifica tu correo electrónico');
    });

    it('falls back to es when locale value is unsupported', async () => {
      mockFetch();
      const service = await buildService('fr');

      await service.sendVerificationEmail(TEST_VERIFY);

      expect(lastBody().subject).toBe('Verifica tu correo electrónico');
    });

    it('renders the localized CTA button and verification URL in the HTML', async () => {
      mockFetch();
      const service = await buildService('en');

      await service.sendVerificationEmail(TEST_VERIFY);

      const html = lastBody().htmlContent as string;
      expect(html).toContain('Verify email');
      expect(html).toContain(TEST_VERIFY.url);
    });

    it('embeds the logo image served from /static off BETTER_AUTH_URL', async () => {
      mockFetch();
      const service = await buildService('en');

      await service.sendVerificationEmail(TEST_VERIFY);

      const html = lastBody().htmlContent as string;
      expect(html).toContain(
        '<img src="https://api.test/static/cogo-logo.png"',
      );
      expect(html).toContain('alt="CoGo"');
    });

    it('throws when the Brevo API returns an error', async () => {
      mockFetch({ ok: false, text: () => Promise.resolve('Unauthorized') });
      const service = await buildService('es');

      await expect(service.sendVerificationEmail(TEST_VERIFY)).rejects.toThrow(
        'Failed to send email: Unauthorized',
      );
    });
  });

  describe('sendResetPasswordEmail', () => {
    it('uses the user locale when present (ca)', async () => {
      mockFetch();
      const service = await buildService('ca');

      await service.sendResetPasswordEmail(TEST_RESET);

      expect(lastBody().subject).toBe('Restableix la teva contrasenya');
    });

    it('uses English when profile locale is en', async () => {
      mockFetch();
      const service = await buildService('en');

      await service.sendResetPasswordEmail(TEST_RESET);

      expect(lastBody().subject).toBe('Reset your password');
    });

    it('falls back to es when profile row is missing', async () => {
      mockFetch();
      const service = await buildService(undefined);

      await service.sendResetPasswordEmail(TEST_RESET);

      expect(lastBody().subject).toBe('Restablece tu contraseña');
    });

    it('renders the localized CTA button and reset URL in the HTML', async () => {
      mockFetch();
      const service = await buildService('es');

      await service.sendResetPasswordEmail(TEST_RESET);

      const html = lastBody().htmlContent as string;
      expect(html).toContain('Elegir nueva contraseña');
      expect(html).toContain(TEST_RESET.url);
    });

    it('throws when the Brevo API returns an error', async () => {
      mockFetch({ ok: false, text: () => Promise.resolve('Unauthorized') });
      const service = await buildService('es');

      await expect(service.sendResetPasswordEmail(TEST_RESET)).rejects.toThrow(
        'Failed to send email: Unauthorized',
      );
    });
  });
});
