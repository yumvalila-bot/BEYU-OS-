/**
 * The shapes this app reads from the API.
 *
 * Deliberately hand-written and narrow rather than importing the API's
 * internal types wholesale: the web app should depend on the published wire
 * contract, not on the server's implementation. Where a value is defined once
 * in @beyu/types (org node types, OS lifecycle) it is imported from there so
 * the two cannot drift.
 */

export interface OrganizationNode {
  id: string;
  name: string;
  legalName: string | null;
  /** The API names this field `type`, not `nodeType`. Verified against a live response. */
  type: string;
  parentId: string | null;
  path: string;
  depth: number;
  countryCode: string | null;
  sectorCode: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface OsRegistrationView {
  id: string;
  osId: string;
  name: string;
  attachmentKind: string;
  sectorCode: string | null;
  attachedNodeId: string | null;
  status: string;
  capabilities: string[];
  apiEndpoint: string | null;
  version: string | null;
  isCore: boolean;
  integrationStatus: string;
  healthStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEventView {
  id: string;
  sequence: number;
  actorUserId: string | null;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  reason: string | null;
  occurredAt: string;
  hash: string;
  previousHash: string | null;
}

export interface MeResponse {
  userId: string;
  identityId: string;
  email: string;
  displayName: string;
  roles: string[];
  tenantIds: string[];
  activeTenantId: string | null;
  organizationIds: string[];
  osIds: string[];
}

/**
 * Collection responses. `/organizations` and `/os-registry` return
 * `{items,total,limit,offset}`; `/audit` returns `{items,count}`. Both
 * optional counters are declared so one type covers each without lying.
 */
export interface Paged<T> {
  items: T[];
  total?: number;
  count?: number;
  limit?: number;
  offset?: number;
}

/** `GET /audit/verify`. */
export interface ChainVerification {
  valid: boolean;
  checkedCount: number;
  brokenAtSequence?: number;
  reason?: string;
}
