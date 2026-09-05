export interface HealthAuditEvent {
  id: string;
  tenantId: string;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  purposeOfUse?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  facilityId?: string | null;
  createdAt: string;
  hash: string;
  previousHash?: string | null;
}
