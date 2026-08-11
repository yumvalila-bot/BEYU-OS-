/**
 * @beyu/config — environment configuration with fail-fast validation.
 * Secrets are read from the environment only; never committed, never shipped
 * to the frontend (spec §58, §74).
 */

export type BeyuEnvironment = 'development' | 'testing' | 'staging' | 'production';

export interface BeyuConfig {
  env: BeyuEnvironment;
  port: number;
  /**
   * Database driver.
   *  - 'pglite'   : embedded real PostgreSQL (WASM) for local dev/CI sandboxes
   *  - 'postgres' : standard PostgreSQL server via connection string
   */
  databaseDriver: 'pglite' | 'postgres';
  databaseUrl: string;
  pgliteDataDir: string;
  redisUrl: string | null;
  jwtSecret: string;
  jwtIssuer: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  /** S3-compatible object storage for documents (spec §35, §46). */
  storage: {
    driver: 's3' | 'filesystem';
    endpoint: string | null;
    bucket: string;
    region: string;
    accessKeyId: string | null;
    secretAccessKey: string | null;
    /** Local path when driver is 'filesystem'. */
    localPath: string;
  };
  events: {
    /** 'kafka' in real deployments; 'inmemory' for local dev without a broker. */
    driver: 'kafka' | 'inmemory';
    brokers: string[];
    clientId: string;
  };
  observability: {
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    otlpEndpoint: string | null;
    metricsEnabled: boolean;
  };
  security: {
    corsOrigins: string[];
    rateLimitWindowMs: number;
    rateLimitMax: number;
    bcryptRounds: number;
    requireMfaForHighImpact: boolean;
  };
}

function str(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, received "${raw}"`);
  }
  return parsed;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

function list(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

let cached: BeyuConfig | null = null;

export function loadConfig(): BeyuConfig {
  if (cached) return cached;

  const env = str('BEYU_ENV', 'development') as BeyuEnvironment;
  const isProduction = env === 'production';

  const jwtSecret = process.env.JWT_SECRET ?? '';
  if (isProduction && jwtSecret.length < 32) {
    // Fail fast rather than run production with a weak or default secret.
    throw new Error(
      'JWT_SECRET must be set to at least 32 characters in production. ' +
        'Refusing to start with an insecure signing key.',
    );
  }

  const config: BeyuConfig = {
    env,
    port: num('PORT', 4000),
    databaseDriver: (str('DATABASE_DRIVER', 'pglite') as 'pglite' | 'postgres'),
    databaseUrl: str('DATABASE_URL', 'postgresql://beyu:beyu@localhost:5432/beyu_os'),
    pgliteDataDir: str('PGLITE_DATA_DIR', '.data/pglite'),
    redisUrl: process.env.REDIS_URL ?? null,
    jwtSecret: jwtSecret || 'dev-only-insecure-secret-change-me-0123456789',
    jwtIssuer: str('JWT_ISSUER', 'beyu-os'),
    accessTokenTtlSeconds: num('ACCESS_TOKEN_TTL', 3600),
    refreshTokenTtlSeconds: num('REFRESH_TOKEN_TTL', 1209600),
    storage: {
      driver: (str('STORAGE_DRIVER', 'filesystem') as 's3' | 'filesystem'),
      endpoint: process.env.S3_ENDPOINT ?? null,
      bucket: str('S3_BUCKET', 'beyu-os-documents'),
      region: str('S3_REGION', 'us-east-1'),
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? null,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? null,
      localPath: str('STORAGE_LOCAL_PATH', '.data/storage'),
    },
    events: {
      driver: (str('EVENT_DRIVER', 'inmemory') as 'kafka' | 'inmemory'),
      brokers: list('KAFKA_BROKERS', ['localhost:9092']),
      clientId: str('KAFKA_CLIENT_ID', 'beyu-os'),
    },
    observability: {
      logLevel: (str('LOG_LEVEL', isProduction ? 'info' : 'debug') as BeyuConfig['observability']['logLevel']),
      otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null,
      metricsEnabled: bool('METRICS_ENABLED', true),
    },
    security: {
      corsOrigins: list('CORS_ORIGINS', ['http://localhost:3000']),
      rateLimitWindowMs: num('RATE_LIMIT_WINDOW_MS', 60_000),
      rateLimitMax: num('RATE_LIMIT_MAX', 300),
      bcryptRounds: num('BCRYPT_ROUNDS', 12),
      requireMfaForHighImpact: bool('REQUIRE_MFA_HIGH_IMPACT', true),
    },
  };

  cached = config;
  return config;
}

/** Test helper: clears the memoized configuration. */
export function resetConfigCache(): void {
  cached = null;
}
