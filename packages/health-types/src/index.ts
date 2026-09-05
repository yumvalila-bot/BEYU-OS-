/**
 * @beyu/health-types — canonical health domain contracts.
 * SINGLE SOURCE OF TRUTH for BEYU HEALTH OS domain models.
 */

export * from './enums';
export * from './identity';
export * from './tenant';
export * from './patient';
export * from './clinical';
export * from './appointment';
export * from './pharmacy';
export * from './laboratory';
export * from './radiology';
export * from './ophthalmology';
export * from './billing';
export * from './inventory';
export * from './workforce';
export * from './ambulance';
export * from './telemedicine';
export * from './audit';
export * from './ai';
export * from './api';

export const HEALTH_CONTRACTS_VERSION = '1.0.0';

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
