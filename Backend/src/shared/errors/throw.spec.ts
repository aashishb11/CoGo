import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  throwBadRequest,
  throwConflict,
  throwForbidden,
  throwInternalServerError,
  throwNotFound,
  throwUnauthorized,
} from './throw';

describe('throwBadRequest', () => {
  it('throws a BadRequestException with the code and message body', () => {
    expect(() => throwBadRequest('VALIDATION_FAILED', 'Bad input')).toThrow(
      BadRequestException,
    );

    try {
      throwBadRequest('VALIDATION_FAILED', 'Bad input');
    } catch (err) {
      expect((err as BadRequestException).getResponse()).toEqual({
        code: 'VALIDATION_FAILED',
        message: 'Bad input',
      });
    }
  });

  it('includes the details object when provided', () => {
    try {
      throwBadRequest('VALIDATION_FAILED', 'Bad input', { field: 'email' });
    } catch (err) {
      expect((err as BadRequestException).getResponse()).toEqual({
        code: 'VALIDATION_FAILED',
        message: 'Bad input',
        details: { field: 'email' },
      });
    }
  });
});

describe('throwUnauthorized', () => {
  it('throws an UnauthorizedException with the code and message body', () => {
    expect(() => throwUnauthorized('UNAUTHORIZED', 'Token expired')).toThrow(
      UnauthorizedException,
    );

    try {
      throwUnauthorized('UNAUTHORIZED', 'Token expired');
    } catch (err) {
      expect((err as UnauthorizedException).getResponse()).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Token expired',
      });
    }
  });

  it('includes the details object when provided', () => {
    try {
      throwUnauthorized('UNAUTHORIZED', 'Token expired', { reason: 'jwt-exp' });
    } catch (err) {
      expect((err as UnauthorizedException).getResponse()).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Token expired',
        details: { reason: 'jwt-exp' },
      });
    }
  });
});

describe('throwForbidden', () => {
  it('throws a ForbiddenException with the code and message body', () => {
    expect(() => throwForbidden('FORBIDDEN', 'No access')).toThrow(
      ForbiddenException,
    );
  });
});

describe('throwNotFound', () => {
  it('throws a NotFoundException with the code and message body', () => {
    try {
      throwNotFound('NOT_FOUND', 'Trip not found');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toEqual({
        code: 'NOT_FOUND',
        message: 'Trip not found',
      });
    }
  });
});

describe('throwConflict', () => {
  it('throws a ConflictException with the code and message body', () => {
    try {
      throwConflict('CONFLICT', 'Already exists');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toEqual({
        code: 'CONFLICT',
        message: 'Already exists',
      });
    }
  });
});

describe('throwInternalServerError', () => {
  it('throws an InternalServerErrorException with the code and message body', () => {
    expect(() => throwInternalServerError('INTERNAL_ERROR', 'Boom')).toThrow(
      InternalServerErrorException,
    );

    try {
      throwInternalServerError('INTERNAL_ERROR', 'Boom');
    } catch (err) {
      expect((err as InternalServerErrorException).getResponse()).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Boom',
      });
    }
  });

  it('includes the details object when provided', () => {
    try {
      throwInternalServerError('INTERNAL_ERROR', 'Boom', {
        upstream: 'stripe',
      });
    } catch (err) {
      expect((err as InternalServerErrorException).getResponse()).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Boom',
        details: { upstream: 'stripe' },
      });
    }
  });
});
