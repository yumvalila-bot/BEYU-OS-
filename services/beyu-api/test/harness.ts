/**
 * Shared end-to-end test harness.
 *
 * Boots the real application against a real (WASM) PostgreSQL in a private
 * data directory, seeds it, and creates an authenticated user. Each test file
 * gets its own directory and its own database process, so files remain
 * independent under node:test's default parallel execution.
 *
 * Everything is imported dynamically AFTER the environment variables are set:
 * `loadConfig()` memoizes, and the database driver is a module-level
 * singleton, so a static import would capture whichever configuration happened
 * to load first.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { Role } from '@beyu/types';

import type { Database } from '../src/db/driver';

export interface TestResponse<T = any> {
  status: number;
  body: T;
}

export interface Harness {
  app: INestApplication;
  db: Database;
  baseUrl: string;
  /** Access token for the user created by `boot`. */
  token: string;
  userId: string;
  request(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<TestResponse>;
  /** Authenticated request using the harness user's token. */
  auth(method: string, path: string, body?: unknown): Promise<TestResponse>;
  /** Issues a token for another user, e.g. one with narrower roles. */
  loginAs(email: string, password: string): Promise<string>;
  /** Creates an active user with the given roles and returns their id. */
  createUser(email: string, password: string, roles: Role[]): Promise<string>;
  close(): Promise<void>;
}

export const HARNESS_PASSWORD = 'a-sufficiently-long-password';

/**
 * @param prefix  A short name unique to the calling test file. It becomes part
 *                of the temp directory, which keeps parallel files apart.
 * @param roles   Roles granted to the default user.
 */
export async function boot(
  prefix: string,
  roles: Role[] = [Role.TrustAdministrator],
): Promise<Harness> {
  const dataDir = await mkdtemp(join(tmpdir(), `beyu-${prefix}-`));
  process.env.BEYU_ENV = 'testing';
  process.env.PGLITE_DATA_DIR = dataDir;
  process.env.DATABASE_DRIVER = 'pglite';

  const { resetConfigCache } = await import('@beyu/config');
  resetConfigCache();

  const { closeDatabase, getDatabase } = await import('../src/db/driver');
  await closeDatabase();
  const db = getDatabase();

  const { migrate } = await import('../src/db/migrator');
  await migrate(db);
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
    userRoles: Role[],
  ): Promise<string> => {
    const { hashPassword } = await import('@beyu/security');
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO identity.users
         (identity_id, email, display_name, password_hash, status, max_classification)
       VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE', 'RESTRICTED')
       RETURNING id`,
      [email, email.split('@')[0], hashPassword(password)],
    );
    const id = inserted.rows[0]!.id;
    for (const role of userRoles) {
      const found = await db.query<{ id: string }>(
        'SELECT id FROM identity.roles WHERE code = $1',
        [role],
      );
      const roleId = found.rows[0]?.id;
      if (!roleId) throw new Error(`Role ${role} is not seeded.`);
      await db.query('INSERT INTO identity.user_roles (user_id, role_id) VALUES ($1, $2)', [
        id,
        roleId,
      ]);
    }
    return id;
  };

  const loginAs = async (email: string, password: string): Promise<string> => {
    const res = await request('POST', '/api/v1/auth/login', { email, password });
    if (res.status !== 200) {
      throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.accessToken as string;
  };

  const email = `${prefix}@beyu.example`;
  const userId = await createUser(email, HARNESS_PASSWORD, roles);
  const token = await loginAs(email, HARNESS_PASSWORD);

  const auth = (method: string, path: string, body?: unknown): Promise<TestResponse> =>
    request(method, path, body, { authorization: `Bearer ${token}` });

  return {
    app,
    db,
    baseUrl,
    token,
    userId,
    request,
    auth,
    loginAs,
    createUser,
    close: async () => {
      await app.close();
      const { closeDatabase: shutdown } = await import('../src/db/driver');
      await shutdown();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
