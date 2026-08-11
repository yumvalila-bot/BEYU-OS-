/**
 * Organization persistence (spec §18).
 *
 * The organizational tree is the backbone every other domain hangs off, so
 * three invariants are maintained here rather than trusted to callers:
 *
 *  1. The canonical hierarchy (validateHierarchy) — a FOUNDATION can never be
 *     parented to a HOLDING_COMPANY, a SECTOR_LLC never to a TRUST.
 *  2. A single root. There is exactly one BEYU FAMILY TRUST.
 *  3. The materialized path and depth stay consistent with the parent links,
 *     including across a subtree move.
 *
 * Forbidden names are rejected in three independent places — the type package,
 * this repository and a CHECK constraint on the table — because the cost of a
 * wrong name reaching the database is far higher than the cost of the
 * redundancy.
 */

import {
  isWithinBeyuOsBoundary,
  OrgNodeType,
  validateHierarchy,
  type OrgNode,
  type OrgTreeNode,
} from '@beyu/types';

import { DomainRepository } from '../../common/domain.repository';
import {
  assertNameAllowed,
  invalidRequest,
  isUniqueViolation,
  notFound,
} from '../../common/errors';
import { resolveLimit, resolveOffset, type Page } from '../../common/pagination';
import type { DatabaseSession } from '../../db/driver';
import type { SecurityContext } from '@beyu/types';
import type { CreateOrgNodeDto, UpdateOrgNodeDto } from './organizations.dto';

interface OrgRow {
  id: string;
  node_type: string;
  name: string;
  legal_name: string | null;
  parent_id: string | null;
  country_code: string | null;
  sector_code: string | null;
  status: string;
  path: string;
  depth: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function toNode(row: OrgRow): OrgNode & { path: string; depth: number } {
  return {
    id: row.id,
    type: row.node_type as OrgNodeType,
    name: row.name,
    legalName: row.legal_name,
    parentId: row.parent_id,
    countryCode: row.country_code,
    sectorCode: row.sector_code,
    status: row.status as OrgNode['status'],
    metadata: row.metadata ?? {},
    path: row.path,
    depth: Number(row.depth),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const SELECT = `
  SELECT id, node_type, name, legal_name, parent_id, country_code, sector_code,
         status, path, depth, metadata, created_at, updated_at
  FROM organization.org_nodes`;

export interface ListOrgQuery {
  nodeType?: OrgNodeType;
  countryCode?: string;
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export class OrganizationsRepository extends DomainRepository {
  async list(security: SecurityContext, query: ListOrgQuery): Promise<Page<OrgNode>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);

    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown): void => {
      params.push(value);
      where.push(clause.replace('?', `$${params.length}`));
    };

    if (query.nodeType) add('node_type = ?', query.nodeType);
    if (query.countryCode) add('country_code = ?', query.countryCode);
    if (query.status) add('status = ?', query.status);
    if (query.q) add('name ILIKE ?', `%${query.q}%`);

    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    return this.read(security, async (session) => {
      const total = await session.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM organization.org_nodes${clause}`,
        params,
      );
      const rows = await session.query<OrgRow>(
        `${SELECT}${clause} ORDER BY path, name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return {
        items: rows.rows.map(toNode),
        total: Number(total.rows[0]?.count ?? 0),
        limit,
        offset,
      };
    });
  }

  async findById(security: SecurityContext, id: string): Promise<OrgNode> {
    const result = await this.read(security, (session) =>
      session.query<OrgRow>(`${SELECT} WHERE id = $1`, [id]),
    );
    const row = result.rows[0];
    if (!row) notFound('organization node', id);
    return toNode(row);
  }

  /**
   * Returns the node and everything beneath it, assembled into a tree.
   *
   * The subtree is selected by path prefix rather than by a recursive CTE:
   * the materialized path exists precisely so this is one indexed range scan.
   */
  async subtree(security: SecurityContext, id: string): Promise<OrgTreeNode> {
    return this.read(security, async (session) => {
      const root = await session.query<OrgRow>(`${SELECT} WHERE id = $1`, [id]);
      const rootRow = root.rows[0];
      if (!rootRow) notFound('organization node', id);

      const descendants = await session.query<OrgRow>(
        `${SELECT} WHERE path LIKE $1 ORDER BY path, name`,
        [`${rootRow.path}/%`],
      );

      const byId = new Map<string, OrgTreeNode>();
      const all = [rootRow, ...descendants.rows];
      for (const row of all) {
        byId.set(row.id, { ...toNode(row), children: [] });
      }
      for (const row of descendants.rows) {
        const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
        const self = byId.get(row.id);
        if (parent && self) parent.children.push(self);
      }
      // Non-null: inserted above from rootRow.
      return byId.get(rootRow.id) as OrgTreeNode;
    });
  }

  /** Returns the root-to-node chain, useful for breadcrumbs and scope checks. */
  async ancestors(security: SecurityContext, id: string): Promise<OrgNode[]> {
    return this.read(security, async (session) => {
      const self = await session.query<OrgRow>(`${SELECT} WHERE id = $1`, [id]);
      const row = self.rows[0];
      if (!row) notFound('organization node', id);

      const ids = row.path.split('/').filter(Boolean);
      if (ids.length === 0) return [];
      const rows = await session.query<OrgRow>(
        `${SELECT} WHERE id = ANY($1::uuid[]) ORDER BY depth`,
        [ids],
      );
      return rows.rows.map(toNode);
    });
  }

  async create(security: SecurityContext, dto: CreateOrgNodeDto): Promise<OrgNode> {
    assertNameAllowed(dto.name, dto.legalName);

    if (dto.nodeType === OrgNodeType.CountryHolding && !dto.countryCode) {
      invalidRequest('A COUNTRY_HOLDING node must declare a countryCode.');
    }
    if (dto.nodeType === OrgNodeType.SectorLLC && !dto.sectorCode) {
      invalidRequest('A SECTOR_LLC node must declare a sectorCode.');
    }
    // BEYU OS governs the trust, holding, country-holding and sector-LLC
    // layers. Nodes below that boundary belong to a Sector OS or Foundation OS
    // and are registered there, not created here (spec §2, §41).
    //
    // FOUNDATION is the one node outside BEYU_OS_GOVERNED_NODES that may still
    // be created: it is a SISTER of the holding company and has to exist in the
    // structural tree for the hierarchy to be complete. What BEYU OS must not
    // do is govern anything *inside* it — hence FOUNDATION_OS and everything
    // beneath it is refused along with the Sector OS layers.
    const structurallyAllowed =
      isWithinBeyuOsBoundary(dto.nodeType) || dto.nodeType === OrgNodeType.Foundation;
    if (!structurallyAllowed) {
      invalidRequest(
        `${dto.nodeType} is below the BEYU OS governance boundary, which ends at SECTOR_LLC. ` +
          'Nodes beneath a Sector LLC are owned by the Sector OS and are registered through ' +
          'the OS registry, not created here.',
      );
    }

    return this.mutate(
      security,
      async (session) => {
        const parent = dto.parentId ? await this.loadRow(session, dto.parentId) : null;
        if (dto.parentId && !parent) {
          invalidRequest(`Parent node ${dto.parentId} does not exist.`);
        }

        const verdict = validateHierarchy(
          dto.nodeType,
          parent ? (parent.node_type as OrgNodeType) : null,
        );
        if (!verdict.valid) invalidRequest(verdict.reason ?? 'Invalid hierarchy.');

        // Exactly one root. Without this check a second TRUST could be created
        // and the whole tree would have two competing sources of truth.
        if (!parent) {
          const existingRoot = await session.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM organization.org_nodes WHERE parent_id IS NULL`,
          );
          if (Number(existingRoot.rows[0]?.count ?? 0) > 0) {
            invalidRequest(
              'A root organization already exists. BEYU FAMILY TRUST is the single root of ' +
                'the hierarchy and cannot have a sibling.',
            );
          }
        }

        // A country holding inherits its country; a sector LLC inherits the
        // country of the holding it sits under.
        const countryCode =
          dto.countryCode ?? (parent?.country_code ? parent.country_code : null);

        let inserted;
        try {
          inserted = await session.query<OrgRow>(
            `INSERT INTO organization.org_nodes
               (node_type, name, legal_name, parent_id, country_code, sector_code, metadata, path, depth)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, '', $8)
             RETURNING id, node_type, name, legal_name, parent_id, country_code, sector_code,
                       status, path, depth, metadata, created_at, updated_at`,
            [
              dto.nodeType,
              dto.name.trim(),
              dto.legalName?.trim() ?? null,
              dto.parentId ?? null,
              countryCode,
              dto.sectorCode ?? null,
              JSON.stringify(dto.metadata ?? {}),
              parent ? Number(parent.depth) + 1 : 0,
            ],
          );
        } catch (error) {
          if (isUniqueViolation(error)) {
            invalidRequest('An organization node with these identifiers already exists.');
          }
          throw error;
        }

        const row = inserted.rows[0];
        if (!row) throw new Error('Insert returned no row.');

        // The path can only be written once the id exists.
        const path = parent ? `${parent.path}/${row.id}` : `/${row.id}`;
        const updated = await session.query<OrgRow>(
          `UPDATE organization.org_nodes SET path = $1 WHERE id = $2
           RETURNING id, node_type, name, legal_name, parent_id, country_code, sector_code,
                     status, path, depth, metadata, created_at, updated_at`,
          [path, row.id],
        );
        return toNode(updated.rows[0] ?? row);
      },
      (node) => ({
        action: 'CREATE',
        resourceType: 'organization',
        resourceId: node.id,
        newState: { ...node },
      }),
    );
  }

  async update(security: SecurityContext, id: string, dto: UpdateOrgNodeDto): Promise<OrgNode> {
    assertNameAllowed(dto.name, dto.legalName);

    return this.mutate(
      security,
      async (session) => {
        const before = await this.loadRow(session, id);
        if (!before) notFound('organization node', id);

        const sets: string[] = [];
        const params: unknown[] = [];
        const set = (column: string, value: unknown): void => {
          params.push(value);
          sets.push(`${column} = $${params.length}`);
        };

        if (dto.name !== undefined) set('name', dto.name.trim());
        if (dto.legalName !== undefined) set('legal_name', dto.legalName.trim());
        if (dto.status !== undefined) set('status', dto.status);
        if (dto.metadata !== undefined) set('metadata', JSON.stringify(dto.metadata));

        if (sets.length === 0) return { before, after: toNode(before) };

        sets.push('updated_at = now()');
        params.push(id);

        const result = await session.query<OrgRow>(
          `UPDATE organization.org_nodes SET ${sets.join(', ')} WHERE id = $${params.length}
           RETURNING id, node_type, name, legal_name, parent_id, country_code, sector_code,
                     status, path, depth, metadata, created_at, updated_at`,
          params,
        );
        const row = result.rows[0];
        if (!row) notFound('organization node', id);
        return { before, after: toNode(row) };
      },
      ({ before, after }) => ({
        action: 'UPDATE',
        resourceType: 'organization',
        resourceId: after.id,
        previousState: { ...toNode(before) },
        newState: { ...after },
      }),
    ).then(({ after }) => after);
  }

  /**
   * Reparents a node and rewrites the materialized path of its whole subtree.
   *
   * Rejected when the new parent is inside the moving subtree — that would
   * detach the branch from the root and create an orphaned cycle that no
   * traversal could reach.
   */
  async move(
    security: SecurityContext,
    id: string,
    newParentId: string,
    reason: string,
  ): Promise<OrgNode> {
    return this.mutate(
      security,
      async (session) => {
        const node = await this.loadRow(session, id);
        if (!node) notFound('organization node', id);
        const parent = await this.loadRow(session, newParentId);
        if (!parent) invalidRequest(`Parent node ${newParentId} does not exist.`);

        if (parent.id === node.id) {
          invalidRequest('A node cannot be its own parent.');
        }
        if (parent.path.startsWith(`${node.path}/`)) {
          invalidRequest(
            'The proposed parent is a descendant of the node being moved. This would ' +
              'detach the subtree from the root.',
          );
        }

        const verdict = validateHierarchy(
          node.node_type as OrgNodeType,
          parent.node_type as OrgNodeType,
        );
        if (!verdict.valid) invalidRequest(verdict.reason ?? 'Invalid hierarchy.');

        const oldPath = node.path;
        const newPath = `${parent.path}/${node.id}`;
        const depthDelta = Number(parent.depth) + 1 - Number(node.depth);

        const moved = await session.query<OrgRow>(
          `UPDATE organization.org_nodes
             SET parent_id = $1, path = $2, depth = depth + $3, updated_at = now()
           WHERE id = $4
           RETURNING id, node_type, name, legal_name, parent_id, country_code, sector_code,
                     status, path, depth, metadata, created_at, updated_at`,
          [parent.id, newPath, depthDelta, node.id],
        );

        // Rewrite the descendants' prefixes in one statement. overlay() is used
        // rather than replace() so only the leading path segment changes: a
        // node id appearing later in the path must not be rewritten.
        await session.query(
          `UPDATE organization.org_nodes
             SET path = $1 || substring(path from $2), depth = depth + $3, updated_at = now()
           WHERE path LIKE $4`,
          [newPath, oldPath.length + 1, depthDelta, `${oldPath}/%`],
        );

        const row = moved.rows[0];
        if (!row) notFound('organization node', id);
        return { node, after: toNode(row), oldPath, newPath };
      },
      ({ node, after, oldPath, newPath }) => ({
        action: 'UPDATE',
        resourceType: 'organization',
        resourceId: after.id,
        reason,
        previousState: { parentId: node.parent_id, path: oldPath },
        newState: { parentId: after.parentId, path: newPath },
      }),
    ).then(({ after }) => after);
  }

  private async loadRow(session: DatabaseSession, id: string): Promise<OrgRow | null> {
    const result = await session.query<OrgRow>(`${SELECT} WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }
}
