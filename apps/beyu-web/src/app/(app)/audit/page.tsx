import type { Metadata } from 'next';

import { Badge, DataTable, EmptyState, ErrorNotice, PageHeader, Panel } from '@/components/primitives';
import { tryApi } from '@/lib/api';
import type { AuditEventView, ChainVerification, Paged } from '@/lib/contracts';
import { absoluteTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Audit' };
export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const [trail, chain] = await Promise.all([
    tryApi<Paged<AuditEventView>>('/audit?limit=100&order=desc'),
    tryApi<ChainVerification>('/audit/verify'),
  ]);

  return (
    <div>
      <PageHeader
        title="Audit"
        description="Append-only record of every action taken in BEYU OS. Entries cannot be edited or deleted by anyone, including the trust administrator — the database grants no UPDATE or DELETE on this table at all."
      />

      <div className="mb-4">
        <Panel title="Chain integrity">
          {chain.ok ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={chain.data.valid ? 'positive' : 'critical'}>
                {chain.data.valid ? 'Verified' : `Broken at #${chain.data.brokenAtSequence}`}
              </Badge>
              <p className="text-sm text-ink-muted">
                {chain.data.valid
                  ? `${chain.data.checkedCount} records recomputed; each hash matches its contents and links to the record before it.`
                  : (chain.data.reason ?? 'A record does not match its stored hash.')}
              </p>
            </div>
          ) : (
            <ErrorNotice error={chain.error} what="chain verification" />
          )}
        </Panel>
      </div>

      <Panel title="Trail" description="Most recent 100 entries, newest first">
        {!trail.ok ? (
          <ErrorNotice error={trail.error} what="the audit trail" />
        ) : trail.data.items.length === 0 ? (
          <EmptyState message="No audit records yet." />
        ) : (
          <DataTable
            columns={['#', 'When', 'Actor', 'Action', 'Resource', 'Outcome', 'Reason']}
            rows={trail.data.items.map((event) => [
                <span key="s" className="font-mono text-xs text-ink-subtle">{event.sequence}</span>,
                <span key="w" className="whitespace-nowrap font-mono text-xs text-ink-muted">
                  {absoluteTime(event.occurredAt)}
                </span>,
                <span key="a" className="text-ink-muted">
                  {event.actorType === 'USER'
                    ? (event.actorUserId?.slice(0, 8) ?? 'unknown')
                    : event.actorType}
                </span>,
                <span key="ac" className="font-medium">{event.action}</span>,
                <span key="r" className="text-ink-muted">
                  {event.resourceType}
                  {event.resourceId ? (
                    <span className="text-ink-subtle"> · {event.resourceId.slice(0, 12)}</span>
                  ) : null}
                </span>,
                <Badge key="o" tone={event.outcome === 'SUCCESS' ? 'positive' : 'critical'}>
                  {event.outcome}
                </Badge>,
                <span key="rs" className="text-ink-subtle">{event.reason ?? '—'}</span>,
              ])}
          />
        )}
      </Panel>
    </div>
  );
}
