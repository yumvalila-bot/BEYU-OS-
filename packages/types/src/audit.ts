/**
 * BEYU OS — Audit types (spec §59).
 * Audit records must be tamper-resistant: each record carries a hash chained
 * to its predecessor, so any retroactive edit breaks verification.
 */

import { Action, OsId, ResourceType } from './authorization';

export enum AuditOutcome {
  Success = 'SUCCESS',
  Denied = 'DENIED',
  Failure = 'FAILURE',
}

export interface AuditEvent {
  id: string;
  /** Monotonic sequence used for hash chaining. */
  sequence: number;
  actorUserId: string | null;
  actorIdentityId: string | null;
  actorType: 'USER' | 'SERVICE' | 'AI_AGENT' | 'SYSTEM';
  tenantId: string | null;
  organizationId: string | null;
  osId: OsId | string | null;
  action: Action | string;
  resourceType: ResourceType | string;
  resourceId: string | null;
  outcome: AuditOutcome;
  /** JSON snapshot before the change. Null for reads/creates. */
  previousState: Record<string, unknown> | null;
  /** JSON snapshot after the change. Null for reads/deletes. */
  newState: Record<string, unknown> | null;
  /** Serialized authorization decision that permitted or denied the action. */
  authorizationContext: Record<string, unknown> | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  applicationContext: string | null;
  occurredAt: string;
  /** SHA-256 over canonical payload + previousHash. */
  hash: string;
  previousHash: string | null;
}

export interface AuditChainVerification {
  valid: boolean;
  checkedCount: number;
  /** Sequence number of the first record that failed verification. */
  brokenAtSequence?: number;
  reason?: string;
}
