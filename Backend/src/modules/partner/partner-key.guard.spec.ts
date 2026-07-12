import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PartnerKeyGuard } from './partner-key.guard';

const API_KEY = 'test-partner-key-abc123';

const context = (authorization?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authorization ? { authorization } : {},
      }),
    }),
  }) as unknown as ExecutionContext;

describe('PartnerKeyGuard', () => {
  let guard: PartnerKeyGuard;

  beforeEach(() => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue(API_KEY),
    } as unknown as ConfigService;
    guard = new PartnerKeyGuard(config);
  });

  it('allows a request carrying the correct Bearer key', () => {
    expect(guard.canActivate(context(`Bearer ${API_KEY}`))).toBe(true);
  });

  it('rejects a missing Authorization header', () => {
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });

  it('rejects a non-Bearer scheme', () => {
    expect(() => guard.canActivate(context(API_KEY))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a wrong key of the same length', () => {
    const wrong = `Bearer ${'x'.repeat(API_KEY.length)}`;
    expect(() => guard.canActivate(context(wrong))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a wrong key of a different length', () => {
    expect(() => guard.canActivate(context('Bearer short'))).toThrow(
      UnauthorizedException,
    );
  });
});
