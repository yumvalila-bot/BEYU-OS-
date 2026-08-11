/**
 * @beyu/events — versioned event bus abstraction (spec §42).
 *
 * The interface is Kafka-shaped. Two drivers are provided:
 *   - InMemoryEventBus: used for local development, tests and CI where no
 *     broker is reachable. Fully functional in-process, NOT durable.
 *   - KafkaEventBus:    STUBBED. Requires kafkajs and a running broker.
 *
 * Consumers must be idempotent: every event carries a stable id.
 */

import { randomUUID, createHash } from 'node:crypto';
import { BeyuEvent, BeyuEventType } from '@beyu/types';

export interface PublishOptions {
  /** Overrides the generated event id, enabling caller-side idempotency. */
  id?: string;
  correlationId?: string | null;
  causationId?: string | null;
}

export type EventHandler = (event: BeyuEvent) => Promise<void> | void;

export interface EventBus {
  publish<T>(
    type: BeyuEventType | string,
    payload: T,
    meta: EventMeta,
    options?: PublishOptions,
  ): Promise<BeyuEvent<T>>;
  subscribe(type: BeyuEventType | string, handler: EventHandler): () => void;
  /** Events published in this process — inspection/testing only. */
  history(): readonly BeyuEvent[];
}

export interface EventMeta {
  source: string;
  tenantId: string | null;
  organizationId: string | null;
  actorUserId: string | null;
  /** Payload contract version, e.g. "1.0". */
  version?: string;
}

/**
 * In-memory event bus. Deterministic and synchronous-ish; handler failures are
 * isolated so one bad consumer cannot break publication.
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly log: BeyuEvent[] = [];
  private readonly seen = new Set<string>();
  private readonly maxHistory: number;

  constructor(maxHistory = 1000) {
    this.maxHistory = maxHistory;
  }

  async publish<T>(
    type: BeyuEventType | string,
    payload: T,
    meta: EventMeta,
    options: PublishOptions = {},
  ): Promise<BeyuEvent<T>> {
    const event: BeyuEvent<T> = {
      id: options.id ?? randomUUID(),
      type,
      version: meta.version ?? '1.0',
      source: meta.source,
      tenantId: meta.tenantId,
      organizationId: meta.organizationId,
      correlationId: options.correlationId ?? null,
      causationId: options.causationId ?? null,
      actorUserId: meta.actorUserId,
      occurredAt: new Date().toISOString(),
      payload,
    };

    // Idempotency: an event id is only ever delivered once.
    if (this.seen.has(event.id)) {
      return event;
    }
    this.seen.add(event.id);

    this.log.push(event as BeyuEvent);
    if (this.log.length > this.maxHistory) this.log.shift();

    const subscribers = [
      ...(this.handlers.get(type) ?? []),
      ...(this.handlers.get('*') ?? []),
    ];
    for (const handler of subscribers) {
      try {
        await handler(event as BeyuEvent);
      } catch (error) {
        // A failing consumer must never break the producer.
        // eslint-disable-next-line no-console
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'event handler failed',
            eventType: type,
            eventId: event.id,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
    return event;
  }

  subscribe(type: BeyuEventType | string, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  history(): readonly BeyuEvent[] {
    return this.log;
  }
}

/**
 * STUBBED — Kafka driver.
 *
 * Not implemented in this build: no Kafka broker is reachable in the current
 * environment. The class documents the intended wiring and throws clearly
 * rather than silently pretending to publish.
 */
export class KafkaEventBus implements EventBus {
  constructor(_brokers: string[], _clientId: string) {
    throw new Error(
      'KafkaEventBus is STUBBED in BEYU OS v1.0. Install kafkajs, provide ' +
        'KAFKA_BROKERS and set EVENT_DRIVER=kafka to enable it. ' +
        'Use InMemoryEventBus for local development.',
    );
  }
  publish<T>(): Promise<BeyuEvent<T>> {
    throw new Error('KafkaEventBus is STUBBED.');
  }
  subscribe(): () => void {
    throw new Error('KafkaEventBus is STUBBED.');
  }
  history(): readonly BeyuEvent[] {
    throw new Error('KafkaEventBus is STUBBED.');
  }
}

export function createEventBus(driver: 'kafka' | 'inmemory', brokers: string[], clientId: string): EventBus {
  if (driver === 'kafka') return new KafkaEventBus(brokers, clientId);
  return new InMemoryEventBus();
}

/** Stable hash of an event payload, used for deduplication keys. */
export function payloadFingerprint(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

/** Deterministic JSON serialization with sorted keys. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}
