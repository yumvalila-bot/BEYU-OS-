import { AsyncLocalStorage } from 'node:async_hooks';
import type { HealthSecurityContext } from '../common/security';

export interface RequestContext {
  requestId: string;
  security?: HealthSecurityContext;
  ip?: string;
  userAgent?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
export function getSecurityContext(): HealthSecurityContext | undefined {
  return getRequestContext()?.security;
}
