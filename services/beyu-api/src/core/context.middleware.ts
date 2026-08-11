/**
 * Establishes the per-request context (spec §39, §55).
 *
 * Runs before everything else so that a request id exists for logging and
 * auditing even when authentication later fails.
 */

import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';

import { runWithRequestContext, type BeyuRequestContext } from './request-context';

interface MinimalRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

interface MinimalResponse {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(req: MinimalRequest, res: MinimalResponse, next: () => void): void {
    const incoming = header(req, 'x-request-id');
    // Accept a caller-supplied id for distributed tracing, but never trust it
    // for anything security-relevant — it is a correlation label only.
    const requestId = incoming && /^[\w.:-]{1,128}$/.test(incoming) ? incoming : randomUUID();

    const context: BeyuRequestContext = {
      requestId,
      startedAt: Date.now(),
      ipAddress: clientIp(req),
      userAgent: header(req, 'user-agent'),
      method: (req.method ?? 'GET').toUpperCase(),
      path: (req.originalUrl ?? req.url ?? '/').split('?')[0] ?? '/',
      security: null,
    };

    res.setHeader('x-request-id', requestId);
    runWithRequestContext(context, next);
  }
}

function header(req: MinimalRequest, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function clientIp(req: MinimalRequest): string | null {
  const forwarded = header(req, 'x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return req.ip ?? req.socket?.remoteAddress ?? null;
}
