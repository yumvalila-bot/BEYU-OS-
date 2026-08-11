/**
 * Event bus tests (spec §42).
 *
 * The contract that matters for cross-OS integration: events are idempotent by
 * id, a failing consumer can never break the producer, and the Kafka driver
 * fails loudly rather than silently dropping messages.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BeyuEventType } from '@beyu/types';

import {
  createEventBus,
  InMemoryEventBus,
  KafkaEventBus,
  payloadFingerprint,
  stableStringify,
  type EventMeta,
} from './index';

const meta: EventMeta = {
  source: 'beyu-api',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  actorUserId: 'user-1',
};

describe('InMemoryEventBus — publish and subscribe', () => {
  it('delivers an event to a subscriber', async () => {
    const bus = new InMemoryEventBus();
    const received: unknown[] = [];
    bus.subscribe(BeyuEventType.OrganizationCreated, (e) => {
      received.push(e.payload);
    });

    await bus.publish(BeyuEventType.OrganizationCreated, { id: 'org-2' }, meta);
    assert.deepEqual(received, [{ id: 'org-2' }]);
  });

  it('delivers to wildcard subscribers', async () => {
    const bus = new InMemoryEventBus();
    let count = 0;
    bus.subscribe('*', () => {
      count++;
    });

    await bus.publish(BeyuEventType.OrganizationCreated, {}, meta);
    await bus.publish(BeyuEventType.WaterfallCalculated, {}, meta);
    assert.equal(count, 2);
  });

  it('does not deliver to unrelated topics', async () => {
    const bus = new InMemoryEventBus();
    let count = 0;
    bus.subscribe(BeyuEventType.WaterfallCalculated, () => {
      count++;
    });

    await bus.publish(BeyuEventType.OrganizationCreated, {}, meta);
    assert.equal(count, 0);
  });

  it('stops delivering after unsubscribe', async () => {
    const bus = new InMemoryEventBus();
    let count = 0;
    const off = bus.subscribe(BeyuEventType.OrganizationCreated, () => {
      count++;
    });

    await bus.publish(BeyuEventType.OrganizationCreated, {}, meta);
    off();
    await bus.publish(BeyuEventType.OrganizationCreated, {}, meta);
    assert.equal(count, 1);
  });

  it('stamps envelope metadata on every event', async () => {
    const bus = new InMemoryEventBus();
    const event = await bus.publish(BeyuEventType.OrganizationCreated, { x: 1 }, meta);

    assert.ok(event.id);
    assert.equal(event.type, BeyuEventType.OrganizationCreated);
    assert.equal(event.version, '1.0');
    assert.equal(event.source, 'beyu-api');
    assert.equal(event.tenantId, 'tenant-1');
    assert.equal(event.actorUserId, 'user-1');
    assert.match(event.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('carries correlation and causation ids for tracing', async () => {
    const bus = new InMemoryEventBus();
    const event = await bus.publish(BeyuEventType.OrganizationCreated, {}, meta, {
      correlationId: 'corr-1',
      causationId: 'cause-1',
    });
    assert.equal(event.correlationId, 'corr-1');
    assert.equal(event.causationId, 'cause-1');
  });
});

describe('InMemoryEventBus — idempotency', () => {
  it('delivers a given event id only once', async () => {
    const bus = new InMemoryEventBus();
    let count = 0;
    bus.subscribe(BeyuEventType.OrganizationCreated, () => {
      count++;
    });

    await bus.publish(BeyuEventType.OrganizationCreated, { v: 1 }, meta, { id: 'fixed-id' });
    await bus.publish(BeyuEventType.OrganizationCreated, { v: 1 }, meta, { id: 'fixed-id' });

    assert.equal(count, 1, 'a redelivered event id must not be processed twice');
    assert.equal(bus.history().length, 1);
  });

  it('generates unique ids when none is supplied', async () => {
    const bus = new InMemoryEventBus();
    const a = await bus.publish(BeyuEventType.OrganizationCreated, {}, meta);
    const b = await bus.publish(BeyuEventType.OrganizationCreated, {}, meta);
    assert.notEqual(a.id, b.id);
  });
});

describe('InMemoryEventBus — consumer isolation', () => {
  it('a throwing handler does not break publication or other handlers', async () => {
    const bus = new InMemoryEventBus();
    const order: string[] = [];

    bus.subscribe(BeyuEventType.OrganizationCreated, () => {
      throw new Error('consumer exploded');
    });
    bus.subscribe(BeyuEventType.OrganizationCreated, () => {
      order.push('second handler still ran');
    });

    const originalError = console.error;
    console.error = () => {}; // silence the expected structured error log
    try {
      await assert.doesNotReject(() =>
        bus.publish(BeyuEventType.OrganizationCreated, {}, meta),
      );
    } finally {
      console.error = originalError;
    }

    assert.deepEqual(order, ['second handler still ran']);
    assert.equal(bus.history().length, 1);
  });

  it('awaits async handlers before resolving', async () => {
    const bus = new InMemoryEventBus();
    let done = false;
    bus.subscribe(BeyuEventType.OrganizationCreated, async () => {
      await new Promise((r) => setTimeout(r, 5));
      done = true;
    });

    await bus.publish(BeyuEventType.OrganizationCreated, {}, meta);
    assert.equal(done, true);
  });
});

describe('InMemoryEventBus — history', () => {
  it('caps history at maxHistory, dropping the oldest', async () => {
    const bus = new InMemoryEventBus(3);
    for (let i = 0; i < 5; i++) {
      await bus.publish(BeyuEventType.OrganizationCreated, { i }, meta);
    }
    const history = bus.history();
    assert.equal(history.length, 3);
    assert.deepEqual(history[0].payload, { i: 2 });
  });
});

describe('KafkaEventBus is honestly stubbed', () => {
  it('throws on construction rather than silently dropping events', () => {
    assert.throws(() => new KafkaEventBus(['localhost:9092'], 'beyu'), /STUBBED/);
  });

  it('createEventBus returns a working in-memory bus by default', () => {
    assert.ok(createEventBus('inmemory', [], 'beyu') instanceof InMemoryEventBus);
    assert.throws(() => createEventBus('kafka', ['localhost:9092'], 'beyu'), /STUBBED/);
  });
});

describe('stableStringify and payloadFingerprint', () => {
  it('is key-order independent', () => {
    assert.equal(stableStringify({ a: 1, b: 2 }), stableStringify({ b: 2, a: 1 }));
    assert.equal(payloadFingerprint({ a: 1, b: 2 }), payloadFingerprint({ b: 2, a: 1 }));
  });

  it('drops undefined values but keeps null', () => {
    assert.equal(stableStringify({ a: 1, b: undefined }), '{"a":1}');
    assert.equal(stableStringify({ a: null }), '{"a":null}');
  });

  it('preserves array order', () => {
    assert.notEqual(payloadFingerprint([1, 2]), payloadFingerprint([2, 1]));
  });

  it('produces a 64-character hex fingerprint', () => {
    assert.match(payloadFingerprint({ any: 'thing' }), /^[0-9a-f]{64}$/);
  });

  it('handles nested structures deterministically', () => {
    const a = { outer: { z: [1, { b: 2, a: 1 }], y: 'x' } };
    const b = { outer: { y: 'x', z: [1, { a: 1, b: 2 }] } };
    assert.equal(payloadFingerprint(a), payloadFingerprint(b));
  });
});
