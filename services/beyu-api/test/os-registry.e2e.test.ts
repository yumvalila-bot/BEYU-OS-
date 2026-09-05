/**
 * OS federation end-to-end tests (spec §69, §70, §71).
 *
 * These exercise the attachment points that let Health OS, Agriculture OS,
 * Finance OS and FOUNDATION OS attach to BEYU OS independently while sharing
 * its core. The emphasis is on what an attached OS is prevented from doing,
 * because that is the part that has to survive contact with a real integration
 * partner who would rather just have database credentials.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  NEVER_GRANTABLE_CAPABILITIES,
  OrgNodeType,
  OsAttachmentKind,
  OsCapability,
  OsStatus,
  Role,
} from '@beyu/types';

import { boot, HARNESS_PASSWORD, type Harness } from './harness';

let h: Harness;

/** The API's error envelope is `{ error: { message, ... } }`. */
function message(body: any): string {
  return String(body?.error?.message ?? body?.message ?? '');
}

const spine: Record<string, string> = {};

before(async () => {
  h = await boot('osfed');

  const seeded = await h.db.query<{ id: string; node_type: string }>(
    "SELECT id, node_type FROM organization.org_nodes WHERE node_type IN ('TRUST','HOLDING_COMPANY','FOUNDATION')",
  );
  for (const row of seeded.rows) {
    if (row.node_type === 'TRUST') spine.trust = row.id;
    if (row.node_type === 'HOLDING_COMPANY') spine.holding = row.id;
    if (row.node_type === 'FOUNDATION') spine.foundation = row.id;
  }

  const country = await h.auth('POST', '/api/v1/organizations', {
    nodeType: OrgNodeType.CountryHolding,
    name: 'BEYU TANZANIA HOLDING',
    parentId: spine.holding,
    countryCode: 'TZ',
  });
  assert.equal(country.status, 201, JSON.stringify(country.body));
  spine.country = country.body.id;

  const health = await h.auth('POST', '/api/v1/organizations', {
    nodeType: OrgNodeType.SectorLLC,
    name: 'BEYU HEALTH TANZANIA LLC',
    parentId: spine.country,
    sectorCode: 'HEALTH',
  });
  assert.equal(health.status, 201, JSON.stringify(health.body));
  spine.healthLlc = health.body.id;

  const agri = await h.auth('POST', '/api/v1/organizations', {
    nodeType: OrgNodeType.SectorLLC,
    name: 'BEYU AGRICULTURE TANZANIA LLC',
    parentId: spine.country,
    sectorCode: 'AGRICULTURE',
  });
  assert.equal(agri.status, 201, JSON.stringify(agri.body));
  spine.agricultureLlc = agri.body.id;
});

after(async () => {
  await h?.close();
});

describe('OS registration', () => {
  it('registers an OS with no capabilities, no attachment and no events', async () => {
    const res = await h.auth('POST', '/api/v1/os-registry', {
      osId: 'logistics-os',
      name: 'Logistics OS',
      attachmentKind: OsAttachmentKind.SectorOs,
      sectorCode: 'FINANCE',
      apiEndpoint: 'https://logistics.example.com',
      reason: 'Sector OS onboarding',
    });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.osId, 'logistics-os');
    assert.equal(res.body.status, OsStatus.Registered);
    // The isolation default. Registration is an introduction, not a grant.
    assert.deepEqual(res.body.capabilities, []);
    assert.deepEqual(res.body.eventSubscriptions, []);
    assert.equal(res.body.attachedNodeId, null);
  });

  it('refuses to register a second core OS', async () => {
    const res = await h.auth('POST', '/api/v1/os-registry', {
      osId: 'rival-core-os',
      name: 'Rival Core',
      attachmentKind: OsAttachmentKind.Core,
    });

    assert.equal(res.status, 400);
    assert.match(message(res.body), /control plane/i);
  });

  it('refuses a sector OS that does not say which sector it serves', async () => {
    const res = await h.auth('POST', '/api/v1/os-registry', {
      osId: 'vague-os',
      name: 'Vague OS',
      attachmentKind: OsAttachmentKind.SectorOs,
    });

    assert.equal(res.status, 400);
    assert.match(message(res.body), /sectorCode/i);
  });

  it('refuses a FOUNDATION OS that claims a sector', async () => {
    // BEYU FOUNDATION is a sister organization to BEYU HOLDING COMPANY.
    // A sector code would file it under the holding company's sector
    // structure, which is exactly the relationship being denied.
    const res = await h.auth('POST', '/api/v1/os-registry', {
      osId: 'confused-foundation-os',
      name: 'Confused Foundation OS',
      attachmentKind: OsAttachmentKind.FoundationOs,
      sectorCode: 'PHILANTHROPY',
    });

    assert.equal(res.status, 400);
    assert.match(message(res.body), /sister organization/i);
  });

  it('refuses to reuse an existing OS identifier', async () => {
    const res = await h.auth('POST', '/api/v1/os-registry', {
      osId: 'health-os',
      name: 'Impostor Health OS',
      attachmentKind: OsAttachmentKind.SectorOs,
      sectorCode: 'HEALTH',
    });

    assert.equal(res.status, 400);
    assert.match(message(res.body), /already registered/i);
  });
});

describe('attachment legality', () => {
  it('attaches a sector OS to a Sector LLC', async () => {
    const res = await h.auth('POST', '/api/v1/os-registry/health-os/attach', {
      nodeId: spine.healthLlc,
      reason: 'Health sector go-live',
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.attachedNodeId, spine.healthLlc);
  });

  it('refuses to attach a sector OS above the Sector LLC boundary', async () => {
    const res = await h.auth('POST', '/api/v1/os-registry/agriculture-os/attach', {
      nodeId: spine.country,
    });

    assert.equal(res.status, 400);
    assert.match(message(res.body), /Sector LLC boundary/i);
  });

  it('refuses to attach FOUNDATION OS under the holding company', async () => {
    const res = await h.auth('POST', '/api/v1/os-registry/foundation-os/attach', {
      nodeId: spine.holding,
    });

    assert.equal(res.status, 400);
    assert.match(message(res.body), /sister organization/i);
  });

  it('attaches FOUNDATION OS to the Foundation node', async () => {
    const res = await h.auth('POST', '/api/v1/os-registry/foundation-os/attach', {
      nodeId: spine.foundation,
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.attachedNodeId, spine.foundation);
  });

  it('refuses to attach two OSs to the same node', async () => {
    const res = await h.auth('POST', '/api/v1/os-registry/agriculture-os/attach', {
      nodeId: spine.healthLlc,
    });

    assert.equal(res.status, 400);
    assert.match(message(res.body), /already attached/i);
  });

  it('refuses to attach the core OS anywhere', async () => {
    const res = await h.auth('POST', '/api/v1/os-registry/beyu-os/attach', {
      nodeId: spine.trust,
    });

    assert.equal(res.status, 400);
    assert.match(message(res.body), /control plane/i);
  });
});

describe('capability grants', () => {
  it('grants ordinary read capabilities', async () => {
    const res = await h.auth('PATCH', '/api/v1/os-registry/health-os/capabilities', {
      capabilities: [OsCapability.OrganizationRead, OsCapability.ComplianceSubmit],
      reason: 'Health OS needs its own org subtree and compliance reporting',
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(
      [...res.body.capabilities].sort(),
      [OsCapability.ComplianceSubmit, OsCapability.OrganizationRead].sort(),
    );
  });

  // These are deliberately absent from OsCapability: they are things no
  // attached OS may ever be granted, so they are named as literals here
  // exactly as an integration partner would send them.
  for (const forbidden of NEVER_GRANTABLE_CAPABILITIES) {
    it(`permanently refuses to grant ${forbidden}`, async () => {
      const res = await h.auth('PATCH', '/api/v1/os-registry/health-os/capabilities', {
        capabilities: [forbidden],
        reason: 'attempted escalation',
      });

      assert.equal(res.status, 400);
      assert.match(message(res.body), new RegExp(forbidden));
    });
  }

  it('refuses the whole grant when one capability in the set is forbidden', async () => {
    // Partial application would be worse than refusal: the operator would
    // believe the escalation succeeded, or that the read grant failed.
    const res = await h.auth('PATCH', '/api/v1/os-registry/health-os/capabilities', {
      capabilities: [OsCapability.OrganizationRead, 'DATABASE_WRITE'],
    });
    assert.equal(res.status, 400);

    const after = await h.auth('GET', '/api/v1/os-registry/health-os');
    assert.deepEqual(
      [...after.body.capabilities].sort(),
      [OsCapability.ComplianceSubmit, OsCapability.OrganizationRead].sort(),
    );
  });

  it('records each grant in the audit chain with its justification', async () => {
    const audit = await h.auth('GET', '/api/v1/audit?limit=500');
    const entries = audit.body.items as Array<{
      resourceType: string;
      resourceId: string | null;
      reason: string | null;
    }>;

    const grant = entries.find(
      (e) => e.resourceType === 'os' && (e.reason ?? '').includes('compliance reporting'),
    );
    assert.ok(grant, 'the capability grant should be in the audit chain');
    assert.equal(grant.resourceId, 'health-os');

    const verify = await h.auth('GET', '/api/v1/audit/verify');
    assert.equal(verify.body.valid, true);
  });
});

describe('OS lifecycle', () => {
  it('refuses to activate an OS that skipped security validation', async () => {
    const res = await h.auth('PATCH', '/api/v1/os-registry/health-os/status', {
      status: OsStatus.Active,
    });

    assert.equal(res.status, 409);
    assert.match(message(res.body), /SECURITY_VALIDATION/i);
  });

  it('activates an OS that went through security validation', async () => {
    const endpoint = await h.db.query(
      "UPDATE organization.os_registry SET api_endpoint = 'https://health.example.com' WHERE os_id = 'health-os'",
    );
    assert.ok(endpoint);

    const configuring = await h.auth('PATCH', '/api/v1/os-registry/health-os/status', {
      status: OsStatus.Configuring,
    });
    assert.equal(configuring.status, 200, JSON.stringify(configuring.body));

    const validating = await h.auth('PATCH', '/api/v1/os-registry/health-os/status', {
      status: OsStatus.SecurityValidation,
    });
    assert.equal(validating.status, 200, JSON.stringify(validating.body));

    const active = await h.auth('PATCH', '/api/v1/os-registry/health-os/status', {
      status: OsStatus.Active,
      reason: 'Security review passed',
    });
    assert.equal(active.status, 200, JSON.stringify(active.body));
    assert.equal(active.body.status, OsStatus.Active);
  });

  it('refuses to activate an OS that is attached nowhere', async () => {
    await h.auth('PATCH', '/api/v1/os-registry/logistics-os/status', {
      status: OsStatus.Configuring,
    });
    await h.auth('PATCH', '/api/v1/os-registry/logistics-os/status', {
      status: OsStatus.SecurityValidation,
    });

    const res = await h.auth('PATCH', '/api/v1/os-registry/logistics-os/status', {
      status: OsStatus.Active,
    });

    assert.equal(res.status, 400);
    assert.match(message(res.body), /attached/i);
  });

  it('treats RETIRED as terminal', async () => {
    const registered = await h.auth('POST', '/api/v1/os-registry', {
      osId: 'legacy-os',
      name: 'Legacy OS',
      attachmentKind: OsAttachmentKind.SectorOs,
      sectorCode: 'PHILANTHROPY',
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));

    const retired = await h.auth('PATCH', '/api/v1/os-registry/legacy-os/status', {
      status: OsStatus.Retired,
      reason: 'Decommissioned',
    });
    assert.equal(retired.status, 200, JSON.stringify(retired.body));

    const revived = await h.auth('PATCH', '/api/v1/os-registry/legacy-os/status', {
      status: OsStatus.Registered,
    });
    assert.equal(revived.status, 409);
    assert.match(message(revived.body), /terminal/i);
  });
});

describe('event grants', () => {
  it('grants a control plane topic and lists it', async () => {
    const granted = await h.auth('POST', '/api/v1/os-registry/health-os/event-grants', {
      topic: 'beyu.capital.allocated',
      reason: 'Health OS plans against allocations',
    });
    assert.equal(granted.status, 201, JSON.stringify(granted.body));

    const listed = await h.auth('GET', '/api/v1/os-registry/health-os/event-grants');
    assert.deepEqual(listed.body.topics, ['beyu.capital.allocated']);
  });

  it('refuses to subscribe an OS to inbound os.* topics', async () => {
    // "os.*" is what attached systems send inward. Letting one subscribe to it
    // would turn the control plane into a bus between sector OSs.
    const res = await h.auth('POST', '/api/v1/os-registry/health-os/event-grants', {
      topic: 'os.capital.requested',
    });

    assert.equal(res.status, 400);
  });

  it('does not leak another OS\'s grants', async () => {
    const listed = await h.auth('GET', '/api/v1/os-registry/agriculture-os/event-grants');
    assert.deepEqual(listed.body.topics, []);
  });

  it('delivers a topic only to OSs that were granted it and are ACTIVE', async () => {
    const active = await h.db.query<{ os_id: string }>(
      `SELECT g.os_id FROM integrations.os_event_grants g
         JOIN organization.os_registry r ON r.os_id = g.os_id
        WHERE g.topic = 'beyu.capital.allocated' AND r.status = 'ACTIVE'`,
    );
    assert.deepEqual(
      active.rows.map((r) => r.os_id),
      ['health-os'],
    );
  });
});

describe('isolation between attached OSs', () => {
  it('keeps each OS on its own attachment point and capability set', async () => {
    const attached = await h.auth('POST', '/api/v1/os-registry/agriculture-os/attach', {
      nodeId: spine.agricultureLlc,
    });
    assert.equal(attached.status, 200, JSON.stringify(attached.body));

    const granted = await h.auth('PATCH', '/api/v1/os-registry/agriculture-os/capabilities', {
      capabilities: [OsCapability.OrganizationRead],
    });
    assert.equal(granted.status, 200, JSON.stringify(granted.body));

    const health = await h.auth('GET', '/api/v1/os-registry/health-os');
    const agri = await h.auth('GET', '/api/v1/os-registry/agriculture-os');

    assert.notEqual(health.body.attachedNodeId, agri.body.attachedNodeId);
    // Health OS was granted compliance reporting; Agriculture OS was not.
    // Neither inherits from the other: sharing the core grants nothing.
    assert.ok(health.body.capabilities.includes(OsCapability.ComplianceSubmit));
    assert.ok(!agri.body.capabilities.includes(OsCapability.ComplianceSubmit));
  });

  it('lists the core OS first and never marks an attached OS as core', async () => {
    const res = await h.auth('GET', '/api/v1/os-registry?limit=50');
    const items = res.body.items as Array<{ osId: string; isCore: boolean }>;

    assert.equal(items[0]!.osId, 'beyu-os');
    assert.equal(items.filter((o) => o.isCore).length, 1);
  });

  it('requires authentication', async () => {
    const res = await h.request('GET', '/api/v1/os-registry');
    assert.equal(res.status, 401);
  });

  it('refuses an authenticated caller without OS permissions', async () => {
    const email = 'osfed-viewer@beyu.example';
    await h.createUser(email, HARNESS_PASSWORD, [Role.ReadOnly]);
    const token = await h.loginAs(email, HARNESS_PASSWORD);

    const res = await h.request(
      'POST',
      '/api/v1/os-registry',
      {
        osId: 'sneaky-os',
        name: 'Sneaky OS',
        attachmentKind: OsAttachmentKind.SectorOs,
        sectorCode: 'HEALTH',
      },
      { authorization: `Bearer ${token}` },
    );

    assert.equal(res.status, 403);
  });
});
