/**
 * Configuration tests (spec §58, §74).
 *
 * The security-critical property is the production fail-fast: BEYU OS must
 * refuse to start with a weak or default JWT signing key.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { loadConfig, resetConfigCache } from './index';

const SNAPSHOT = { ...process.env };

function clearBeyuEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith('BEYU_') ||
      key.startsWith('S3_') ||
      key.startsWith('KAFKA_') ||
      key.startsWith('AI_') ||
      ['PORT', 'DATABASE_DRIVER', 'DATABASE_URL', 'PGLITE_DATA_DIR', 'REDIS_URL', 'JWT_SECRET',
        'JWT_ISSUER', 'ACCESS_TOKEN_TTL', 'REFRESH_TOKEN_TTL', 'STORAGE_DRIVER',
        'STORAGE_LOCAL_PATH', 'EVENT_DRIVER', 'LOG_LEVEL', 'METRICS_ENABLED', 'CORS_ORIGINS',
        'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX', 'BCRYPT_ROUNDS',
        'REQUIRE_MFA_HIGH_IMPACT'].includes(key)
    ) {
      delete process.env[key];
    }
  }
}

beforeEach(() => {
  clearBeyuEnv();
  resetConfigCache();
});

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, SNAPSHOT);
  resetConfigCache();
});

describe('production safety', () => {
  it('refuses to start in production without a JWT secret', () => {
    process.env.BEYU_ENV = 'production';
    assert.throws(() => loadConfig(), /JWT_SECRET/);
  });

  it('refuses a JWT secret shorter than 32 characters', () => {
    process.env.BEYU_ENV = 'production';
    process.env.JWT_SECRET = 'too-short';
    assert.throws(() => loadConfig(), /at least 32 characters/);
  });

  it('starts in production with a strong secret', () => {
    process.env.BEYU_ENV = 'production';
    process.env.JWT_SECRET = 'x'.repeat(32);
    const config = loadConfig();
    assert.equal(config.env, 'production');
    assert.equal(config.jwtSecret, 'x'.repeat(32));
  });

  it('never falls back to the dev secret in production', () => {
    process.env.BEYU_ENV = 'production';
    process.env.JWT_SECRET = 'a-properly-long-production-secret-value';
    assert.ok(!loadConfig().jwtSecret.includes('dev-only'));
  });

  it('defaults the log level to info in production and debug elsewhere', () => {
    process.env.BEYU_ENV = 'production';
    process.env.JWT_SECRET = 'x'.repeat(40);
    assert.equal(loadConfig().observability.logLevel, 'info');

    resetConfigCache();
    delete process.env.BEYU_ENV;
    assert.equal(loadConfig().observability.logLevel, 'debug');
  });

  it('leaves AI disabled in production rather than serving stub answers', () => {
    process.env.BEYU_ENV = 'production';
    process.env.JWT_SECRET = 'x'.repeat(40);

    const config = loadConfig();
    assert.equal(config.ai.driver, 'stub');
    assert.equal(
      config.ai.enabled,
      false,
      'a production deployment that has not configured a model must not run the stub',
    );
  });

  it('refuses to start if an operator explicitly enables the stub in production', () => {
    process.env.BEYU_ENV = 'production';
    process.env.JWT_SECRET = 'x'.repeat(40);
    process.env.AI_ENABLED = 'true';

    // Silently ignoring this would leave canned text being read as governance
    // analysis, with nothing on screen to say so.
    assert.throws(() => loadConfig(), /stubbed intelligence/);
  });

  it('enables AI in production once a real provider is configured', () => {
    process.env.BEYU_ENV = 'production';
    process.env.JWT_SECRET = 'x'.repeat(40);
    process.env.AI_DRIVER = 'openai-compatible';

    const config = loadConfig();
    assert.equal(config.ai.enabled, true);
    assert.equal(config.ai.driver, 'openai-compatible');
  });

  it('never reads an API key from configuration, only a reference to one', () => {
    process.env.AI_API_KEY_REF = 'BEYU_AI_KEY';
    const config = loadConfig();

    // The value is the *name* of the variable holding the key, not the key.
    assert.equal(config.ai.apiKeyRef, 'BEYU_AI_KEY');

    // There is no field on the AI config that could hold a credential. The
    // key is resolved at the call site from the secret store.
    const credentialFields = Object.keys(config.ai).filter((k) =>
      /^(apiKey|secret|password|credential)$/i.test(k),
    );
    assert.deepEqual(credentialFields, []);
  });
});

describe('development defaults', () => {
  it('runs with no environment at all', () => {
    const config = loadConfig();
    assert.equal(config.env, 'development');
    assert.equal(config.port, 4000);
    assert.equal(config.databaseDriver, 'pglite');
    assert.equal(config.events.driver, 'inmemory');
    assert.equal(config.storage.driver, 'filesystem');
  });

  it('leaves optional secrets null rather than inventing values', () => {
    const config = loadConfig();
    assert.equal(config.redisUrl, null);
    assert.equal(config.storage.accessKeyId, null);
    assert.equal(config.storage.secretAccessKey, null);
    assert.equal(config.observability.otlpEndpoint, null);
  });

  it('requires MFA for high-impact actions by default', () => {
    assert.equal(loadConfig().security.requireMfaForHighImpact, true);
  });
});

describe('parsing', () => {
  it('parses numbers and rejects non-numeric values', () => {
    process.env.PORT = '8080';
    assert.equal(loadConfig().port, 8080);

    resetConfigCache();
    process.env.PORT = 'not-a-number';
    assert.throws(() => loadConfig(), /must be a number/);
  });

  it('parses comma-separated lists and trims whitespace', () => {
    process.env.CORS_ORIGINS = 'https://a.test, https://b.test ,';
    assert.deepEqual(loadConfig().security.corsOrigins, ['https://a.test', 'https://b.test']);
  });

  it('parses booleans from both "true" and "1"', () => {
    process.env.METRICS_ENABLED = 'false';
    assert.equal(loadConfig().observability.metricsEnabled, false);

    resetConfigCache();
    process.env.METRICS_ENABLED = '1';
    assert.equal(loadConfig().observability.metricsEnabled, true);
  });

  it('treats an empty string as unset and uses the fallback', () => {
    process.env.PORT = '';
    assert.equal(loadConfig().port, 4000);
  });
});

describe('memoization', () => {
  it('returns the same object on repeated calls', () => {
    assert.equal(loadConfig(), loadConfig());
  });

  it('ignores environment changes until the cache is reset', () => {
    assert.equal(loadConfig().port, 4000);
    process.env.PORT = '9999';
    assert.equal(loadConfig().port, 4000, 'cached config must not drift mid-process');

    resetConfigCache();
    assert.equal(loadConfig().port, 9999);
  });
});
