/**
 * BEYU OS — Canonical organizational model.
 *
 * NON-NEGOTIABLE (spec §1, §86):
 *   - The canonical parent organization is "BEYU FAMILY TRUST".
 *   - "BEYU GROUP" is never a valid name anywhere in the system.
 *   - BEYU FOUNDATION is a SISTER organization of BEYU HOLDING COMPANY,
 *     NOT a subsidiary of it.
 *   - BEYU OS ends at the SECTOR LLC boundary.
 */

/** The single canonical name of the parent organization. */
export const CANONICAL_PARENT_ORGANIZATION = 'BEYU FAMILY TRUST' as const;

/** Names that must never appear as an organization name. */
export const FORBIDDEN_ORGANIZATION_NAMES: readonly string[] = ['BEYU GROUP'] as const;

/**
 * Node kinds in the canonical BEYU organizational hierarchy.
 * Ordering here reflects the canonical tree, not authorization.
 */
export enum OrgNodeType {
  Trust = 'TRUST',
  HoldingCompany = 'HOLDING_COMPANY',
  CountryHolding = 'COUNTRY_HOLDING',
  SectorLLC = 'SECTOR_LLC',
  SectorOS = 'SECTOR_OS',
  Foundation = 'FOUNDATION',
  FoundationOS = 'FOUNDATION_OS',
  Tenant = 'TENANT',
  Organization = 'ORGANIZATION',
  Division = 'DIVISION',
  Department = 'DEPARTMENT',
  Branch = 'BRANCH',
  Team = 'TEAM',
}

/**
 * The boundary of the BEYU OS control plane (spec §2).
 * BEYU OS governs these node types and STOPS at SECTOR_LLC.
 * Everything below a Sector LLC belongs to the Sector OS.
 */
export const BEYU_OS_GOVERNED_NODES: readonly OrgNodeType[] = [
  OrgNodeType.Trust,
  OrgNodeType.HoldingCompany,
  OrgNodeType.CountryHolding,
  OrgNodeType.SectorLLC,
] as const;

/**
 * Node types that live BELOW the BEYU OS boundary and are owned by a Sector OS
 * or Foundation OS. BEYU OS may hold registry/reference records for these, but
 * must never absorb their operational data (spec §2, §41, §86.31).
 */
export const BELOW_BOUNDARY_NODES: readonly OrgNodeType[] = [
  OrgNodeType.SectorOS,
  OrgNodeType.FoundationOS,
  OrgNodeType.Tenant,
  OrgNodeType.Organization,
  OrgNodeType.Division,
  OrgNodeType.Department,
  OrgNodeType.Branch,
  OrgNodeType.Team,
] as const;

/** Returns true when the node type is inside the BEYU OS governance boundary. */
export function isWithinBeyuOsBoundary(type: OrgNodeType): boolean {
  return BEYU_OS_GOVERNED_NODES.includes(type);
}

/**
 * Canonical parent/child rules. A value of `null` means "root".
 * BEYU FOUNDATION's parent is the TRUST — never the HOLDING COMPANY.
 */
export const CANONICAL_PARENT_RULES: Record<OrgNodeType, readonly (OrgNodeType | null)[]> = {
  [OrgNodeType.Trust]: [null],
  [OrgNodeType.HoldingCompany]: [OrgNodeType.Trust],
  // Sister organization to BEYU HOLDING COMPANY, directly under the Trust.
  [OrgNodeType.Foundation]: [OrgNodeType.Trust],
  [OrgNodeType.CountryHolding]: [OrgNodeType.HoldingCompany],
  [OrgNodeType.SectorLLC]: [OrgNodeType.CountryHolding],
  [OrgNodeType.SectorOS]: [OrgNodeType.SectorLLC],
  [OrgNodeType.FoundationOS]: [OrgNodeType.Foundation],
  [OrgNodeType.Tenant]: [OrgNodeType.SectorOS, OrgNodeType.FoundationOS],
  [OrgNodeType.Organization]: [OrgNodeType.Tenant],
  [OrgNodeType.Division]: [OrgNodeType.Organization, OrgNodeType.Branch],
  [OrgNodeType.Branch]: [OrgNodeType.Organization],
  [OrgNodeType.Department]: [
    OrgNodeType.Organization,
    OrgNodeType.Division,
    OrgNodeType.Branch,
  ],
  [OrgNodeType.Team]: [OrgNodeType.Department, OrgNodeType.Division],
};

/** Validation result for a proposed parent/child organizational relationship. */
export interface HierarchyValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates a parent/child relationship against the canonical hierarchy.
 * Used by the organization domain service before any write (spec §18).
 */
export function validateHierarchy(
  child: OrgNodeType,
  parent: OrgNodeType | null,
): HierarchyValidationResult {
  const allowed = CANONICAL_PARENT_RULES[child];
  if (!allowed) {
    return { valid: false, reason: `Unknown organizational node type: ${child}` };
  }
  // Explicit guard for the most commonly mis-modelled relationship. This is
  // checked before the generic parent rule so the caller receives the specific
  // explanation rather than a generic "wrong parent type" message.
  if (child === OrgNodeType.Foundation && parent === OrgNodeType.HoldingCompany) {
    return {
      valid: false,
      reason:
        'BEYU FOUNDATION is a sister organization of BEYU HOLDING COMPANY and must ' +
        'attach directly to BEYU FAMILY TRUST.',
    };
  }
  if (!allowed.includes(parent)) {
    const expected = allowed.map((p) => p ?? 'ROOT').join(' | ');
    return {
      valid: false,
      reason: `${child} must have a parent of type ${expected}, received ${parent ?? 'ROOT'}`,
    };
  }
  return { valid: true };
}

/** Rejects forbidden organization names (spec §86.2). */
export function assertOrganizationNameAllowed(name: string): void {
  const normalized = name.trim().toUpperCase();
  if (FORBIDDEN_ORGANIZATION_NAMES.includes(normalized)) {
    throw new Error(
      `Organization name "${name}" is forbidden. The canonical parent organization is ` +
        `"${CANONICAL_PARENT_ORGANIZATION}".`,
    );
  }
}

export interface OrgNode {
  id: string;
  type: OrgNodeType;
  name: string;
  legalName?: string | null;
  parentId: string | null;
  countryCode?: string | null;
  sectorCode?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'DISSOLVED' | 'PENDING';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface OrgTreeNode extends OrgNode {
  children: OrgTreeNode[];
}
