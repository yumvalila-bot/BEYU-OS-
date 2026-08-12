import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { getRequestContext } from './request-context';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = getRequestContext()?.requestId ?? (request.headers['x-request-id'] as string) ?? 'unknown';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code: string | undefined;
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as any;
      message = typeof res === 'string' ? res : res?.message ?? res?.error ?? message;
      code = res?.code;
    } else {
      this.logger.error(`Unhandled error on ${request.method} ${request.url}`, exception instanceof Error ? exception.stack : String(exception));
    }
    response.status(status).header('x-request-id', requestId).json({
      statusCode: status,
      error: HttpStatus[status],
      message,
      code,
      requestId,
      path: request.url,
    });
  }
}
