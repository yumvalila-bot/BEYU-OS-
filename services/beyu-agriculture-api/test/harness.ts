/**
 * Shared end-to-end test harness for BEYU AGRICULTURE OS.
 *
 * Boots the real application against a real (WASM) PostgreSQL in a private
 * data directory, migrates, seeds, and issues authenticated requests over
 * HTTP. Each test file gets its own directory and database, so files remain
 * independent under node:test's default parallel execution.
 *
 * Everything is imported dynamically AFTER the environment variables are
 * set: `loadConfig()` memoizes and the database driver is a module-level
 * singleton.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import type { Database } from '../src/db/driver';

export interface TestResponse<T = any> {
  status: number;
  body: T;
}

export interface Harness {
  app: INestApplication;
  db: Database;
  baseUrl: string;
  token: string;
  userId: string;
  request(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<TestResponse>;
  auth(method: string, path: string, body?: unknown, token?: string): Promise<TestResponse>;
  loginAs(email: string, password: string): Promise<string>;
  createUser(email: string, password: string, roles: string[], tenantId?: string | null, farmId?: string | null): Promise<string>;
  close(): Promise<void>;
}

export const HARNESS_PASSWORD = 'a-sufficiently-long-password';

export async function boot(
  prefix: string,
  roles: string[] = ['SUPER_ADMIN'],
): Promise<Harness> {
  const dataDir = await mkdtemp(join(tmpdir(), `beyu-agri-${prefix}-`));
  process.env.BEYU_ENV = 'testing';
  process.env.AGRICULTURE_PGLITE_DATA_DIR = dataDir;
  process.env.DATABASE_DRIVER = 'pglite';
  process.env.AGRICULTURE_DATABASE_URL = 'postgresql://beyu_agriculture:beyu_agriculture@localhost:5434/beyu_agriculture_os';

  const { resetConfigCache } = await import('@beyu/config');
  resetConfigCache();

  const { closeDatabase, getDatabase } = await import('../src/db/driver');
  await closeDatabase();
  const db = getDatabase();

  const { migrate } = await import('../src/db/migrator');
  await migrate(db, { log: () => {} });
  const { seed } = await import('../src/db/seed');
  await seed(db);

  const { AppModule } = await import('../src/app.module');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const request = async (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<TestResponse> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed };
  };

  const createUser = async (
    email: string,
    password: string,
    userRoles: string[],
    tenantId?: string | null,
    farmId?: string | null,
  ): Promise<string> => {
    const { hashPassword } = await import('@beyu/security');
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO agri_identity.users (email, display_name, password_hash, status)
       VALUES ($1, $2, $3, 'ACTIVE') RETURNING id`,
      [email, email.split('@')[0], hashPassword(password)],
    );
    const userId = inserted.rows[0].id;
    for (const role of userRoles) {
      await db.query(
        `INSERT INTO agri_identity.user_roles (user_id, role_id) SELECT $1, id FROM agri_identity.roles WHERE code=$2 ON CONFLICT DO NOTHING`,
        [userId, role],
      );
    }
    if (tenantId) {
      await db.query(
        `INSERT INTO agri_identity.memberships (user_id, tenant_id, farm_id, role_in_tenant, status) VALUES ($1, $2, $3, 'MEMBER', 'ACTIVE') ON CONFLICT DO NOTHING`,
        [userId, tenantId, farmId ?? null],
      );
    }
    return userId;
  };

  const loginAs = async (email: string, password: string): Promise<string> => {
    const res = await request('POST', '/api/v1/auth/login', { email, password });
    if (res.status !== 200) throw new Error(`loginAs failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    return (res.body as any).accessToken;
  };

  const defaultUser = await createUser(`${prefix}-admin@beyu.agriculture`, HARNESS_PASSWORD, roles, null, null);
  const token = await loginAs(`${prefix}-admin@beyu.agriculture`, HARNESS_PASSWORD);

  return {
    app,
    db,
    baseUrl,
    token,
    userId: defaultUser,
    request,
    auth: (method, path, body, tok) => request(method, path, body, { authorization: `Bearer ${tok ?? token}` }),
    loginAs,
    createUser,
    close: async () => {
      await app.close();
      await closeDatabase();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

/** Deterministic UUIDs used by the seed. */
export const TENANT_TZ = '00000000-0000-0000-0000-000000000001';
export const TENANT_KE = '00000000-0000-0000-0000-000000000002';
export const FARM_KILOMBERO = '00000000-0000-0000-0000-000000000010';
export const FARM_NJOMBE = '00000000-0000-0000-0000-000000000011';
export const FARM_NAIVASHA = '00000000-0000-0000-0000-000000000012';
export const FIELD_NORTH_A = '00000000-0000-0000-0000-000000000100';
export const FIELD_NORTH_B = '00000000-0000-0000-0000-000000000101';
export const FIELD_NAIVASHA_GH = '00000000-0000-0000-0000-000000000103';
export const CROP_RICE = '00000000-0000-0000-0000-000000000200';
export const CROP_AVOCADO = '00000000-0000-0000-0000-000000000203';
export const WAREHOUSE_PRODUCE = '00000000-0000-0000-0000-000000000400';
export const WAREHOUSE_COLD = '00000000-0000-0000-0000-000000000401';
export const WAREHOUSE_INPUT = '00000000-0000-0000-0000-000000000402';
export const INPUT_SEED = '00000000-0000-0000-0000-000000000500';
export const INPUT_FERT = '00000000-0000-0000-0000-000000000501';
export const SUPPLIER_TFC = '00000000-0000-0000-0000-000000000600';
export const BUYER_KARIBU = '00000000-0000-0000-0000-000000000610';
