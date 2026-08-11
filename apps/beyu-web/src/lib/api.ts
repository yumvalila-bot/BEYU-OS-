/**
 * Server-side API access.
 *
 * The frontend never touches PostgreSQL and never holds a token in the
 * browser. Every call goes out from the Next server with the bearer token
 * read from the httpOnly cookie, and every authorization decision is made by
 * the API — this module carries requests, it does not decide anything.
 */

import 'server-only';

import { readAccessToken } from './session';

export const API_ORIGIN = process.env.BEYU_API_ORIGIN ?? 'http://127.0.0.1:4000';

/** The error envelope every BEYU OS endpoint returns on failure. */
export interface ApiErrorBody {
  error: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
    timestamp?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Send without credentials — only for /auth/login and /auth/refresh. */
  anonymous?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false } = options;

  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';

  if (!anonymous) {
    const token = readAccessToken();
    if (!token) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has ended. Sign in again.');
    }
    headers.authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // A control plane must never render a stale org chart or risk register.
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      503,
      'API_UNREACHABLE',
      'The BEYU OS API is not reachable. This is a connectivity problem, not a permissions one.',
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text ? safeJson(text) : null;

  if (!response.ok) {
    const envelope = payload as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'UNKNOWN',
      envelope?.error?.message ?? `Request failed with status ${response.status}.`,
      envelope?.error?.requestId,
    );
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Fetches and returns a discriminated result instead of throwing.
 *
 * Pages use this so that a 403 on one panel renders as "you do not have access
 * to this" beside the panels that did load, rather than collapsing the whole
 * screen into an error boundary. Partial visibility is normal in a system
 * where authorization is per-resource.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export async function tryApi<T>(path: string, options: ApiOptions = {}): Promise<Result<T>> {
  try {
    return { ok: true, data: await apiFetch<T>(path, options) };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error };
    throw error;
  }
}
