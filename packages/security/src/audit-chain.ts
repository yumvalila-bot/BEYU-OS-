/**
 * BEYU OS — Tamper-resistant audit hash chain (spec §59).
 *
 * Each audit record's hash covers its canonical content AND the hash of the
 * previous record. Editing or deleting any historical row breaks verification
 * for every subsequent row, making silent tampering detectable.
 */

import { createHash } from 'node:crypto';
import { AuditChainVerification, AuditEvent } from '@beyu/types';

/** Deterministic JSON with sorted keys — hashing must be reproducible. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(',')}}`;
}

/** The subset of an audit event that is covered by the hash. */
export interface AuditHashInput {
  sequence: number;
  actorUserId: string | null;
  actorType: string;
  tenantId: string | null;
  organizationId: string | null;
  osId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  occurredAt: string;
  previousHash: string | null;
}

/** Computes the SHA-256 chain hash for an audit record. */
export function computeAuditHash(input: AuditHashInput): string {
  const canonical = canonicalJson({
    sequence: input.sequence,
    actorUserId: input.actorUserId,
    actorType: input.actorType,
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    osId: input.osId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: input.outcome,
    previousState: input.previousState,
    newState: input.newState,
    occurredAt: input.occurredAt,
    previousHash: input.previousHash,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** The genesis hash used for the first record in a chain. */
export const AUDIT_GENESIS_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Verifies an ordered slice of the audit chain.
 * `events` must be sorted ascending by sequence and start either at the
 * genesis record or at a record whose previousHash is known-good.
 */
export function verifyAuditChain(events: AuditEvent[]): AuditChainVerification {
  if (events.length === 0) {
    return { valid: true, checkedCount: 0 };
  }

  let expectedPrevious: string | null = events[0].previousHash;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    if (i > 0 && event.previousHash !== events[i - 1].hash) {
      return {
        valid: false,
        checkedCount: i,
        brokenAtSequence: event.sequence,
        reason:
          `Record ${event.sequence} does not chain to record ` +
          `${events[i - 1].sequence}: previousHash mismatch.`,
      };
    }

    const recomputed = computeAuditHash({
      sequence: event.sequence,
      actorUserId: event.actorUserId,
      actorType: event.actorType,
      tenantId: event.tenantId,
      organizationId: event.organizationId,
      osId: (event.osId as string | null) ?? null,
      action: String(event.action),
      resourceType: String(event.resourceType),
      resourceId: event.resourceId,
      outcome: event.outcome,
      previousState: event.previousState,
      newState: event.newState,
      occurredAt: event.occurredAt,
      previousHash: event.previousHash,
    });

    if (recomputed !== event.hash) {
      return {
        valid: false,
        checkedCount: i,
        brokenAtSequence: event.sequence,
        reason:
          `Record ${event.sequence} has been altered: stored hash does not match ` +
          'recomputed hash of its contents.',
      };
    }

    expectedPrevious = event.hash;
  }

  void expectedPrevious;
  return { valid: true, checkedCount: events.length };
}
