/**
 * BEYU OS — migration runner.
 *
 * Deliberately dependency-free: plain numbered .sql files applied in order and
 * recorded with a checksum. An already-applied migration whose file has been
 * edited is a hard error — silently diverging schemas are how production and
 * staging drift apart.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from './driver';
import { execScript } from './driver';

export interface MigrationFile {
  version: string;
  name: string;
  path: string;
  sql: string;
  checksum: string;
}

export const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

export function loadMigrations(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => {
      const sql = readFileSync(join(dir, file), 'utf8');
      const version = file.split('_')[0];
      return {
        version,
        name: file.replace(/\.sql$/, ''),
        path: join(dir, file),
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    });
}

async function ensureMigrationTable(db: Database): Promise<void> {
  await execScript(
    db,
    `CREATE TABLE IF NOT EXISTS public.schema_migrations (
       version    TEXT PRIMARY KEY,
       name       TEXT NOT NULL,
       checksum   TEXT NOT NULL,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );`,
  );
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export async function migrate(
  db: Database,
  options: { dir?: string; log?: (msg: string) => void } = {},
): Promise<MigrateResult> {
  const log = options.log ?? ((m: string) => console.log(m));
  await ensureMigrationTable(db);

  const existing = await db.query<{ version: string; name: string; checksum: string }>(
    'SELECT version, name, checksum FROM public.schema_migrations',
  );
  const byVersion = new Map(existing.rows.map((r) => [r.version, r]));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of loadMigrations(options.dir)) {
    const previous = byVersion.get(migration.version);
    if (previous) {
      if (previous.checksum !== migration.checksum) {
        throw new Error(
          `Migration ${migration.name} has already been applied but its contents have ` +
            `changed (checksum mismatch). Applied migrations are immutable — add a new ` +
            `migration instead of editing ${migration.version}.`,
        );
      }
      skipped.push(migration.name);
      continue;
    }

    log(`  applying ${migration.name}`);
    await execScript(db, migration.sql);
    await db.query(
      'INSERT INTO public.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
      [migration.version, migration.name, migration.checksum],
    );
    applied.push(migration.name);
  }

  return { applied, skipped };
}

/** Destroys all BEYU schemas. Refuses to run against production. */
export async function reset(db: Database): Promise<void> {
  if (process.env.BEYU_ENV === 'production') {
    throw new Error('Refusing to reset the database in production.');
  }
  const schemas = [
    'app',
    'builder',
    'ai',
    'integrations',
    'audit',
    'reporting',
    'notifications',
    'workflow',
    'documents',
    'waterfall',
    'capital',
    'compliance',
    'risk',
    'strategy',
    'governance',
    'ownership',
    'organization',
    'identity',
  ];
  for (const schema of schemas) {
    await execScript(db, `DROP SCHEMA IF EXISTS ${schema} CASCADE;`);
  }
  await execScript(db, 'DROP TABLE IF EXISTS public.schema_migrations CASCADE;');
}
