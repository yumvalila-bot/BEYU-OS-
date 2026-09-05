import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { requestContextStorage } from './request-context';

@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
    const ip = (req.headers['x-forwarded-for'] as string) ?? (req as any).ip;
    const userAgent = req.headers['user-agent'] as string;
    requestContextStorage.run({ requestId, ip, userAgent }, () => next());
  }
}
