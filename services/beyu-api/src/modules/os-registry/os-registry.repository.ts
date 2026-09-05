/**
 * OS federation persistence (spec §4, §69, §70, §71).
 *
 * Manages the seam between BEYU OS and the independent OSs that attach to it:
 * Health OS, Agriculture OS, Finance OS and FOUNDATION OS. Those systems own
 * their own databases and deployments. Nothing here reaches into them, and
 * nothing here lets them reach into this one.
 *
 * Every mutation goes through `mutate()`, so attaching an OS, granting a
 * capability or revoking a credential is written to the audit chain in the
 * same transaction as the change itself. Capability grants in particular are
 * exactly the kind of decision that gets questioned a year later, and the
 * answer needs to survive.
 */

import {
  assertCapabilitiesGrantable,
  canTransitionOsStatus,
  ForbiddenCapabilityError,
  OsAttachmentKind,
  OsStatus,
  requiredParentTypeForOs,
  type OsCapability,
  type OsRegistration,
} from '@beyu/types';

import { DomainRepository } from '../../common/domain.repository';
import {
  invalidRequest,
  invalidTransition,
  isCheckViolation,
  isForeignKeyViolation,
  isUniqueViolation,
  notFound,
} from '../../common/errors';
import { resolveLimit, resolveOffset, type Page } from '../../common/pagination';
import type { DatabaseSession } from '../../db/driver';
import type { SecurityContext } from '@beyu/types';
import type {
  AttachOsDto,
  GrantCapabilitiesDto,
  GrantEventTopicDto,
  RegisterOsDto,
  UpdateOsStatusDto,
} from './os-registry.dto';

interface OsRow {
  id: string;
  os_id: string;
  name: string;
  attachment_kind: string;
  sector_code: string | null;
  attached_node_id: string | null;
  version: string;
  status: string;
  country_availability: string[] | null;
  owner_entity_id: string | null;
  api_endpoint: string | null;
  capabilities: string[] | null;
  event_subscriptions: string[] | null;
  compliance_profile_id: string | null;
  data_sharing_policy_id: string | null;
  integration_status: string;
  health_status: string;
  last_health_check_at: string | null;
  is_core: boolean;
  created_at: string;
  updated_at: string;
}

function toRegistration(row: OsRow): OsRegistration {
  return {
    id: row.id,
    osId: row.os_id,
    name: row.name,
    attachmentKind: row.attachment_kind as OsAttachmentKind,
    sectorCode: row.sector_code,
    attachedNodeId: row.attached_node_id,
    version: row.version,
    status: row.status as OsStatus,
    countryAvailability: row.country_availability ?? [],
    ownerEntityId: row.owner_entity_id,
    apiEndpoint: row.api_endpoint,
    capabilities: (row.capabilities ?? []) as OsCapability[],
    eventSubscriptions: row.event_subscriptions ?? [],
    complianceProfileId: row.compliance_profile_id,
    dataSharingPolicyId: row.data_sharing_policy_id,
    integrationStatus: row.integration_status as OsRegistration['integrationStatus'],
    healthStatus: row.health_status as OsRegistration['healthStatus'],
    lastHealthCheckAt: row.last_health_check_at
      ? new Date(row.last_health_check_at).toISOString()
      : null,
    isCore: row.is_core,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const SELECT = `
  SELECT id, os_id, name, attachment_kind, sector_code, attached_node_id,
         version, status, country_availability, owner_entity_id, api_endpoint,
         capabilities, event_subscriptions, compliance_profile_id,
         data_sharing_policy_id, integration_status, health_status,
         last_health_check_at, is_core, created_at, updated_at
  FROM organization.os_registry`;

export interface ListOsQuery {
  status?: string;
  attachmentKind?: string;
  sectorCode?: string;
  limit?: number;
  offset?: number;
}

export class OsRegistryRepository extends DomainRepository {
  async list(security: SecurityContext, query: ListOsQuery): Promise<Page<OsRegistration>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);

    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown): void => {
      params.push(value);
      where.push(clause.replace('?', `$${params.length}`));
    };

    if (query.status) add('status = ?', query.status);
    if (query.attachmentKind) add('attachment_kind = ?', query.attachmentKind);
    if (query.sectorCode) add('sector_code = ?', query.sectorCode);

    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    return this.read(security, async (session) => {
      const total = await session.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM organization.os_registry${clause}`,
        params,
      );
      const rows = await session.query<OsRow>(
        `${SELECT}${clause} ORDER BY is_core DESC, os_id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return {
        items: rows.rows.map(toRegistration),
        total: Number(total.rows[0]?.count ?? 0),
        limit,
        offset,
      };
    });
  }

  async findByOsId(security: SecurityContext, osId: string): Promise<OsRegistration> {
    return this.read(security, async (session) => {
      const found = await this.requireOs(session, osId);
      return toRegistration(found);
    });
  }

  private async requireOs(session: DatabaseSession, osId: string): Promise<OsRow> {
    const result = await session.query<OsRow>(`${SELECT} WHERE os_id = $1`, [osId]);
    const row = result.rows[0];
    if (!row) throw notFound('os', osId);
    return row;
  }

  /**
   * Registers a new OS.
   *
   * It starts at REGISTERED with NO capabilities and NO attachment. That is
   * the whole point: a newly registered OS can do nothing at all until an
   * operator makes a series of deliberate, individually audited grants. There
   * is no parameter on this method that could shortcut that.
   */
  async register(security: SecurityContext, dto: RegisterOsDto): Promise<OsRegistration> {
    const kind = dto.attachmentKind;

    if (kind === OsAttachmentKind.Core) {
      // Refused before touching the database. There is one control plane, it
      // already exists, and it is this one.
      throw invalidRequest(
        'A CORE OS cannot be registered through the API. BEYU OS is the control plane and there is exactly one.',
      );
    }
    if (kind === OsAttachmentKind.SectorOs && !dto.sectorCode) {
      throw invalidRequest('A SECTOR_OS must declare the sectorCode it serves.');
    }
    if (kind === OsAttachmentKind.FoundationOs && dto.sectorCode) {
      throw invalidRequest(
        'FOUNDATION OS must not declare a sectorCode. BEYU FOUNDATION is a sister organization to BEYU HOLDING COMPANY, not one of its sectors.',
      );
    }

    return this.mutate(
      security,
      async (session) => {
        try {
          const inserted = await session.query<OsRow>(
            `INSERT INTO organization.os_registry
               (os_id, name, attachment_kind, sector_code, version, api_endpoint,
                country_availability, capabilities, event_subscriptions, status, is_core)
             VALUES ($1, $2, $3, $4, $5, $6, $7, '{}', '{}', 'REGISTERED', FALSE)
             RETURNING id, os_id, name, attachment_kind, sector_code, attached_node_id,
                       version, status, country_availability, owner_entity_id, api_endpoint,
                       capabilities, event_subscriptions, compliance_profile_id,
                       data_sharing_policy_id, integration_status, health_status,
                       last_health_check_at, is_core, created_at, updated_at`,
            [
              dto.osId,
              dto.name,
              kind,
              dto.sectorCode ?? null,
              dto.version ?? '1.0.0',
              dto.apiEndpoint ?? null,
              dto.countryAvailability ?? [],
            ],
          );
          return inserted.rows[0]!;
        } catch (error) {
          if (isForeignKeyViolation(error)) {
            throw invalidRequest(
              `Sector "${dto.sectorCode}" is not a registered sector. Register the sector before attaching an OS to it, so the OS cannot claim a part of the business that does not exist.`,
            );
          }
          if (isUniqueViolation(error)) {
            throw invalidRequest(
              `An OS with id "${dto.osId}" is already registered. Identifiers are permanent because retired ones still appear in audit history.`,
            );
          }
          if (isCheckViolation(error)) {
            throw invalidRequest(`Registration rejected by a database constraint: ${String(error)}`);
          }
          throw error;
        }
      },
      (row) => ({
        action: 'CREATE',
        resourceType: 'os',
        resourceId: row.os_id,
        newState: { osId: row.os_id, attachmentKind: row.attachment_kind, status: row.status },
        reason: dto.reason,
      }),
    ).then(toRegistration);
  }

  /**
   * Attaches a registered OS to its point in the hierarchy.
   *
   * The legality of the attachment is checked here for a clear error message
   * and again by a database trigger, which is what actually guarantees it.
   * The redundancy is intentional and matches how forbidden names are
   * handled: the message is a convenience, the constraint is the rule.
   */
  async attach(
    security: SecurityContext,
    osId: string,
    dto: AttachOsDto,
  ): Promise<OsRegistration> {
    return this.mutate(
      security,
      async (session) => {
        const before = await this.requireOs(session, osId);

        if (before.is_core) {
          throw invalidRequest(
            'The core OS attaches to no organizational node. BEYU OS is the control plane, not a participant in the hierarchy.',
          );
        }

        const node = await session.query<{ node_type: string; name: string }>(
          `SELECT node_type, name FROM organization.org_nodes WHERE id = $1`,
          [dto.nodeId],
        );
        const target = node.rows[0];
        if (!target) throw notFound('organization', dto.nodeId);

        const expected = requiredParentTypeForOs(before.attachment_kind as OsAttachmentKind);
        if (target.node_type !== expected) {
          if (before.attachment_kind === OsAttachmentKind.FoundationOs) {
            throw invalidRequest(
              `FOUNDATION OS must attach to the FOUNDATION node, not to a ${target.node_type} node. BEYU FOUNDATION is a sister organization to BEYU HOLDING COMPANY, and attaching its OS elsewhere would misrepresent that relationship.`,
            );
          }
          throw invalidRequest(
            `A ${before.attachment_kind} must attach to a ${expected} node, not to a ${target.node_type} node. BEYU OS ends at the Sector LLC boundary.`,
          );
        }

        try {
          const updated = await session.query<OsRow>(
            `UPDATE organization.os_registry
                SET attached_node_id = $2, updated_at = now()
              WHERE os_id = $1
             RETURNING id, os_id, name, attachment_kind, sector_code, attached_node_id,
                       version, status, country_availability, owner_entity_id, api_endpoint,
                       capabilities, event_subscriptions, compliance_profile_id,
                       data_sharing_policy_id, integration_status, health_status,
                       last_health_check_at, is_core, created_at, updated_at`,
            [osId, dto.nodeId],
          );
          return { before, after: updated.rows[0]! };
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw invalidRequest(
              `Another OS is already attached to node ${dto.nodeId}. One attachment point serves exactly one OS.`,
            );
          }
          throw error;
        }
      },
      ({ before, after }) => ({
        action: 'UPDATE',
        resourceType: 'os',
        resourceId: osId,
        previousState: { attachedNodeId: before.attached_node_id },
        newState: { attachedNodeId: after.attached_node_id },
        reason: dto.reason,
      }),
    ).then(({ after }) => toRegistration(after));
  }

  /**
   * Replaces an OS's capability grants.
   *
   * Validated in the type package, then again by a database trigger. A
   * forbidden capability produces a 400 naming the capability, because an
   * operator who tried to grant DATABASE_READ needs to understand why the
   * answer is permanently no rather than assume a transient failure.
   */
  async grantCapabilities(
    security: SecurityContext,
    osId: string,
    dto: GrantCapabilitiesDto,
  ): Promise<OsRegistration> {
    try {
      assertCapabilitiesGrantable(dto.capabilities);
    } catch (error) {
      if (error instanceof ForbiddenCapabilityError) {
        throw invalidRequest(error.message);
      }
      throw error;
    }

    return this.mutate(
      security,
      async (session) => {
        const before = await this.requireOs(session, osId);
        if (before.is_core) {
          throw invalidRequest(
            'The core OS is not granted capabilities; it is the system that grants them.',
          );
        }

        const updated = await session.query<OsRow>(
          `UPDATE organization.os_registry
              SET capabilities = $2, updated_at = now()
            WHERE os_id = $1
           RETURNING id, os_id, name, attachment_kind, sector_code, attached_node_id,
                     version, status, country_availability, owner_entity_id, api_endpoint,
                     capabilities, event_subscriptions, compliance_profile_id,
                     data_sharing_policy_id, integration_status, health_status,
                     last_health_check_at, is_core, created_at, updated_at`,
          [osId, dto.capabilities],
        );
        return { before, after: updated.rows[0]! };
      },
      ({ before, after }) => ({
        action: 'UPDATE',
        resourceType: 'os',
        resourceId: osId,
        previousState: { capabilities: before.capabilities ?? [] },
        newState: { capabilities: after.capabilities ?? [] },
        reason: dto.reason,
      }),
    ).then(({ after }) => toRegistration(after));
  }

  /**
   * Moves an OS through its lifecycle.
   *
   * The transition table forbids REGISTERED -> ACTIVE, so an OS cannot go
   * live without passing through SECURITY_VALIDATION. Activation additionally
   * requires an attachment point and an endpoint: an ACTIVE OS that is
   * attached nowhere would be granted access on the strength of a status
   * nobody can trace to a place in the hierarchy.
   */
  async updateStatus(
    security: SecurityContext,
    osId: string,
    dto: UpdateOsStatusDto,
  ): Promise<OsRegistration> {
    return this.mutate(
      security,
      async (session) => {
        const before = await this.requireOs(session, osId);
        const from = before.status as OsStatus;
        const to = dto.status;

        if (from === to) {
          throw invalidRequest(`OS "${osId}" is already ${to}.`);
        }
        if (!canTransitionOsStatus(from, to)) {
          if (from === OsStatus.Retired) {
            throw invalidTransition(
              'os',
              from,
              to,
              'RETIRED is terminal. A retired identifier still appears throughout historical audit records, and reusing it would make that history ambiguous. Register a new OS instead.',
            );
          }
          if (to === OsStatus.Active) {
            throw invalidTransition(
              'os',
              from,
              to,
              'An OS can only become ACTIVE from SECURITY_VALIDATION. Skipping the security review is not a supported path.',
            );
          }
          throw invalidTransition('os', from, to);
        }

        if (to === OsStatus.Active) {
          if (!before.attached_node_id) {
            throw invalidRequest(
              `OS "${osId}" cannot be activated before it is attached to an organizational node.`,
            );
          }
          if (!before.api_endpoint) {
            throw invalidRequest(
              `OS "${osId}" cannot be activated without an apiEndpoint. Cross-OS communication is over versioned APIs.`,
            );
          }
        }

        const updated = await session.query<OsRow>(
          `UPDATE organization.os_registry
              SET status = $2, updated_at = now()
            WHERE os_id = $1
           RETURNING id, os_id, name, attachment_kind, sector_code, attached_node_id,
                     version, status, country_availability, owner_entity_id, api_endpoint,
                     capabilities, event_subscriptions, compliance_profile_id,
                     data_sharing_policy_id, integration_status, health_status,
                     last_health_check_at, is_core, created_at, updated_at`,
          [osId, to],
        );
        return { before, after: updated.rows[0]! };
      },
      ({ before, after }) => ({
        action: 'UPDATE',
        resourceType: 'os',
        resourceId: osId,
        previousState: { status: before.status },
        newState: { status: after.status },
        reason: dto.reason,
      }),
    ).then(({ after }) => toRegistration(after));
  }

  /** Grants an OS the right to receive one `beyu.*` topic. */
  async grantEventTopic(
    security: SecurityContext,
    osId: string,
    dto: GrantEventTopicDto,
  ): Promise<{ osId: string; topic: string }> {
    if (!dto.topic.startsWith('beyu.')) {
      throw invalidRequest(
        `Only control plane topics ("beyu.*") can be subscribed to. "${dto.topic}" flows the other way, and subscribing to it would let one OS observe another OS's submissions.`,
      );
    }

    return this.mutate(
      security,
      async (session) => {
        await this.requireOs(session, osId);
        try {
          await session.query(
            `INSERT INTO integrations.os_event_grants (os_id, topic, granted_by, reason)
             VALUES ($1, $2, $3, $4)`,
            [osId, dto.topic, security.userId, dto.reason],
          );
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw invalidRequest(`OS "${osId}" is already subscribed to "${dto.topic}".`);
          }
          if (isCheckViolation(error)) {
            throw invalidRequest(`Topic "${dto.topic}" is not a subscribable control plane topic.`);
          }
          throw error;
        }
        return { osId, topic: dto.topic };
      },
      (result) => ({
        action: 'CREATE',
        resourceType: 'os',
        resourceId: osId,
        newState: { topic: result.topic },
        reason: dto.reason,
      }),
    );
  }

  /** Topics an OS is entitled to receive. */
  async listEventGrants(security: SecurityContext, osId: string): Promise<string[]> {
    return this.read(security, async (session) => {
      await this.requireOs(session, osId);
      const rows = await session.query<{ topic: string }>(
        `SELECT topic FROM integrations.os_event_grants WHERE os_id = $1 ORDER BY topic`,
        [osId],
      );
      return rows.rows.map((r) => r.topic);
    });
  }

  /**
   * Resolves which OSs should receive a topic.
   *
   * The event fan-out calls this. Because delivery is driven by explicit
   * grants and restricted to ACTIVE OSs, a suspended OS stops receiving
   * events the moment it is suspended, and an OS that was never granted a
   * topic simply never appears in the list. That is the mechanism that keeps
   * Health OS from seeing Agriculture OS's events — not a filter that has to
   * remember to exclude it.
   */
  async recipientsForTopic(security: SecurityContext, topic: string): Promise<string[]> {
    return this.read(security, async (session) => {
      const rows = await session.query<{ os_id: string }>(
        `SELECT g.os_id
           FROM integrations.os_event_grants g
           JOIN organization.os_registry r ON r.os_id = g.os_id
          WHERE g.topic = $1
            AND r.status = $2
          ORDER BY g.os_id`,
        [topic, OsStatus.Active],
      );
      return rows.rows.map((r) => r.os_id);
    });
  }
}
