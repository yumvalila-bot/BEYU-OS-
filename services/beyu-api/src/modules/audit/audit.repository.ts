/**
 * BEYU OS — audit repository (spec §39).
 *
 * The single place audit records are written. Every mutating operation in the
 * API funnels through `append()`, which:
 *   1. locks the chain tail so concurrent writers cannot fork it,
 *   2. computes the SHA-256 hash over the canonical payload + previous hash,
 *   3. inserts the record.
 *
 * The table itself rejects UPDATE and DELETE (migration 0005), so a record,
 * once written, can only be removed by someone with DDL rights — and removing
 * it breaks the chain, which `verify()` will detect.
 */

import {
  AUDIT_GENESIS_HASH,
  computeAuditHash,
  verifyAuditChain,
} from '@beyu/security';
import type { AuditChainVerification, AuditEvent } from '@beyu/types';
import type { Database, DatabaseSession } from '../../db/driver';

export interface AppendAuditInput {
  actorUserId: string | null;
  actorIdentityId?: string | null;
  actorType: 'USER' | 'SERVICE' | 'AI_AGENT' | 'SYSTEM';
  tenantId: string | null;
  organizationId: string | null;
  osId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILURE' | 'ERROR';
  reason?: string | null;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  authorizationContext?: Record<string, unknown> | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  applicationContext?: string | null;
}

export class AuditRepository {
  constructor(private readonly db: Database) {}

  /**
   * Appends one record to the hash chain.
   *
   * Pass an existing `session` to write the audit record in the SAME
   * transaction as the change it describes. That is what makes "every mutation
   * is audited" a guarantee rather than a hope: if the audit insert fails, the
   * business change rolls back with it.
   */
  async append(input: AppendAuditInput, session?: DatabaseSession): Promise<AuditEvent> {
    const run = async (s: DatabaseSession): Promise<AuditEvent> => {
      // Serialize chain appends. Without this, two concurrent writers could
      // read the same tail and produce two records claiming the same
      // predecessor, forking the chain.
      await s.query('LOCK TABLE audit.audit_log IN EXCLUSIVE MODE');

      const tail = await s.query<{ sequence: string; entry_hash: string }>(
        'SELECT sequence, entry_hash FROM audit.audit_log ORDER BY sequence DESC LIMIT 1',
      );
      const previousHash = tail.rows[0]?.entry_hash ?? AUDIT_GENESIS_HASH;
      const sequence = Number(tail.rows[0]?.sequence ?? 0) + 1;

      // Millisecond precision, matching the TIMESTAMPTZ(3) column and the
      // ISO-8601 string the hash is computed over.
      const occurredAt = new Date().toISOString();

      const hash = computeAuditHash({
        sequence,
        actorUserId: input.actorUserId,
        actorType: input.actorType,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        osId: input.osId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        outcome: input.outcome,
        reason: input.reason ?? null,
        previousState: input.previousState ?? null,
        newState: input.newState ?? null,
        occurredAt,
        previousHash,
      });

      const inserted = await s.query<{ id: string; sequence: string }>(
        `INSERT INTO audit.audit_log (
           sequence, occurred_at, actor_user_id, actor_identity_id, actor_type,
           action, resource_type, resource_id, organization_id, tenant_id, os_id,
           outcome, reason, previous_state, new_state, authorization_context,
           request_id, ip_address, user_agent, application_context,
           previous_hash, entry_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING id, sequence`,
        [
          sequence,
          occurredAt,
          input.actorUserId,
          input.actorIdentityId ?? null,
          input.actorType,
          input.action,
          input.resourceType,
          input.resourceId,
          input.organizationId,
          input.tenantId,
          input.osId,
          input.outcome,
          input.reason ?? null,
          input.previousState ? JSON.stringify(input.previousState) : null,
          input.newState ? JSON.stringify(input.newState) : null,
          input.authorizationContext ? JSON.stringify(input.authorizationContext) : null,
          input.requestId ?? null,
          input.ipAddress ?? null,
          input.userAgent ?? null,
          input.applicationContext ?? null,
          previousHash,
          hash,
        ],
      );

      return {
        id: inserted.rows[0].id,
        sequence,
        actorUserId: input.actorUserId,
        actorIdentityId: input.actorIdentityId ?? null,
        actorType: input.actorType,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        osId: input.osId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        outcome: input.outcome,
        previousState: input.previousState ?? null,
        newState: input.newState ?? null,
        authorizationContext: input.authorizationContext ?? null,
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        applicationContext: input.applicationContext ?? null,
        occurredAt,
        hash,
        previousHash,
      } as AuditEvent;
    };

    return session ? run(session) : this.db.transaction(run);
  }

  /** Reads a slice of the chain, ordered for verification. */
  async list(options: { fromSequence?: number; limit?: number } = {}): Promise<AuditEvent[]> {
    const result = await this.db.query<Record<string, any>>(
      `SELECT * FROM audit.audit_log
        WHERE sequence >= $1
        ORDER BY sequence ASC
        LIMIT $2`,
      [options.fromSequence ?? 0, options.limit ?? 1000],
    );
    return result.rows.map(rowToEvent);
  }

  /**
   * Reads the most recent records, newest first.
   *
   * `list()` walks the chain forwards because that is the order verification
   * needs. A reviewer opening the trail wants the opposite: the newest events,
   * not the oldest ones. Taking the tail in SQL rather than reading the whole
   * table and slicing keeps that cheap as the log grows.
   */
  async listLatest(options: { limit?: number } = {}): Promise<AuditEvent[]> {
    const result = await this.db.query<Record<string, any>>(
      `SELECT * FROM audit.audit_log
        ORDER BY sequence DESC
        LIMIT $1`,
      [options.limit ?? 100],
    );
    return result.rows.map(rowToEvent);
  }

  /** Verifies the chain and records the outcome (spec §39). */
  async verify(options: { fromSequence?: number } = {}): Promise<AuditChainVerification> {
    const events = await this.list({ fromSequence: options.fromSequence, limit: 1_000_000 });
    const verification = verifyAuditChain(events);

    await this.db.query(
      `INSERT INTO audit.chain_verifications
         (from_sequence, to_sequence, checked_count, valid, broken_at_sequence, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        events[0]?.sequence ?? 0,
        events[events.length - 1]?.sequence ?? 0,
        verification.checkedCount,
        verification.valid,
        verification.brokenAtSequence ?? null,
        verification.reason ?? null,
      ],
    );

    return verification;
  }
}

function rowToEvent(row: Record<string, any>): AuditEvent {
  return {
    id: row.id,
    sequence: Number(row.sequence),
    actorUserId: row.actor_user_id,
    actorIdentityId: row.actor_identity_id,
    actorType: row.actor_type,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    osId: row.os_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    outcome: row.outcome,
    reason: row.reason,
    previousState: row.previous_state,
    newState: row.new_state,
    authorizationContext: row.authorization_context,
    requestId: row.request_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    applicationContext: row.application_context,
    // Normalised back to the exact millisecond-precision ISO string that was
    // hashed at write time.
    occurredAt: new Date(row.occurred_at).toISOString(),
    hash: row.entry_hash,
    previousHash: row.previous_hash,
  } as AuditEvent;
}
