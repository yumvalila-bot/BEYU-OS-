/**
 * @beyu/types — shared, versioned domain contracts for the BEYU ecosystem.
 *
 * These types are the single source of truth shared between the API, the web
 * application and cross-OS integration clients (spec §63). DTOs are never
 * duplicated by hand across systems.
 */

export * from './organization';
export * from './authorization';
export * from './waterfall';
export * from './domain';
export * from './audit';
export * from './events';

/** Contract version for shared types. Bump on breaking changes. */
export const BEYU_CONTRACTS_VERSION = '1.0.0';

/** Standard paginated envelope used by every list endpoint (spec §44). */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Standard error envelope. Never contains stack traces or secrets (spec §44). */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  requestId?: string;
  /** Field-level validation details, when applicable. */
  details?: Array<{ field: string; message: string }>;
}
