/**
 * @beyu/agriculture-types — canonical agriculture domain contracts.
 * SINGLE SOURCE OF TRUTH for BEYU AGRICULTURE OS domain models.
 *
 * BEYU AGRICULTURE OS is a SECTOR OS in the BEYU federation: it attaches
 * beneath the AGRICULTURE sector LLC of a country holding and speaks to
 * BEYU OS (control plane) and FINANCE OS over the federation seam. It
 * never hosts the ledger and never holds control-plane identity.
 */

export * from './enums';
export * from './identity';
export * from './tenant';
export * from './farm';
export * from './crop';
export * from './livestock';
export * from './inventory';
export * from './procurement';
export * from './equipment';
export * from './compliance';
export * from './audit';
export * from './api';

export const AGRICULTURE_CONTRACTS_VERSION = '1.0.0';

/** Federation identity of this OS in the control-plane registry. */
export const AGRICULTURE_OS_ID = 'agriculture-os';
export const AGRICULTURE_OS_SECTOR_CODE = 'AGRICULTURE';
export const AGRICULTURE_OS_AUDIENCE = 'beyu-agriculture-os';

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  requestId?: string;
  details?: Array<{ field: string; message: string }>;
}
