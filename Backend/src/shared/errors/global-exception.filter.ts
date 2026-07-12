import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { type ErrorCode } from './error-codes';

const STATUS_DEFAULT_CODE: Partial<Record<number, ErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  500: 'INTERNAL_ERROR',
};

type NormalizedError = {
  code: ErrorCode;
  statusCode: number;
  message: string;
  details: Record<string, unknown> | null;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(this.normalize(status, body));
      return;
    }

    this.logger.error('Unhandled exception', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      details: null,
    } satisfies NormalizedError);
  }

  private normalize(status: number, body: string | object): NormalizedError {
    const defaultCode = STATUS_DEFAULT_CODE[status] ?? 'INTERNAL_ERROR';

    if (typeof body === 'string') {
      return {
        code: defaultCode,
        statusCode: status,
        message: body,
        details: null,
      };
    }

    const obj = body as Record<string, unknown>;

    // ValidationPipe sentinel: `{ statusCode, message: string[], error }`.
    if (Array.isArray(obj.message)) {
      return {
        code: 'VALIDATION_FAILED',
        statusCode: status,
        message: 'Validation failed',
        details: { errors: obj.message },
      };
    }

    const code = (
      typeof obj.code === 'string' ? obj.code : defaultCode
    ) as ErrorCode;
    const message =
      typeof obj.message === 'string'
        ? obj.message
        : ((obj.error as string | undefined) ?? 'Error');
    const details =
      (obj.details as Record<string, unknown> | undefined) ?? null;

    return { code, statusCode: status, message, details };
  }
}
