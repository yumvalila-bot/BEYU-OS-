import type { Metadata } from 'next';

import { Badge, DataTable, EmptyState, ErrorNotice, PageHeader, Panel } from '@/components/primitives';
import { tryApi } from '@/lib/api';
import type { OsRegistrationView, Paged } from '@/lib/contracts';
import { absoluteTime, osStatusTone } from '@/lib/format';

export const metadata: Metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

const LIFECYCLE = [
  'REGISTERED',
  'CONFIGURING',
  'SECURITY_VALIDATION',
  'ACTIVE',
  'SUSPENDED',
  'RETIRED',
];

export default async function IntegrationsPage() {
  const result = await tryApi<Paged<OsRegistrationView>>('/os-registry');

  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Integrations" />
        <ErrorNotice error={result.error} what="the OS registry" />
      </div>
    );
  }

  const systems = result.data.items;
  const attached = systems.filter((os) => os.attachmentKind !== 'CORE');

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Operating systems attached to BEYU OS. Each runs independently with its own database and release schedule, and reaches this control plane only through versioned APIs and granted events."
      />

      <div className="grid gap-4">
        <Panel title="Registered systems">
          {systems.length === 0 ? (
            <EmptyState message="No operating systems are registered." />
          ) : (
            <DataTable
              columns={['System', 'Kind', 'Sector', 'Status', 'Capabilities', 'Registered']}
              rows={systems.map((os) => [
                <div key="n">
                  <div className="font-medium text-ink">{os.name}</div>
                  <div className="font-mono text-xs text-ink-subtle">{os.osId}</div>
                </div>,
                <Badge key="k" tone={os.attachmentKind === 'CORE' ? 'accent' : 'neutral'}>
                  {os.attachmentKind.replace(/_/g, ' ')}
                </Badge>,
                <span key="sec" className="text-ink-muted">{os.sectorCode ?? '—'}</span>,
                <Badge key="s" tone={osStatusTone(os.status)}>{os.status.replace(/_/g, ' ')}</Badge>,
                <span key="c" className="text-ink-muted">
                  {os.capabilities.length === 0 ? (
                    <span className="text-ink-subtle">none granted</span>
                  ) : (
                    `${os.capabilities.length} granted`
                  )}
                </span>,
                <span key="r" className="whitespace-nowrap font-mono text-xs text-ink-subtle">
                  {absoluteTime(os.createdAt).slice(0, 10)}
                </span>,
              ])}
            />
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Onboarding lifecycle">
            <ol className="space-y-2 text-sm">
              {LIFECYCLE.map((state, index) => (
                <li key={state} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-xs tabular-nums text-ink-subtle">
                    {index + 1}
                  </span>
                  <Badge tone={osStatusTone(state)}>{state.replace(/_/g, ' ')}</Badge>
                  <span className="text-ink-subtle">
                    {attached.filter((os) => os.status === state).length} system(s)
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm leading-relaxed text-ink-muted">
              A system cannot move from registered straight to active. It passes
              through security validation first, and it must be attached to a
              node and have an endpoint before it can be activated. Retirement
              is terminal.
            </p>
          </Panel>

          <Panel title="What an attached system can never do">
            <ul className="space-y-2 text-sm text-ink-muted">
              {[
                'Reach the control plane database — not even read-only',
                'Execute a waterfall; BEYU OS decides and Finance OS executes',
                'Approve capital or governance decisions; approval is a human act',
                'Alter or delete audit history',
                'Bypass authorization or override policy',
                'Read another attached system’s data',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="mt-0.5 shrink-0 text-critical">✕</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-ink-subtle">
              These are refused by the type contract, by the API, and by a
              database trigger — the third because the first two only protect
              callers who arrive through the API.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
