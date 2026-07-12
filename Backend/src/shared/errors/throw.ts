import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { type ErrorCode } from './error-codes';

type Details = Record<string, unknown>;

function buildBody(code: ErrorCode, message: string, details?: Details) {
  return details ? { code, message, details } : { code, message };
}

export function throwBadRequest(
  code: ErrorCode,
  message: string,
  details?: Details,
): never {
  throw new BadRequestException(buildBody(code, message, details));
}

export function throwUnauthorized(
  code: ErrorCode,
  message: string,
  details?: Details,
): never {
  throw new UnauthorizedException(buildBody(code, message, details));
}

export function throwForbidden(
  code: ErrorCode,
  message: string,
  details?: Details,
): never {
  throw new ForbiddenException(buildBody(code, message, details));
}

export function throwNotFound(
  code: ErrorCode,
  message: string,
  details?: Details,
): never {
  throw new NotFoundException(buildBody(code, message, details));
}

export function throwConflict(
  code: ErrorCode,
  message: string,
  details?: Details,
): never {
  throw new ConflictException(buildBody(code, message, details));
}

export function throwInternalServerError(
  code: ErrorCode,
  message: string,
  details?: Details,
): never {
  throw new InternalServerErrorException(buildBody(code, message, details));
}
