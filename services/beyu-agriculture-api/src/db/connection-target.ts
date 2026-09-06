/**
 * Resolves where Agriculture OS PostgreSQL should connect and refuses to
 * describe secrets. Used by the driver, migrator and health endpoint.
 *
 * Agriculture OS owns an ISOLATED database (never shared with the control
 * plane or Health OS) per the OS federation contract.
 */

export interface AgricultureDatabaseTarget {
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

export function resolveAgricultureDatabaseTarget(): AgricultureDatabaseTarget {
  const driver = (process.env.DATABASE_DRIVER || 'pglite') as 'pglite' | 'postgres';
  const url =
    process.env.AGRICULTURE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://beyu_agriculture:beyu_agriculture@localhost:5434/beyu_agriculture_os';
  const pgliteDataDir = process.env.AGRICULTURE_PGLITE_DATA_DIR || '.data/agriculture_pglite';
  const supabase = isSupabaseConnection(url);
  const projectRef = extractSupabaseProjectRef(url);
  return {
    driver: driver === 'postgres' ? 'postgres' : 'pglite',
    url,
    pgliteDataDir,
    supabase,
    projectRef,
    sanitized: driver === 'postgres' ? sanitizeConnectionString(url) : `pglite:${pgliteDataDir}`,
  };
}

export function assertSafeMigrate(target: AgricultureDatabaseTarget): void {
  const env = process.env.BEYU_ENV || 'development';
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

export function assertSafeReset(target: AgricultureDatabaseTarget): void {
  const env = process.env.BEYU_ENV || 'development';
  if (target.supabase) {
    throw new Error(`Refusing database reset against Supabase (${target.sanitized}). This is never allowed.`);
  }
  if (env === 'production') {
    throw new Error('Refusing reset in production');
  }
}
