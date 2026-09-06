/** Shared API contracts. */

import type { AgriRole } from './enums';

/** Permission check used by the API authorization guard. */
export interface AgriPermission {
  resource: string;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'APPROVE';
}

export interface AgriRoleDefinition {
  code: AgriRole | string;
  name: string;
  description: string;
}

export interface AgriTenantStats {
  tenantId: string;
  farms: number;
  fields: number;
  activeCropCycles: number;
  livestock: number;
  openWorkOrders: number;
  storageKg: number;
  harvestYtdKg: number;
  generatedAt: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded';
  service: 'beyu-agriculture-os';
  version: string;
  database: { driver: string; ok: boolean; target: string };
  timestamp: string;
}
