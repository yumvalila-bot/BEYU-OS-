import { HttpException, HttpStatus } from '@nestjs/common';

export class AppError extends HttpException {
  constructor(status: HttpStatus, message: string, public readonly code?: string) {
    super({ statusCode: status, error: HttpStatus[status], message, code }, status);
  }
}
export function notFound(resource: string, id: string): never {
  throw new AppError(HttpStatus.NOT_FOUND, `${resource} ${id} not found`, 'NOT_FOUND');
}
export function forbidden(message = 'Forbidden'): never {
  throw new AppError(HttpStatus.FORBIDDEN, message, 'FORBIDDEN');
}
export function badRequest(message: string): never {
  throw new AppError(HttpStatus.BAD_REQUEST, message, 'BAD_REQUEST');
}
export function conflict(message: string): never {
  throw new AppError(HttpStatus.CONFLICT, message, 'CONFLICT');
}
export function unauthorized(message = 'Unauthorized'): never {
  throw new AppError(HttpStatus.UNAUTHORIZED, message, 'UNAUTHORIZED');
}
export function unprocessable(message: string): never {
  throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, message, 'UNPROCESSABLE');
}
