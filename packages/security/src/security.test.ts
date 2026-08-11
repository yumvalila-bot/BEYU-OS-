/**
 * Security primitive tests (spec §39, §55, §57).
 *
 * Covers the audit hash chain, password hashing, secret redaction and the JWT
 * implementation. The JWT tests deliberately include the classic attacks
 * (alg:none, signature swap, expiry) because a hand-rolled verifier that gets
 * these wrong is worse than none at all.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuditEvent } from '@beyu/types';

import {
  AUDIT_GENESIS_HASH,
  canonicalJson,
  computeAuditHash,
  verifyAuditChain,
  type AuditHashInput,
} from './audit-chain';
import { generateToken, hashPassword, redactSecrets, sha256, verifyPassword } from './crypto';
import { signJwt, verifyJwt } from './tokens';

// --- canonical JSON --------------------------------------------------------

describe('canonicalJson', () => {
  it('is independent of key insertion order', () => {
    assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
  });

  it('sorts nested keys too', () => {
    assert.equal(
      canonicalJson({ outer: { z: 1, a: 2 } }),
      canonicalJson({ outer: { a: 2, z: 1 } }),
    );
  });

  it('preserves array order, which is semantically meaningful', () => {
    assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
  });

  it('distinguishes null from absent', () => {
    assert.notEqual(canonicalJson({ a: null }), canonicalJson({}));
  });
});

// --- audit chain -----------------------------------------------------------

function hashInput(overrides: Partial<AuditHashInput> = {}): AuditHashInput {
  return {
    sequence: 1,
    actorUserId: 'user-1',
    actorType: 'USER',
    tenantId: null,
    organizationId: null,
    osId: 'BEYU_OS',
    action: 'CREATE',
    resourceType: 'Strategy',
    resourceId: 'res-1',
    outcome: 'SUCCESS',
    previousState: null,
    newState: { title: 'Plan' },
    occurredAt: '2026-08-11T00:00:00.000Z',
    previousHash: AUDIT_GENESIS_HASH,
    ...overrides,
  } as AuditHashInput;
}

describe('computeAuditHash', () => {
  it('is deterministic', () => {
    assert.equal(computeAuditHash(hashInput()), computeAuditHash(hashInput()));
  });

  it('produces a 64-character hex digest', () => {
    assert.match(computeAuditHash(hashInput()), /^[0-9a-f]{64}$/);
  });

  it('changes when any field changes', () => {
    const base = computeAuditHash(hashInput());
    const mutations: Array<Partial<AuditHashInput>> = [
      { sequence: 2 },
      { actorUserId: 'user-2' },
      { action: 'UPDATE' },
      { resourceId: 'res-2' },
      { outcome: 'DENIED' },
      { occurredAt: '2026-08-11T00:00:00.001Z' },
      { previousHash: 'f'.repeat(64) },
      { newState: { title: 'Plan B' } },
    ];
    for (const mutation of mutations) {
      assert.notEqual(
        computeAuditHash(hashInput(mutation)),
        base,
        `hash must change for ${JSON.stringify(mutation)}`,
      );
    }
  });

  it('uses 64 zeros as the genesis hash', () => {
    assert.equal(AUDIT_GENESIS_HASH, '0'.repeat(64));
  });
});

function buildChain(length: number): AuditEvent[] {
  const events: AuditEvent[] = [];
  let previousHash = AUDIT_GENESIS_HASH;

  for (let i = 1; i <= length; i++) {
    const occurredAt = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
    const input = hashInput({
      sequence: i,
      action: `ACTION_${i}`,
      resourceId: `res-${i}`,
      occurredAt,
      previousHash,
    });
    const hash = computeAuditHash(input);
    events.push({ ...input, id: `evt-${i}`, hash, previousHash } as unknown as AuditEvent);
    previousHash = hash;
  }
  return events;
}

describe('verifyAuditChain', () => {
  it('accepts a well-formed chain', () => {
    const result = verifyAuditChain(buildChain(10));
    assert.equal(result.valid, true);
    assert.equal(result.checkedCount, 10);
  });

  it('accepts an empty chain', () => {
    assert.equal(verifyAuditChain([]).valid, true);
  });

  it('detects a mutated payload', () => {
    const chain = buildChain(5);
    chain[2].action = 'TAMPERED';
    const result = verifyAuditChain(chain);
    assert.equal(result.valid, false);
    assert.equal(result.brokenAtSequence, 3);
  });

  it('detects a broken link between records', () => {
    const chain = buildChain(5);
    chain[3].previousHash = 'a'.repeat(64);
    assert.equal(verifyAuditChain(chain).valid, false);
  });

  it('detects a deleted record', () => {
    const chain = buildChain(5);
    chain.splice(2, 1);
    assert.equal(verifyAuditChain(chain).valid, false);
  });

  it('detects reordering', () => {
    const chain = buildChain(5);
    [chain[1], chain[2]] = [chain[2], chain[1]];
    assert.equal(verifyAuditChain(chain).valid, false);
  });

  it('rejects a bad genesis', () => {
    const chain = buildChain(3);
    chain[0].previousHash = 'b'.repeat(64);
    assert.equal(verifyAuditChain(chain).valid, false);
  });
});

// --- passwords -------------------------------------------------------------

describe('password hashing', () => {
  it('verifies a correct password', () => {
    const stored = hashPassword('correct horse battery staple');
    assert.equal(verifyPassword('correct horse battery staple', stored), true);
  });

  it('rejects an incorrect password', () => {
    const stored = hashPassword('correct horse battery staple');
    assert.equal(verifyPassword('wrong password entirely', stored), false);
  });

  it('salts: the same password hashes differently every time', () => {
    const a = hashPassword('correct horse battery staple');
    const b = hashPassword('correct horse battery staple');
    assert.notEqual(a, b, 'identical hashes indicate a missing salt');
    assert.equal(verifyPassword('correct horse battery staple', a), true);
    assert.equal(verifyPassword('correct horse battery staple', b), true);
  });

  it('enforces a minimum length', () => {
    assert.throws(() => hashPassword('short'));
  });

  it('never stores the plaintext', () => {
    const secret = 'correct horse battery staple';
    assert.ok(!hashPassword(secret).includes(secret));
  });

  it('returns false rather than throwing on a malformed stored value', () => {
    assert.equal(verifyPassword('whatever', 'not-a-valid-hash'), false);
    assert.equal(verifyPassword('whatever', ''), false);
  });
});

describe('generateToken and sha256', () => {
  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    assert.equal(tokens.size, 100);
  });

  it('hashes deterministically', () => {
    assert.equal(sha256('beyu'), sha256('beyu'));
    assert.notEqual(sha256('beyu'), sha256('beyu '));
  });
});

// --- redaction -------------------------------------------------------------

describe('redactSecrets', () => {
  it('redacts sensitive keys at any depth', () => {
    const input = {
      username: 'ana',
      password: 'hunter2',
      nested: { apiKey: 'sk-live-123', safe: 'ok' },
    };
    const out = redactSecrets(input) as typeof input;
    assert.equal(out.username, 'ana');
    assert.notEqual(out.password, 'hunter2');
    assert.notEqual(out.nested.apiKey, 'sk-live-123');
    assert.equal(out.nested.safe, 'ok');
  });

  it('handles arrays and primitives without throwing', () => {
    assert.deepEqual(redactSecrets([1, 'two']), [1, 'two']);
    assert.equal(redactSecrets(null), null);
    assert.equal(redactSecrets(42), 42);
  });
});

// --- JWT -------------------------------------------------------------------

const SECRET = 'a-sufficiently-long-test-secret-value-0123456789';

describe('JWT', () => {
  const claims = {
    sub: 'user-1',
    iss: 'beyu-os',
    aud: 'beyu-api',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };

  it('round-trips a valid token', () => {
    const result = verifyJwt(signJwt(claims, SECRET), SECRET);
    assert.equal(result.valid, true);
    assert.equal(result.claims?.sub, 'user-1');
  });

  it('rejects a token signed with a different secret', () => {
    const token = signJwt(claims, SECRET);
    assert.equal(verifyJwt(token, 'a-different-secret-of-adequate-length-000').valid, false);
  });

  it('rejects a tampered payload', () => {
    const [header, , signature] = signJwt(claims, SECRET).split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'admin' }))
      .toString('base64url');
    assert.equal(verifyJwt(`${header}.${forged}.${signature}`, SECRET).valid, false);
  });

  it('rejects alg:none', () => {
    // The canonical JWT attack: strip the signature and claim no algorithm.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    assert.equal(verifyJwt(`${header}.${payload}.`, SECRET).valid, false);
  });

  it('rejects an expired token', () => {
    const expired = { ...claims, exp: Math.floor(Date.now() / 1000) - 10 };
    const result = verifyJwt(signJwt(expired, SECRET), SECRET);
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /expire/i);
  });

  it('rejects an audience mismatch when one is required', () => {
    const token = signJwt(claims, SECRET);
    assert.equal(verifyJwt(token, SECRET, 'beyu-api').valid, true);
    assert.equal(verifyJwt(token, SECRET, 'some-other-service').valid, false);
  });

  it('rejects malformed tokens without throwing', () => {
    for (const bad of ['', 'not-a-token', 'a.b', 'a.b.c.d']) {
      assert.equal(verifyJwt(bad, SECRET).valid, false, `${bad} must be rejected`);
    }
  });
});

describe('audit hash — undefined and null must not diverge', () => {
  // Regression: omitting a nullable field hashed it as absent, but the
  // database stored SQL NULL. Verification then recomputed a different hash
  // and reported an untouched record as tampered.
  const base = {
    sequence: 1,
    actorType: 'USER',
    action: 'CREATE',
    resourceType: 'organization',
    outcome: 'SUCCESS',
    occurredAt: '2026-08-11T00:00:00.000Z',
    previousHash: AUDIT_GENESIS_HASH,
  };

  it('hashes an omitted nullable field the same as an explicit null', () => {
    const omitted = computeAuditHash({ ...base } as never);
    const explicit = computeAuditHash({
      ...base,
      actorUserId: null,
      tenantId: null,
      organizationId: null,
      osId: null,
      resourceId: null,
      previousState: null,
      newState: null,
    } as never);
    assert.equal(
      omitted,
      explicit,
      'An omitted nullable field and an explicit null must hash identically, ' +
        'because both are stored as SQL NULL and read back as null.',
    );
  });

  it('still distinguishes a real value from null', () => {
    const withActor = computeAuditHash({ ...base, actorUserId: 'abc' } as never);
    const withoutActor = computeAuditHash({ ...base, actorUserId: null } as never);
    assert.notEqual(withActor, withoutActor);
  });
});
