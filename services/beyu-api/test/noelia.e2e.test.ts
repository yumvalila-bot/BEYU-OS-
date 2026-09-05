/**
 * Noelia end-to-end tests (spec §41, §54-§60).
 *
 * The emphasis is deliberately lopsided. There are a handful of tests that
 * Noelia answers questions, and a great many that it cannot do anything else,
 * because the second set is what the design is actually for. An AI layer that
 * answers well but can be talked into executing a capital movement is a
 * liability; one that refuses cleanly is the product.
 *
 * Every governance assertion is made against a TRUST ADMINISTRATOR — the most
 * privileged role in the system. If the downgrade holds for a principal who
 * could legitimately make the change by hand, it holds for everyone.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { Role } from '@beyu/types';

import { boot, HARNESS_PASSWORD, type Harness } from './harness';

let h: Harness;

/** The API's error envelope is `{ error: { message, ... } }`. */
function message(body: any): string {
  return String(body?.error?.message ?? body?.message ?? '');
}

before(async () => {
  h = await boot('noelia');
});

after(async () => {
  await h.close();
});

describe('Noelia — agents', () => {
  it('registers read-only agents whose ceiling stops below sector-sensitive', async () => {
    const res = await h.auth('GET', '/api/v1/noelia/agents');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.length >= 1, 'at least one Noelia agent must be seeded');

    for (const agent of res.body) {
      assert.equal(agent.system, 'NOELIA');

      // Every scope is a read scope. There is no write scope to grant.
      for (const scope of agent.allowedScopes) {
        assert.ok(
          scope.endsWith(':read'),
          `agent ${agent.code} holds non-read scope "${scope}"`,
        );
      }

      // Sector-sensitive data belongs to the sector OS and never reaches the
      // control plane's AI layer.
      assert.notEqual(agent.maxClassification, 'SECTOR_SENSITIVE');
      assert.notEqual(agent.maxClassification, 'RESTRICTED');
    }
  });

  it('refuses at the database level to raise an agent to sector-sensitive', async () => {
    await assert.rejects(
      () =>
        h.db.query(
          "UPDATE ai.agents SET max_classification = 'SECTOR_SENSITIVE' WHERE system = 'NOELIA'",
        ),
      /ai_never_sector_sensitive|violates check constraint/i,
      'the classification ceiling must be enforced by the database, not only by code',
    );
  });
});

describe('Noelia — asking is a read', () => {
  it('answers from control-plane records and cites what it used', async () => {
    const res = await h.auth('POST', '/api/v1/noelia/ask', {
      question: 'What operating systems are registered?',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    assert.equal(res.body.answer.role, 'ASSISTANT');
    assert.ok(res.body.citations.length > 0, 'a grounded answer must cite its sources');
    assert.equal(res.body.ungrounded, false);

    // Provenance is explicit. Nothing in this deployment should be presented
    // as model analysis when it is deterministic retrieval.
    assert.equal(res.body.model, 'stub-deterministic');

    const cited = res.body.citations.map((c: any) => c.ref);
    assert.ok(
      cited.some((ref: string) => ref.startsWith('os:')),
      `expected an os-registry citation, got ${JSON.stringify(cited)}`,
    );
  });

  it('says it does not know rather than inventing an answer', async () => {
    const res = await h.auth('POST', '/api/v1/noelia/ask', {
      question: 'What were the quarterly distribution percentages paid to each beneficiary?',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    assert.equal(res.body.ungrounded, true, 'no records support this; it must not answer');
    assert.deepEqual(res.body.citations, []);
    assert.match(res.body.answer.content, /cannot answer|allowed to see/i);

    // The specific failure this guards: a fluent model inventing a percentage.
    // Waterfall and ownership percentages are never hard-coded and never
    // guessed (spec §12, §31).
    assert.doesNotMatch(res.body.answer.content, /\d+(\.\d+)?\s*%/);
  });

  it('keeps a conversation, and will not open somebody else\u2019s', async () => {
    const first = await h.auth('POST', '/api/v1/noelia/ask', {
      question: 'Describe the organizational hierarchy.',
    });
    const conversationId = first.body.conversationId;

    const second = await h.auth('POST', '/api/v1/noelia/ask', {
      question: 'And which of those is the core operating system?',
      conversationId,
    });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.equal(second.body.conversationId, conversationId);

    const transcript = await h.auth(
      'GET',
      `/api/v1/noelia/conversations/${conversationId}/messages`,
    );
    assert.equal(transcript.status, 200);
    assert.equal(transcript.body.length, 4, 'two questions and two answers');

    // A second principal must not be able to read it. Reported as absent, not
    // forbidden: "that exists but is not yours" is itself a disclosure.
    await h.createUser('noelia-other@beyu.example', HARNESS_PASSWORD, [Role.TrustAdministrator]);
    const otherToken = await h.loginAs('noelia-other@beyu.example', HARNESS_PASSWORD);
    const stolen = await h.request(
      'GET',
      `/api/v1/noelia/conversations/${conversationId}/messages`,
      undefined,
      { authorization: `Bearer ${otherToken}` },
    );
    assert.equal(stolen.status, 404, JSON.stringify(stolen.body));
    assert.doesNotMatch(message(stolen.body), /forbidden|not yours|belongs to/i);
  });

  it('requires authentication like every other endpoint', async () => {
    const res = await h.request('POST', '/api/v1/noelia/ask', { question: 'Anything at all?' });
    assert.equal(res.status, 401);
  });
});

describe('Noelia — recommendation is not execution (spec §57)', () => {
  it('downgrades a material mutation to a recommendation, even for a trust administrator', async () => {
    const res = await h.auth('POST', '/api/v1/noelia/recommendations', {
      category: 'CAPITAL',
      title: 'Rebalance the capital allocation toward the health sector',
      rationale:
        'Health sector entities show the highest utilisation of allocated capital across the estate.',
      proposedAction: { kind: 'REALLOCATE', fromSector: 'AGRICULTURE', toSector: 'HEALTH' },
      confidenceBps: 7200,
      impact: 'HIGH',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    // THE central assertion of this module.
    assert.equal(res.body.verdict, 'REQUIRES_HUMAN_APPROVAL');
    assert.equal(res.body.downgradedToRecommendation, true);
    assert.equal(res.body.recommendation.status, 'PENDING_REVIEW');
    assert.equal(res.body.recommendation.reviewedBy, null);

    // The reviewer competence is frozen at production time, so a later change
    // to role definitions cannot retroactively alter who was said to be
    // competent to sign this off.
    assert.ok(
      res.body.approverRolesRequired.includes('TRUST_ADMINISTRATOR'),
      JSON.stringify(res.body.approverRolesRequired),
    );
    assert.deepEqual(res.body.recommendation.approverRoles, res.body.approverRolesRequired);
  });

  it('denies outright what AI may never do, and queues nothing', async () => {
    const before = await h.db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM ai.recommendations",
    );

    const res = await h.auth('POST', '/api/v1/noelia/recommendations', {
      category: 'WATERFALL',
      title: 'Execute the pending distribution run',
      rationale: 'The distribution period has closed and the run is ready to execute.',
      proposedAction: { kind: 'EXECUTE_DISTRIBUTION' },
      action: 'execute',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    assert.equal(res.body.verdict, 'DENIED');
    assert.equal(res.body.recommendation, null);
    assert.match(res.body.reason, /never perform|reserved for human/i);

    // Nothing was queued. A denied action left sitting in a review queue is an
    // invitation for somebody to approve it.
    const after = await h.db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM ai.recommendations",
    );
    assert.equal(after.rows[0]!.count, before.rows[0]!.count);
  });

  it('records the denial in the AI action log', async () => {
    const res = await h.auth('GET', '/api/v1/noelia/action-log');
    assert.equal(res.status, 200);

    const denied = res.body.items.find((e: any) => e.decision === 'DENIED');
    assert.ok(denied, 'refusals must be recorded, not only successes');
    assert.equal(denied.action, 'execute');
    assert.ok(denied.onBehalfOf, 'AI never acts unattributed');
    assert.equal(denied.onBehalfOf, h.userId);

    const downgraded = res.body.items.find((e: any) => e.downgradedToRecommendation === true);
    assert.ok(downgraded, 'the downgrade itself must be visible in the log');
  });

  it('will not let the action log claim the AI performed a mutation', async () => {
    // Defence in depth: if governAiAction were ever changed to permit a write,
    // this CHECK aborts the transaction that tries to record it.
    const agent = await h.db.query<{ id: string }>(
      "SELECT id FROM ai.agents WHERE system = 'NOELIA' LIMIT 1",
    );
    await assert.rejects(
      () =>
        h.db.query(
          `INSERT INTO ai.action_log
             (agent_id, on_behalf_of, action, resource_type, decision, reason)
           VALUES ($1, $2, 'update', 'capital', 'PERMITTED', 'should be impossible')`,
          [agent.rows[0]!.id, h.userId],
        ),
      /ai_permitted_actions_are_reads_only|violates check constraint/i,
    );
  });

  it('rejects a "recommendation" that is really just a read', async () => {
    const res = await h.auth('POST', '/api/v1/noelia/recommendations', {
      category: 'STRATEGY',
      title: 'Review the strategic objectives',
      rationale: 'A periodic read of the current strategic objective set.',
      proposedAction: { kind: 'READ' },
      action: 'read',
    });

    // The DTO's action allowlist catches this at the edge, before the request
    // reaches the repository. The repository keeps its own guard anyway, for
    // callers that arrive from inside the process rather than over HTTP.
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(message(res.body), /action must be one of|not a proposal/i);
    assert.doesNotMatch(message(res.body), /\bread\b/, 'read must not be an accepted proposal action');
  });
});

describe('Noelia — human approval is named, competent and final', () => {
  let pendingId: string;

  before(async () => {
    const created = await h.auth('POST', '/api/v1/noelia/recommendations', {
      category: 'ORGANIZATION',
      title: 'Mark the dormant country holding as inactive',
      rationale: 'No governance or capital activity has been recorded against it.',
      proposedAction: { kind: 'SET_STATUS', status: 'DORMANT' },
      impact: 'LOW',
    });
    assert.equal(created.body.verdict, 'REQUIRES_HUMAN_APPROVAL');
    pendingId = created.body.recommendation.id;
  });

  it('refuses acceptance from a principal who lacks the named approver role', async () => {
    await h.createUser('noelia-readonly@beyu.example', HARNESS_PASSWORD, [Role.ReadOnly]);
    const token = await h.loginAs('noelia-readonly@beyu.example', HARNESS_PASSWORD);

    const res = await h.request(
      'POST',
      `/api/v1/noelia/recommendations/${pendingId}/review`,
      { decision: 'ACCEPTED' },
      { authorization: `Bearer ${token}` },
    );
    // Either the guard refuses the approve permission outright, or the
    // repository refuses the role. Both are correct; neither may succeed.
    assert.ok(res.status === 403 || res.status === 400, `got ${res.status}`);
  });

  it('records acceptance against a named human at a recorded time', async () => {
    const res = await h.auth('POST', `/api/v1/noelia/recommendations/${pendingId}/review`, {
      decision: 'ACCEPTED',
      notes: 'Agreed. I will make the change through the organization endpoint.',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    assert.equal(res.body.status, 'ACCEPTED');
    assert.equal(res.body.reviewedBy, h.userId);
    assert.ok(res.body.reviewedAt, 'the time of the decision is part of the record');
    assert.ok(res.body.reviewedByName, 'the reviewer is named, not just an id');

    // Acceptance returns the proposed action so the human has to go and enact
    // it deliberately. It does not enact it.
    assert.deepEqual(res.body.proposedAction, { kind: 'SET_STATUS', status: 'DORMANT' });
  });

  it('audits the approval as an approval, explicitly not as an execution', async () => {
    const rows = await h.db.query<Record<string, any>>(
      `SELECT action, resource_type, new_state, reason
         FROM audit.audit_log
        WHERE resource_type = 'noelia' AND action = 'APPROVE'
        ORDER BY sequence DESC LIMIT 1`,
    );
    const entry = rows.rows[0];
    assert.ok(entry, 'the approval must be in the audit chain');

    const state =
      typeof entry.new_state === 'string' ? JSON.parse(entry.new_state) : entry.new_state;
    assert.equal(state.status, 'ACCEPTED');
    assert.equal(state.executed, false, 'approval is never recorded as execution');
  });

  it('never reopens a decided recommendation', async () => {
    const res = await h.auth('POST', `/api/v1/noelia/recommendations/${pendingId}/review`, {
      decision: 'REJECTED',
      notes: 'Changed my mind.',
    });
    assert.equal(res.status, 400);
    assert.match(message(res.body), /already been decided|supersede/i);
  });

  it('refuses at the database level to reverse a review or reassign the reviewer', async () => {
    await assert.rejects(
      () =>
        h.db.query("UPDATE ai.recommendations SET status = 'PENDING_REVIEW' WHERE id = $1", [
          pendingId,
        ]),
      /cannot be reopened/i,
      'the finality of a human decision must not depend on application code',
    );

    await assert.rejects(
      () =>
        h.db.query('UPDATE ai.recommendations SET reviewed_by = NULL WHERE id = $1', [pendingId]),
      /cannot be reassigned|ai_review_is_complete|violates check constraint/i,
    );
  });

  it('refuses at the database level to accept without a named reviewer', async () => {
    const agent = await h.db.query<{ id: string }>(
      "SELECT id FROM ai.agents WHERE system = 'NOELIA' LIMIT 1",
    );
    await assert.rejects(
      () =>
        h.db.query(
          `INSERT INTO ai.recommendations
             (agent_id, category, title, rationale, proposed_action, status)
           VALUES ($1, 'CAPITAL', 'Self-approved', 'No human involved.', '{}'::jsonb, 'ACCEPTED')`,
          [agent.rows[0]!.id],
        ),
      /ai_acceptance_requires_human|violates check constraint/i,
    );
  });
});

describe('Noelia — data minimization (spec §59)', () => {
  it('does not leak fields outside the allowlist into the grounding facts', async () => {
    // legal_name and registration_number exist on org_nodes and are absent
    // from ORG_FIELDS, so they must never reach a prompt or a citation.
    await h.auth('POST', '/api/v1/noelia/ask', {
      question: 'List the organizational nodes and their status.',
    });

    const messages = await h.db.query<{ content: string; context_refs: unknown }>(
      "SELECT content, context_refs FROM ai.messages WHERE role = 'ASSISTANT'",
    );
    assert.ok(messages.rows.length > 0);

    for (const row of messages.rows) {
      assert.doesNotMatch(row.content, /registration_number|legal_name/i);
    }
  });

  it('cites by opaque reference, never by dumping the record', async () => {
    const res = await h.auth('POST', '/api/v1/noelia/ask', {
      question: 'Which operating system is the core control plane?',
    });
    for (const citation of res.body.citations) {
      assert.match(citation.ref, /^(organization|os|audit):/);
      assert.deepEqual(
        Object.keys(citation).sort(),
        ['detail', 'label', 'ref', 'source'],
        'a citation carries only what a human needs to go and look it up',
      );
    }
  });
});
