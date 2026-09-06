/**
 * BEYU AGRICULTURE OS — database driver.
 * Mirrors the control-plane driver with agriculture-specific targets.
 * PostgreSQL + PGLite abstraction with RLS tenant context.
 */
import { mkdir } from 'node:fs/promises';
import { isSupabaseConnection, resolveAgricultureDatabaseTarget } from './connection-target';

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface DatabaseSession {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface RequestContext {
  tenantId: string | null;
  userId: string | null;
  crossTenant?: boolean;
}

export interface Database {
  readonly driver: 'pglite' | 'postgres';
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  withContext<T>(context: RequestContext, fn: (session: DatabaseSession) => Promise<T>): Promise<T>;
  transaction<T>(fn: (session: DatabaseSession) => Promise<T>): Promise<T>;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}

async function applyContext(session: DatabaseSession, context: RequestContext): Promise<void> {
  await session.query('SELECT set_config($1, $2, true)', ['app.tenant', context.tenantId ?? '']);
  await session.query('SELECT set_config($1, $2, true)', ['app.user_id', context.userId ?? '']);
  await session.query('SELECT set_config($1, $2, true)', ['app.cross_tenant', context.crossTenant ? 'on' : 'off']);
  await session.query('SELECT set_config($1, $2, true)', ['app.current_tenant', context.tenantId ?? '']);
}

class PgliteDatabase implements Database {
  readonly driver = 'pglite' as const;
  private db: any;
  private readonly dataDir: string;
  private ready: Promise<void> | null = null;
  constructor(dataDir: string) { this.dataDir = dataDir; }
  private async init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await mkdir(this.dataDir, { recursive: true });
        const mod: any = await import('@electric-sql/pglite');
        this.db = new mod.PGlite(this.dataDir);
        await this.db.waitReady;
      })();
    }
    return this.ready;
  }
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    await this.init();
    const result = params.length ? await this.db.query(sql, params) : await this.db.exec(sql).then((r: any[]) => r[r.length - 1] ?? { rows: [] });
    return { rows: (result.rows ?? []) as T[], rowCount: result.rows?.length ?? 0 };
  }
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
  async withContext<T>(context: RequestContext, fn: (session: DatabaseSession) => Promise<T>): Promise<T> {
    return this.transaction(async (session) => {
      await applyContext(session, context);
      return fn(session);
    });
  }
  async healthCheck(): Promise<boolean> {
    try { const r = await this.query<{ ok: number }>('SELECT 1 AS ok'); return r.rows[0]?.ok === 1; } catch { return false; }
  }
  async close(): Promise<void> { if (this.db) await this.db.close(); }
}

class PostgresDatabase implements Database {
  readonly driver = 'postgres' as const;
  private pool: any;
  private ready: Promise<void> | null = null;
  private readonly connectionString: string;
  constructor(connectionString: string) { this.connectionString = connectionString; }
  private async init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        const pg: any = await import('pg');
        const Pool = pg.Pool ?? pg.default?.Pool;
        this.pool = new Pool({
          connectionString: this.connectionString,
          max: Number(process.env.DATABASE_POOL_MAX ?? 10),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
          ssl: isSupabaseConnection(this.connectionString) ? { rejectUnauthorized: true } : undefined,
        });
      })();
    }
    return this.ready;
  }
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    await this.init();
    const r = await this.pool.query(sql, params);
    return { rows: r.rows as T[], rowCount: r.rowCount ?? r.rows.length };
  }
  async exec(sql: string): Promise<void> { await this.init(); await this.pool.query(sql); }
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
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  async withContext<T>(context: RequestContext, fn: (session: DatabaseSession) => Promise<T>): Promise<T> {
    return this.transaction(async (session) => { await applyContext(session, context); return fn(session); });
  }
  async healthCheck(): Promise<boolean> {
    try { const r = await this.query<{ ok: number }>('SELECT 1 AS ok'); return r.rows[0]?.ok === 1; } catch { return false; }
  }
  async close(): Promise<void> { if (this.pool) await this.pool.end(); }
}

let instance: Database | null = null;
export function createDatabase(): Database {
  const target = resolveAgricultureDatabaseTarget();
  return target.driver === 'postgres'
    ? new PostgresDatabase(target.url)
    : new PgliteDatabase(target.pgliteDataDir);
}
export function getDatabase(): Database { if (!instance) instance = createDatabase(); return instance; }
export async function closeDatabase(): Promise<void> { if (instance) { await instance.close(); instance = null; } }
export function setDatabase(db: Database | null): void { instance = db; }
export async function execScript(db: Database, sql: string): Promise<void> {
  const runner = db as unknown as { exec?: (s: string) => Promise<void> };
  if (typeof runner.exec === 'function') { await runner.exec(sql); return; }
  await db.query(sql);
}
