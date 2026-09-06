import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from './driver';
import { execScript } from './driver';
import { assertSafeMigrate, assertSafeReset, resolveAgricultureDatabaseTarget } from './connection-target';

export interface MigrationFile {
  version: string;
  name: string;
  path: string;
  sql: string;
  checksum: string;
}

export const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

export function loadMigrations(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir).filter(f=>f.endsWith('.sql')).sort().map(file=>{
    const sql = readFileSync(join(dir,file),'utf8');
    const version = file.split('_')[0];
    return { version, name: file.replace(/\.sql$/,''), path: join(dir,file), sql, checksum: createHash('sha256').update(sql).digest('hex') } as MigrationFile;
  });
}

async function ensureMigrationTable(db: Database): Promise<void> {
  await execScript(db, `CREATE TABLE IF NOT EXISTS public.agriculture_schema_migrations (
    version TEXT PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`);
}

export async function migrationStatus(db: Database | null, options: { dir?: string } = {}): Promise<{
  files: string[];
  applied: string[];
  pending: string[];
  target: string;
}> {
  const files = loadMigrations(options.dir);
  const target = resolveAgricultureDatabaseTarget();
  if (!db) {
    return { files: files.map((f) => f.name), applied: [], pending: files.map((f) => f.name), target: target.sanitized };
  }
  try {
    const existing = await db.query<{ version: string }>('SELECT version FROM public.agriculture_schema_migrations');
    const appliedVersions = new Set(existing.rows.map((r) => r.version));
    const applied = files.filter((f) => appliedVersions.has(f.version)).map((f) => f.name);
    const pending = files.filter((f) => !appliedVersions.has(f.version)).map((f) => f.name);
    return { files: files.map((f) => f.name), applied, pending, target: target.sanitized };
  } catch {
    return { files: files.map((f) => f.name), applied: [], pending: files.map((f) => f.name), target: target.sanitized };
  }
}

export async function migrate(db: Database, options: { dir?: string; log?: (msg:string)=>void } = {}): Promise<{applied:string[]; skipped:string[]}> {
  assertSafeMigrate(resolveAgricultureDatabaseTarget());
  const log = options.log ?? ((m:string)=>console.log(m));
  await ensureMigrationTable(db);
  const existing = await db.query<{version:string; name:string; checksum:string}>('SELECT version, name, checksum FROM public.agriculture_schema_migrations');
  const byVersion = new Map(existing.rows.map(r=>[r.version,r]));
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const migration of loadMigrations(options.dir)) {
    const prev = byVersion.get(migration.version);
    if (prev) {
      if (prev.checksum !== migration.checksum) throw new Error(`Migration ${migration.name} checksum mismatch`);
      skipped.push(migration.name); continue;
    }
    log(` applying ${migration.name}`);
    await execScript(db, migration.sql);
    await db.query('INSERT INTO public.agriculture_schema_migrations (version, name, checksum) VALUES ($1,$2,$3)', [migration.version, migration.name, migration.checksum]);
    applied.push(migration.name);
  }
  return { applied, skipped };
}

export async function reset(db: Database): Promise<void> {
  assertSafeReset(resolveAgricultureDatabaseTarget());
  const schemas = ['agri_identity','agri_tenant','agri_farm','agri_crop','agri_livestock','agri_inventory','agri_procurement','agri_equipment','agri_workforce','agri_compliance','agri_audit'];
  await db.transaction(async (session) => {
    await session.query('DROP SCHEMA IF EXISTS public CASCADE');
    await session.query('CREATE SCHEMA public');
    for (const s of schemas) {
      await session.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    }
    await session.query('DROP TABLE IF EXISTS public.agriculture_schema_migrations');
  });
}
