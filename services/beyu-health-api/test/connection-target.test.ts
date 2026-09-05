import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  ASSOCIATED_SUPABASE_PROJECT_REF,
  UNASSOCIATED_SUPABASE_PROJECT_REF,
  assertSafeMigrate,
  assertSafeReset,
  extractSupabaseProjectRef,
  isSupabaseConnection,
  resolveHealthDatabaseTarget,
  sanitizeConnectionString,
  type HealthDatabaseTarget,
} from '../src/db/connection-target';

const originalEnv = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

function postgresTarget(url: string): HealthDatabaseTarget {
  return {
    driver: 'postgres',
    url,
    pgliteDataDir: '.data/health_pglite',
    supabase: isSupabaseConnection(url),
    projectRef: extractSupabaseProjectRef(url),
    sanitized: sanitizeConnectionString(url),
  };
}

describe('Health OS connection target', () => {
  beforeEach(() => {
    delete process.env.HEALTH_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_DRIVER;
    delete process.env.BEYU_ENV;
    delete process.env.ALLOW_SUPABASE_MIGRATE;
    delete process.env.ALLOW_PRODUCTION_MIGRATE;
    delete process.env.SUPABASE_PROJECT_REF;
  });
  afterEach(restoreEnv);

  it('strips passwords from logged connection strings', () => {
    const sanitized = sanitizeConnectionString(
      'postgresql://beyu:super-secret@db.ztulvqnvtxmiejnvdcit.supabase.co:5432/postgres',
    );
    assert.equal(sanitized.includes('super-secret'), false);
    assert.match(sanitized, /ztulvqnvtxmiejnvdcit/);
  });

  it('recognizes the associated Supabase project host', () => {
    const url = 'postgresql://postgres:x@db.ztulvqnvtxmiejnvdcit.supabase.co:5432/postgres';
    assert.equal(isSupabaseConnection(url), true);
    assert.equal(extractSupabaseProjectRef(url), ASSOCIATED_SUPABASE_PROJECT_REF);
  });

  it('defaults local Health OS to pglite and a dedicated datadir', () => {
    process.env.DATABASE_DRIVER = 'pglite';
    const target = resolveHealthDatabaseTarget();
    assert.equal(target.driver, 'pglite');
    assert.equal(target.supabase, false);
    assert.equal(target.pgliteDataDir, '.data/health_pglite');
  });

  it('prefers HEALTH_DATABASE_URL over the control-plane DATABASE_URL', () => {
    process.env.DATABASE_DRIVER = 'postgres';
    process.env.DATABASE_URL = 'postgresql://beyu:control@localhost:5432/beyu_os';
    process.env.HEALTH_DATABASE_URL = 'postgresql://beyu_health:health@localhost:5433/beyu_health_os';
    const target = resolveHealthDatabaseTarget();
    assert.match(target.sanitized, /5433/);
    assert.equal(target.sanitized.includes('control'), false);
  });

  it('refuses migrate against Supabase without an explicit override', () => {
    const target = postgresTarget('postgresql://postgres:x@db.ztulvqnvtxmiejnvdcit.supabase.co:5432/postgres');
    assert.throws(() => assertSafeMigrate(target), /ALLOW_SUPABASE_MIGRATE/);
  });

  it('refuses migrate against the unassociated project even with the override', () => {
    process.env.ALLOW_SUPABASE_MIGRATE = 'yes';
    const target = postgresTarget(`postgresql://postgres:x@db.${UNASSOCIATED_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`);
    assert.throws(() => assertSafeMigrate(target), /project B/);
  });

  it('never allows reset against Supabase', () => {
    const target = postgresTarget('postgresql://postgres:x@db.ztulvqnvtxmiejnvdcit.supabase.co:5432/postgres');
    assert.throws(() => assertSafeReset(target), /never allowed/);
  });
});
