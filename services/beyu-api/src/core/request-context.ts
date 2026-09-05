/**
 * Per-request ambient context (spec §55, §57).
 *
 * Carried in AsyncLocalStorage so repositories can reach the tenant/user GUCs
 * without threading them through every call signature. The store is populated
 * once, by the authentication guard, from a verified token — never from a
 * client-supplied header.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import type { SecurityContext } from '@beyu/types';

export interface BeyuRequestContext {
  requestId: string;
  startedAt: number;
  ipAddress: string | null;
  userAgent: string | null;
  method: string;
  path: string;
  /** Null until the authentication guard resolves a principal. */
  security: SecurityContext | null;
}

const storage = new AsyncLocalStorage<BeyuRequestContext>();

export function runWithRequestContext<T>(context: BeyuRequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Returns the active context, or null outside a request (jobs, CLI, tests). */
export function getRequestContext(): BeyuRequestContext | null {
  return storage.getStore() ?? null;
}

/** Returns the active context or throws. Use where a request is guaranteed. */
export function requireRequestContext(): BeyuRequestContext {
  const context = storage.getStore();
  if (!context) {
    throw new Error('No active request context. This code must run inside an HTTP request.');
  }
  return context;
}

/** Returns the authenticated principal, or null when unauthenticated. */
export function getSecurityContext(): SecurityContext | null {
  return storage.getStore()?.security ?? null;
}

/**
 * Attaches the authenticated principal to the current request. Called exactly
 * once per request by the authentication guard.
 */
export function setSecurityContext(security: SecurityContext): void {
  const context = storage.getStore();
  if (!context) {
    throw new Error('Cannot attach a security context outside a request.');
  }
  if (context.security) {
    throw new Error('The security context for this request has already been set.');
  }
  context.security = security;
}
