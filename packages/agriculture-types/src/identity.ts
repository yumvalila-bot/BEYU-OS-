/** Identity contracts — users, sessions, security context. */

export interface AgriUserRecord {
  id: string;
  identityId: string | null;
  email: string;
  displayName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'LOCKED';
  mfaEnabled: boolean;
  roles: string[];
  activeTenantId: string | null;
}

export interface AgriLoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
    activeTenantId: string | null;
    mfaRequired: boolean;
  };
}

/** Resolved per-request security context (mirrors control-plane semantics). */
export interface AgriSecurityContext {
  userId: string;
  identityId?: string | null;
  email: string;
  displayName: string;
  tenantId: string | null;
  farmIds: string[];
  roles: string[];
  permissions: Array<{ resource: string; action: string }>;
  activeTenantId: string | null;
  mfaSatisfied: boolean;
  isServiceAccount: boolean;
  purposeOfUse?: string | null;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}
