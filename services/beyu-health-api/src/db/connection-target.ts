/**
 * Resolves where Health OS PostgreSQL should connect and refuses to
 * describe secrets. Used by the driver, migrator and health endpoint.
 */

export const ASSOCIATED_SUPABASE_PROJECT_REF = 'ztulvqnvtxmiejnvdcit';
export const UNASSOCIATED_SUPABASE_PROJECT_REF = 'siyzygezdmlxbvwttrdz';

export interface HealthDatabaseTarget {
  driver: 'pglite' | 'postgres';
  url: string;
  pgliteDataDir: string;
  supabase: boolean;
  projectRef: string | null;
  sanitized: string;
}

export function sanitizeConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '(unparseable connection string)';
  }
}

export function connectionHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function isSupabaseConnection(url: string): boolean {
  const host = connectionHost(url) ?? '';
  return /supabase\.(co|com)$/i.test(host) || host.includes('pooler.supabase') || host.endsWith('.supabase.co');
}

export function extractSupabaseProjectRef(url: string): string | null {
  const host = connectionHost(url) ?? '';
  const dbMatch = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (dbMatch) return dbMatch[1];
  const apiMatch = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
  if (apiMatch) return apiMatch[1];
  const poolMatch = host.match(/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/i);
  if (poolMatch) {
    try {
      const user = new URL(url).username;
      const fromUser = user.match(/^[^.]+?\.([a-z0-9]+)$/i) ?? user.match(/([a-z0-9]{20,})/i);
      return fromUser ? fromUser[1] : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function configuredSupabaseProjectRef(): string | null {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicit) return explicit;
  const fromUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (fromUrl) return extractSupabaseProjectRef(fromUrl);
  return null;
}

export function resolveHealthDatabaseTarget(): HealthDatabaseTarget {
  const driver = (process.env.DATABASE_DRIVER || 'pglite') as 'pglite' | 'postgres';
  const url =
    process.env.HEALTH_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://beyu_health:beyu_health@localhost:5433/beyu_health_os';
  const pgliteDataDir = process.env.HEALTH_PGLITE_DATA_DIR || '.data/health_pglite';
  const supabase = isSupabaseConnection(url);
  const projectRef = extractSupabaseProjectRef(url) ?? configuredSupabaseProjectRef();
  return {
    driver: driver === 'postgres' ? 'postgres' : 'pglite',
    url,
    pgliteDataDir,
    supabase,
    projectRef,
    sanitized: driver === 'postgres' ? sanitizeConnectionString(url) : `pglite:${pgliteDataDir}`,
  };
}

export function assertSafeMigrate(target: HealthDatabaseTarget): void {
  const env = process.env.BEYU_ENV || 'development';
  if (target.projectRef === UNASSOCIATED_SUPABASE_PROJECT_REF) {
    throw new Error(
      'Refusing to migrate Supabase project B (siyzygezdmlxbvwttrdz). It is not associated with BEYU Health OS.',
    );
  }
  if (target.supabase && process.env.ALLOW_SUPABASE_MIGRATE !== 'yes') {
    throw new Error(
      `Refusing to apply migrations to a Supabase database (${target.sanitized}). ` +
        'Run `db:status` first. Set ALLOW_SUPABASE_MIGRATE=yes only after an explicit review.',
    );
  }
  if (env === 'production' && process.env.ALLOW_PRODUCTION_MIGRATE !== 'yes') {
    throw new Error(
      'Refusing to apply migrations while BEYU_ENV=production. Set ALLOW_PRODUCTION_MIGRATE=yes only after an explicit review.',
    );
  }
}

export function assertSafeReset(target: HealthDatabaseTarget): void {
  const env = process.env.BEYU_ENV || 'development';
  if (target.supabase) {
    throw new Error(`Refusing database reset against Supabase (${target.sanitized}). This is never allowed.`);
  }
  if (env === 'production') {
    throw new Error('Refusing reset in production');
  }
}
