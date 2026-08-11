/**
 * BEYU OS — database driver abstraction (spec §45, §46).
 *
 * PostgreSQL is the system of record. Two drivers implement the same
 * interface:
 *
 *   'postgres' — a real PostgreSQL server via node-postgres. Production.
 *   'pglite'   — PostgreSQL 16 compiled to WASM, running in-process. Used for
 *                local development, CI and sandboxes where no server can be
 *                installed. It is genuine PostgreSQL, not a mock or an
 *                emulation, so schemas, constraints, triggers and RLS behave
 *                the same way as in production.
 *
 * Callers never import `pg` or `@electric-sql/pglite` directly; they depend on
 * the `Database` interface below.
 */

import { loadConfig } from '@beyu/config';

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

/**
 * A connection with a bound request context. Every domain query must run
 * through one of these so that the tenant GUC is set and RLS applies.
 */
export interface DatabaseSession {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface RequestContext {
  /** Tenant whose data this transaction may touch. Null = trust-level. */
  tenantId: string | null;
  /** Authenticated user. Null only for pre-authentication lookups. */
  userId: string | null;
  /**
   * Set only after the policy engine has confirmed a trust-level role
   * (TrustAdministrator / Auditor). Never derived from client input.
   */
  crossTenant?: boolean;
}

export interface Database {
  readonly driver: 'pglite' | 'postgres';
  /** Raw query with no request context. Migrations and health checks only. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /**
   * Runs `fn` inside a transaction with the RLS context applied via
   * `SET LOCAL`, so the values are discarded when the transaction ends and
   * cannot leak across pooled connections.
   */
  withContext<T>(context: RequestContext, fn: (session: DatabaseSession) => Promise<T>): Promise<T>;
  /** Plain transaction with no RLS context. Migrations and system jobs only. */
  transaction<T>(fn: (session: DatabaseSession) => Promise<T>): Promise<T>;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * Builds the `SET LOCAL` statements for a request context.
 * `set_config(..., true)` is the parameterised equivalent of SET LOCAL and is
 * injection-safe, which a literal `SET LOCAL app.tenant = '...'` would not be.
 */
async function applyContext(session: DatabaseSession, context: RequestContext): Promise<void> {
  await session.query('SELECT set_config($1, $2, true)', ['app.tenant', context.tenantId ?? '']);
  await session.query('SELECT set_config($1, $2, true)', ['app.user_id', context.userId ?? '']);
  await session.query('SELECT set_config($1, $2, true)', [
    'app.cross_tenant',
    context.crossTenant ? 'on' : 'off',
  ]);
}

// ---------------------------------------------------------------------------
// PGlite driver — embedded PostgreSQL 16 (WASM)
// ---------------------------------------------------------------------------

class PgliteDatabase implements Database {
  readonly driver = 'pglite' as const;
  // Typed loosely because the dependency is optional at install time.
  private db: any;
  private readonly dataDir: string;
  private ready: Promise<void> | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private async init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        const mod: any = await import('@electric-sql/pglite');
        this.db = new mod.PGlite(this.dataDir);
        await this.db.waitReady;
      })();
    }
    return this.ready;
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    await this.init();
    const result = params.length
      ? await this.db.query(sql, params)
      : await this.db.exec(sql).then((r: any[]) => r[r.length - 1] ?? { rows: [] });
    return { rows: (result.rows ?? []) as T[], rowCount: result.rows?.length ?? 0 };
  }

  /** Runs a multi-statement SQL script (migrations). */
  async exec(sql: string): Promise<void> {
    await this.init();
    await this.db.exec(sql);
  }

  async transaction<T>(fn: (session: DatabaseSession) => Promise<T>): Promise<T> {
    await this.init();
    return this.db.transaction(async (tx: any) => {
      const session: DatabaseSession = {
        query: async (sql, params = []) => {
          const r = params.length ? await tx.query(sql, params) : await tx.query(sql);
          return { rows: (r.rows ?? []) as any[], rowCount: r.rows?.length ?? 0 };
        },
      };
      return fn(session);
    });
  }

  async withContext<T>(
    context: RequestContext,
    fn: (session: DatabaseSession) => Promise<T>,
  ): Promise<T> {
    return this.transaction(async (session) => {
      await applyContext(session, context);
      return fn(session);
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.query<{ ok: number }>('SELECT 1 AS ok');
      return r.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.db) await this.db.close();
  }
}

// ---------------------------------------------------------------------------
// node-postgres driver — production
// ---------------------------------------------------------------------------

class PostgresDatabase implements Database {
  readonly driver = 'postgres' as const;
  private pool: any;
  private ready: Promise<void> | null = null;
  private readonly connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  private async init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        const pg: any = await import('pg');
        const Pool = pg.Pool ?? pg.default?.Pool;
        this.pool = new Pool({
          connectionString: this.connectionString,
          max: Number(process.env.DATABASE_POOL_MAX ?? 10),
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000,
        });
      })();
    }
    return this.ready;
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    await this.init();
    const r = await this.pool.query(sql, params);
    return { rows: r.rows as T[], rowCount: r.rowCount ?? r.rows.length };
  }

  async exec(sql: string): Promise<void> {
    await this.init();
    await this.pool.query(sql);
  }

  async transaction<T>(fn: (session: DatabaseSession) => Promise<T>): Promise<T> {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const session: DatabaseSession = {
        query: async (sql, params = []) => {
          const r = await client.query(sql, params);
          return { rows: r.rows as any[], rowCount: r.rowCount ?? r.rows.length };
        },
      };
      const result = await fn(session);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async withContext<T>(
    context: RequestContext,
    fn: (session: DatabaseSession) => Promise<T>,
  ): Promise<T> {
    return this.transaction(async (session) => {
      await applyContext(session, context);
      return fn(session);
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.query<{ ok: number }>('SELECT 1 AS ok');
      return r.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.pool) await this.pool.end();
  }
}

// ---------------------------------------------------------------------------

let instance: Database | null = null;

export function createDatabase(): Database {
  const config = loadConfig();
  return config.databaseDriver === 'postgres'
    ? new PostgresDatabase(config.databaseUrl)
    : new PgliteDatabase(config.pgliteDataDir);
}

/** Process-wide singleton. */
export function getDatabase(): Database {
  if (!instance) instance = createDatabase();
  return instance;
}

export async function closeDatabase(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}

/** Test helper: replaces the singleton. */
export function setDatabase(db: Database | null): void {
  instance = db;
}

/** Runs a multi-statement SQL script on either driver. */
export async function execScript(db: Database, sql: string): Promise<void> {
  const runner = db as unknown as { exec?: (s: string) => Promise<void> };
  if (typeof runner.exec === 'function') {
    await runner.exec(sql);
    return;
  }
  await db.query(sql);
}
