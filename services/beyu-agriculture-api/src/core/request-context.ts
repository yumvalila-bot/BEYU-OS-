import { AsyncLocalStorage } from 'node:async_hooks';
import type { AgriSecurityContext } from '../common/security';

export interface RequestContext {
  requestId: string;
  security?: AgriSecurityContext;
  ip?: string;
  userAgent?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
export function getSecurityContext(): AgriSecurityContext | undefined {
  return getRequestContext()?.security;
}
