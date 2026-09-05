/**
 * Retrieving the authenticated principal inside a handler.
 *
 * Controllers call `requireSecurity()` rather than reading the context
 * themselves so that the "there must be a principal here" assumption is stated
 * once. By the time a handler runs, AuthenticationGuard and AuthorizationGuard
 * have both passed, so a missing context is a wiring bug in the application —
 * not a client error — and it should surface loudly rather than as a confusing
 * downstream null dereference.
 */

import { UnauthorizedException } from '@nestjs/common';

import type { SecurityContext } from '@beyu/types';

import { getSecurityContext } from '../core/request-context';

export function requireSecurity(): SecurityContext {
  const security = getSecurityContext();
  if (!security) {
    throw new UnauthorizedException('Authentication is required.');
  }
  return security;
}
