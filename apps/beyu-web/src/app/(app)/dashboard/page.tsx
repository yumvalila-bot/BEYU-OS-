import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, DataTable, ErrorNotice, PageHeader, Panel } from '@/components/primitives';
import { tryApi } from '@/lib/api';
import type {
  AuditEventView,
  ChainVerification,
  MeResponse,
  OrganizationNode,
  OsRegistrationView,
  Paged,
} from '@/lib/contracts';
import { osStatusTone, relativeTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // Fetched together; a failure in one panel does not blank the others.
  const [me, orgs, osList, audit, chain] = await Promise.all([
    tryApi<MeResponse>('/auth/me'),
    tryApi<Paged<OrganizationNode>>('/organizations?limit=200'),
    tryApi<Paged<OsRegistrationView>>('/os-registry'),
    tryApi<Paged<AuditEventView>>('/audit?limit=8&order=desc'),
    tryApi<ChainVerification>('/audit/verify'),
  ]);

  const nodes = orgs.ok ? orgs.data.items : [];
  const systems = osList.ok ? osList.data.items : [];

  const countBy = (nodeType: string) => nodes.filter((n) => n.type === nodeType).length;

  return (
    <div>
      <PageHeader
        title={me.ok ? `Welcome, ${me.data.displayName.split(' ')[0]}` : 'Dashboard'}
        description="Live state of the BEYU FAMILY TRUST control plane. Every figure below is read from the API; nothing on this page is sample data."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Organization nodes" value={orgs.ok ? String(nodes.length) : '—'} hint="Trust to Sector LLC" />
        <Stat label="Country holdings" value={orgs.ok ? String(countBy('COUNTRY_HOLDING')) : '—'} hint="Jurisdictions in structure" />
        <Stat label="Sector LLCs" value={orgs.ok ? String(countBy('SECTOR_LLC')) : '—'} hint="Where BEYU OS stops" />
        <Stat
          label="Attached systems"
          value={osList.ok ? String(systems.filter((o) => o.attachmentKind !== 'CORE').length) : '—'}
          hint="Sector and foundation OSs"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Audit chain"
          description="Append-only, hash-linked"
          className="lg:col-span-1"
        >
          {chain.ok ? (
            <div>
              <Badge tone={chain.data.valid ? 'positive' : 'critical'}>
                {chain.data.valid ? 'Chain verified' : 'Chain broken'}
              </Badge>
              <p className="mt-3 text-sm text-ink-muted">
                {chain.data.valid
                  ? 'Every record recomputes to its stored hash and links to its predecessor. No record has been altered or removed.'
                  : 'A record does not match its stored hash. This is a tamper indication and should be investigated immediately.'}
              </p>
            </div>
          ) : (
            <ErrorNotice error={chain.error} what="the audit chain status" />
          )}
        </Panel>

        <Panel
          title="Attached operating systems"
          description="Federation seam"
          className="lg:col-span-2"
          actions={
            <Link href="/integrations" className="text-sm font-medium text-accent hover:underline">
              Manage →
            </Link>
          }
        >
          {osList.ok ? (
            <DataTable
              columns={['System', 'Kind', 'Status', 'Capabilities']}
              rows={systems.map((os) => [
                <span key="n" className="font-medium">{os.name}</span>,
                <span key="k" className="text-ink-muted">{os.attachmentKind.replace(/_/g, ' ')}</span>,
                <Badge key="s" tone={osStatusTone(os.status)}>{os.status.replace(/_/g, ' ')}</Badge>,
                <span key="c" className="text-ink-muted">
                  {os.capabilities.length === 0 ? 'none granted' : os.capabilities.length}
                </span>,
              ])}
            />
          ) : (
            <ErrorNotice error={osList.error} what="the OS registry" />
          )}
        </Panel>

        <Panel
          title="Recent activity"
          description="Most recent entries in the audit trail"
          className="lg:col-span-3"
          actions={
            <Link href="/audit" className="text-sm font-medium text-accent hover:underline">
              Full trail →
            </Link>
          }
        >
          {audit.ok ? (
            <DataTable
              columns={['#', 'Action', 'Resource', 'Outcome', 'When']}
              rows={audit.data.items.map((event) => [
                <span key="s" className="font-mono text-xs text-ink-subtle">{event.sequence}</span>,
                <span key="a" className="font-medium">{event.action}</span>,
                <span key="r" className="text-ink-muted">
                  {event.resourceType}
                  {event.resourceId ? ` · ${event.resourceId.slice(0, 8)}` : ''}
                </span>,
                <Badge key="o" tone={event.outcome === 'SUCCESS' ? 'positive' : 'critical'}>
                  {event.outcome}
                </Badge>,
                <span key="w" className="text-ink-subtle">{relativeTime(event.occurredAt)}</span>,
              ])}
            />
          ) : (
            <ErrorNotice error={audit.error} what="the audit trail" />
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</div>
      <div className="mt-0.5 text-xs text-ink-subtle">{hint}</div>
    </div>
  );
}
