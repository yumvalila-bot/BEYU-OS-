/**
 * Uniform error responses (spec §51).
 *
 * Clients receive a stable shape with a request id they can quote to support.
 * Internal error details are never leaked in production: an unhandled
 * exception could carry a SQL fragment or a connection string.
 */

import {
  type ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';

import { loadConfig } from '@beyu/config';

import { getRequestContext } from './request-context';

export interface ErrorBody {
  error: {
    status: number;
    code: string;
    message: string;
    requestId: string | null;
    timestamp: string;
    details?: unknown;
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status(code: number): { json(body: ErrorBody): void };
    }>();
    const isProduction = loadConfig().env === 'production';
    const requestId = getRequestContext()?.requestId ?? null;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error.';
    let code = 'INTERNAL_ERROR';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const body = payload as { message?: unknown; error?: unknown };
        message = Array.isArray(body.message)
          ? body.message.join('; ')
          : String(body.message ?? exception.message);
        if (Array.isArray(body.message)) details = body.message;
      }
      code = HttpStatus[status] ?? 'ERROR';
    } else if (exception instanceof Error) {
      // Unexpected: log the full error, return a generic message.
       
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'UNHANDLED_EXCEPTION',
          requestId,
          error: exception.message,
          stack: exception.stack,
        }),
      );
      if (!isProduction) {
        message = exception.message;
        details = exception.stack;
      }
    }

    response.status(status).json({
      error: {
        status,
        code,
        message,
        requestId,
        timestamp: new Date().toISOString(),
        ...(details !== undefined ? { details } : {}),
      },
    });
  }
}
