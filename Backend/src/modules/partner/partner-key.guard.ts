import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const BEARER_PREFIX = 'Bearer ';

// Authenticates partner-API requests against the single shared PARTNER_API_KEY.
// The env var is the secret store, so the key is compared in plaintext — but
// in constant time, so a wrong key leaks no length/prefix information.
@Injectable()
export class PartnerKeyGuard implements CanActivate {
  private readonly apiKey: Buffer;

  constructor(config: ConfigService) {
    this.apiKey = Buffer.from(config.getOrThrow<string>('PARTNER_API_KEY'));
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;

    if (!header?.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException('Missing or malformed partner API key');
    }

    const provided = Buffer.from(header.slice(BEARER_PREFIX.length));
    // timingSafeEqual requires equal-length buffers; an unequal length is
    // already a mismatch, so reject before calling it.
    if (
      provided.length !== this.apiKey.length ||
      !timingSafeEqual(provided, this.apiKey)
    ) {
      throw new UnauthorizedException('Invalid partner API key');
    }

    return true;
  }
}
