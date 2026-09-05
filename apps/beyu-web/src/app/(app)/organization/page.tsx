import type { Metadata } from 'next';

import { Badge, DataTable, EmptyState, ErrorNotice, PageHeader, Panel } from '@/components/primitives';
import { tryApi } from '@/lib/api';
import type { OrganizationNode, Paged } from '@/lib/contracts';
import { nodeTypeLabel } from '@/lib/format';

export const metadata: Metadata = { title: 'Organization' };
export const dynamic = 'force-dynamic';

const BOUNDARY_TYPE = 'SECTOR_LLC';

export default async function OrganizationPage() {
  // 200 is the API's maximum page size; asking for more is rejected as a 400.
  const result = await tryApi<Paged<OrganizationNode>>('/organizations?limit=200');

  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Organization" />
        <ErrorNotice error={result.error} what="the organization hierarchy" />
      </div>
    );
  }

  const nodes = result.data.items;
  // Materialized paths are self-inclusive and '/'-separated, so sorting by
  // path yields a correct depth-first ordering without building a tree.
  const ordered = [...nodes].sort((a, b) => a.path.localeCompare(b.path));

  return (
    <div>
      <PageHeader
        title="Organization"
        description="The legal and operating structure of BEYU FAMILY TRUST, from the Trust down to the Sector LLC boundary where BEYU OS governance ends."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Hierarchy" className="lg:col-span-2">
          {ordered.length === 0 ? (
            <EmptyState message="No organization nodes exist yet." />
          ) : (
            <ul className="space-y-1">
              {ordered.map((node) => (
                <li
                  key={node.id}
                  style={{ paddingLeft: `${Math.min(node.depth, 6) * 1.25}rem` }}
                >
                  <div className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-sunken">
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        node.type === BOUNDARY_TYPE ? 'bg-accent' : 'bg-ink-subtle'
                      }`}
                    />
                    <span className="font-medium text-ink">{node.name}</span>
                    <Badge tone={node.type === 'FOUNDATION' ? 'accent' : 'neutral'}>
                      {nodeTypeLabel(node.type)}
                    </Badge>
                    {node.countryCode ? (
                      <span className="text-xs text-ink-subtle">{node.countryCode}</span>
                    ) : null}
                    {node.type === BOUNDARY_TYPE ? (
                      <span className="text-xs italic text-accent">boundary</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="The boundary">
            <p className="text-sm leading-relaxed text-ink-muted">
              BEYU OS governs down to the <strong className="text-ink">Sector LLC</strong>{' '}
              and no further. What happens inside a sector — patients, farms,
              loans, grants — belongs to that sector&rsquo;s own operating
              system, which reaches this control plane only through versioned
              APIs and events.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              BEYU FOUNDATION is a <strong className="text-ink">sister</strong> to
              BEYU HOLDING COMPANY, not a subsidiary of it, and carries its own
              independent FOUNDATION OS.
            </p>
          </Panel>

          <Panel title="Composition">
            <DataTable
              columns={['Type', 'Count']}
              rows={Object.entries(
                nodes.reduce<Record<string, number>>((counts, node) => {
                  counts[node.type] = (counts[node.type] ?? 0) + 1;
                  return counts;
                }, {}),
              )
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => [
                  <span key="t">{nodeTypeLabel(type)}</span>,
                  <span key="c" className="tabular-nums">{count}</span>,
                ])}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
