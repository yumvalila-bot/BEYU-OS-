/** Audit contracts — hash-chained, append-only trail. */

export interface AgriAuditEvent {
  id: string;
  tenantId: string | null;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  hash: string;
  previousHash: string | null;
  chainIndex: number;
}

export interface AgriAuditQuery {
  tenantId?: string | null;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}
