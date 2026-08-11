/**
 * BEYU OS — development seed.
 *
 * WHAT THIS IS
 * ------------
 * Structural reference data (roles, permissions, the canonical hierarchy
 * skeleton, the OS registry) plus a small set of clearly-labelled ILLUSTRATIVE
 * examples so the UI has something to render locally.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is NOT authoritative business data. In particular:
 *   • The ownership percentages and waterfall percentages below are EXAMPLES.
 *     They are stored as ordinary configuration rows, exactly like any value an
 *     operator would enter in the UI. Nothing in the engine, the API or the
 *     schema depends on them (spec §63, §80).
 *   • No country's regulations are encoded here. Countries are rows; their
 *     regulatory profile is an empty JSONB object to be filled by the operator
 *     responsible for that jurisdiction (spec §64, §65).
 *
 * Seeding is idempotent: re-running it will not duplicate rows.
 */

import type { Database } from './driver';

/**
 * Jurisdiction for the seeded entities.
 *
 * The real jurisdictions of BEYU entities are business facts the trust must
 * supply — they are not the developer's to assume, and hard-coding any
 * particular country here is explicitly forbidden (spec §64). The default is
 * 'ZZ', the ISO 3166-1 user-assigned code meaning "unknown/unspecified".
 * Set SEED_JURISDICTION to seed a specific jurisdiction locally.
 */
const SEED_JURISDICTION = process.env.SEED_JURISDICTION ?? 'ZZ';

/** Roles mirror ROLE_PERMISSIONS in @beyu/auth. The policy engine is the
 *  source of truth; these rows exist so the UI can list and assign them. */
const ROLES: Array<{ code: string; name: string; description: string }> = [
  { code: 'TrustAdministrator', name: 'Trust Administrator', description: 'Full trust-level administration. Highest privilege in BEYU OS.' },
  { code: 'Trustee', name: 'Trustee', description: 'Fiduciary oversight of the BEYU FAMILY TRUST.' },
  { code: 'GroupExecutive', name: 'Group Executive', description: 'Executive across the holding structure.' },
  { code: 'HoldingCompanyDirector', name: 'Holding Company Director', description: 'Director of BEYU HOLDING COMPANY.' },
  { code: 'CountryDirector', name: 'Country Director', description: 'Accountable for a country holding company.' },
  { code: 'SectorLead', name: 'Sector Lead', description: 'Accountable for a sector LLC relationship.' },
  { code: 'FinanceOfficer', name: 'Finance Officer', description: 'Capital and waterfall preparation. Cannot self-approve.' },
  { code: 'RiskOfficer', name: 'Risk Officer', description: 'Enterprise risk management.' },
  { code: 'ComplianceOfficer', name: 'Compliance Officer', description: 'Regulatory compliance oversight.' },
  { code: 'GovernanceSecretary', name: 'Governance Secretary', description: 'Board and committee administration.' },
  { code: 'StrategyAnalyst', name: 'Strategy Analyst', description: 'Strategic planning and performance analysis.' },
  { code: 'Auditor', name: 'Auditor', description: 'Read-only assurance across the trust. Cannot mutate.' },
  { code: 'TenantAdministrator', name: 'Tenant Administrator', description: 'Administers a single tenant.' },
  { code: 'TenantUser', name: 'Tenant User', description: 'Standard tenant-scoped user.' },
  { code: 'ServiceAccount', name: 'Service Account', description: 'Machine principal for integrations.' },
];

/** Sectors are configuration. BEYU OS stops at the Sector LLC boundary; these
 *  rows describe WHICH sector an LLC belongs to, never how it operates. */
const SECTORS: Array<{ code: string; name: string; description: string }> = [
  { code: 'HEALTH', name: 'Health', description: 'Health sector LLCs. Operations belong to Health OS.' },
  { code: 'FINANCE', name: 'Finance', description: 'Finance sector LLCs. Operations belong to Finance OS.' },
  { code: 'AGRICULTURE', name: 'Agriculture', description: 'Agriculture sector LLCs. Operations belong to Agriculture OS.' },
  { code: 'PHILANTHROPY', name: 'Philanthropy', description: 'Foundation programmes. Operations belong to Foundation OS.' },
];

/** The OS registry. BEYU OS integrates with these; it never absorbs them. */
const OS_REGISTRY: Array<{
  os_id: string;
  name: string;
  sector_code: string | null;
  is_core: boolean;
  capabilities: string[];
}> = [
  { os_id: 'beyu-os', name: 'BEYU OS', sector_code: null, is_core: true, capabilities: ['ORGANIZATION', 'GOVERNANCE', 'STRATEGY', 'RISK', 'COMPLIANCE', 'CAPITAL', 'WATERFALL'] },
  { os_id: 'health-os', name: 'Health OS', sector_code: 'HEALTH', is_core: false, capabilities: ['CLINICAL_OPERATIONS'] },
  { os_id: 'finance-os', name: 'Finance OS', sector_code: 'FINANCE', is_core: false, capabilities: ['TRANSACTION_EXECUTION', 'TREASURY', 'ACCOUNTING'] },
  { os_id: 'agriculture-os', name: 'Agriculture OS', sector_code: 'AGRICULTURE', is_core: false, capabilities: ['FARM_OPERATIONS'] },
  { os_id: 'foundation-os', name: 'FOUNDATION OS', sector_code: 'PHILANTHROPY', is_core: false, capabilities: ['GRANTS', 'PROGRAMMES', 'DONOR_MANAGEMENT'] },
];

export interface SeedResult {
  created: string[];
  alreadyPresent: boolean;
}

export async function seed(
  db: Database,
  options: { log?: (msg: string) => void } = {},
): Promise<SeedResult> {
  const log = options.log ?? ((m: string) => console.log(m));
  const created: string[] = [];

  const existing = await db.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM organization.org_nodes WHERE node_type = 'TRUST'",
  );
  if (Number(existing.rows[0]?.count ?? '0') > 0) {
    log('  seed data already present — nothing to do');
    return { created: [], alreadyPresent: true };
  }

  // -- Roles -------------------------------------------------------------
  for (const role of ROLES) {
    await db.query(
      `INSERT INTO identity.roles (code, name, description)
       VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
      [role.code, role.name, role.description],
    );
  }
  created.push(`${ROLES.length} roles`);

  // -- Sectors -----------------------------------------------------------
  for (const sector of SECTORS) {
    await db.query(
      `INSERT INTO organization.sectors (code, name, description)
       VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
      [sector.code, sector.name, sector.description],
    );
  }
  created.push(`${SECTORS.length} sectors`);

  // -- OS registry -------------------------------------------------------
  for (const os of OS_REGISTRY) {
    await db.query(
      `INSERT INTO organization.os_registry
         (os_id, name, sector_code, is_core, capabilities, status)
       VALUES ($1, $2, $3, $4, $5, 'REGISTERED')
       ON CONFLICT (os_id) DO NOTHING`,
      [os.os_id, os.name, os.sector_code, os.is_core, os.capabilities],
    );
  }
  created.push(`${OS_REGISTRY.length} registered operating systems`);

  // -- Canonical hierarchy skeleton (spec §1) ----------------------------
  // BEYU FAMILY TRUST is the root and is never renamed.
  const trust = await insertNode(db, {
    nodeType: 'TRUST',
    name: 'BEYU FAMILY TRUST',
    legalName: 'BEYU FAMILY TRUST',
    parentId: null,
    path: '',
    depth: 0,
  });

  const holding = await insertNode(db, {
    nodeType: 'HOLDING_COMPANY',
    name: 'BEYU HOLDING COMPANY',
    legalName: 'BEYU HOLDING COMPANY',
    parentId: trust,
    path: trust,
    depth: 1,
  });

  // FOUNDATION is a SISTER of the holding company, directly under the Trust.
  // It is deliberately NOT a child of BEYU HOLDING COMPANY (spec §2, §12).
  const foundation = await insertNode(db, {
    nodeType: 'FOUNDATION',
    name: 'BEYU FOUNDATION',
    legalName: 'BEYU FOUNDATION',
    parentId: trust,
    path: trust,
    depth: 1,
  });

  await insertNode(db, {
    nodeType: 'FOUNDATION_OS',
    name: 'FOUNDATION OS',
    legalName: null,
    parentId: foundation,
    path: `${trust}/${foundation}`,
    depth: 2,
  });

  created.push('canonical hierarchy: Trust, Holding Company, Foundation (sister)');

  // -- Legal entities ----------------------------------------------------
  const trustEntity = await insertEntity(db, {
    name: 'BEYU FAMILY TRUST',
    entityType: 'TRUST',
    orgNodeId: trust,
  });
  const holdingEntity = await insertEntity(db, {
    name: 'BEYU HOLDING COMPANY',
    entityType: 'CORPORATION',
    orgNodeId: holding,
  });
  await insertEntity(db, {
    name: 'BEYU FOUNDATION',
    entityType: 'FOUNDATION',
    orgNodeId: foundation,
  });

  // ILLUSTRATIVE ownership record. 10000 bps = 100%: the Trust wholly owns the
  // holding company in this example. An operator can change it at any time;
  // nothing in the codebase assumes this figure.
  await db.query(
    `INSERT INTO ownership.ownership_interests
       (owner_entity_id, owned_entity_id, percentage_bps, effective_from)
     VALUES ($1, $2, $3, CURRENT_DATE)`,
    [trustEntity, holdingEntity, 10000],
  );
  created.push('3 legal entities with one illustrative ownership interest');

  log('  seeded structural reference data and illustrative examples');
  return { created, alreadyPresent: false };
}

async function insertNode(
  db: Database,
  node: {
    nodeType: string;
    name: string;
    legalName: string | null;
    parentId: string | null;
    path: string;
    depth: number;
  },
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO organization.org_nodes
       (node_type, name, legal_name, parent_id, path, depth)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [node.nodeType, node.name, node.legalName, node.parentId, node.path, node.depth],
  );
  return result.rows[0].id;
}

async function insertEntity(
  db: Database,
  entity: { name: string; entityType: string; orgNodeId: string },
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO ownership.legal_entities
       (name, entity_type, org_node_id, jurisdiction_country)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [entity.name, entity.entityType, entity.orgNodeId, SEED_JURISDICTION],
  );
  return result.rows[0].id;
}
