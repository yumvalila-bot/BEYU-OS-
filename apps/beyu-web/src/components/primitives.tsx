/**
 * Presentational primitives shared across routes.
 *
 * These are server components with no client state, so they add nothing to
 * the browser bundle.
 */

import type { ReactNode } from 'react';

import type { ApiError } from '@/lib/api';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title ? (
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-ink-subtle">{description}</p>
            ) : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

type Tone = 'neutral' | 'accent' | 'positive' | 'caution' | 'critical';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted border-border',
  accent: 'bg-accent/12 text-accent border-accent/30',
  positive: 'bg-positive/12 text-positive border-positive/30',
  caution: 'bg-caution/12 text-caution border-caution/30',
  critical: 'bg-critical/12 text-critical border-critical/30',
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Explains a failed panel in place.
 *
 * A 403 is stated as a permissions boundary rather than dressed up as an
 * error: not seeing something you are not cleared for is the system working.
 */
export function ErrorNotice({ error, what }: { error: ApiError; what: string }) {
  const denied = error.status === 401 || error.status === 403;
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        denied ? toneClass.caution : toneClass.critical
      }`}
    >
      <p className="font-medium">
        {denied ? `You do not have access to ${what}.` : `Could not load ${what}.`}
      </p>
      <p className="mt-1 opacity-90">{error.message}</p>
      {error.requestId ? (
        <p className="mt-1 font-mono text-xs opacity-70">Request {error.requestId}</p>
      ) : null}
    </div>
  );
}

/**
 * States plainly that a screen is not built yet.
 *
 * Every deferred route renders this instead of a plausible-looking mock. A
 * screen full of invented numbers is worse than an empty one: it gets
 * screenshotted, believed and planned against.
 */
export function NotBuilt({
  title,
  summary,
  backend,
  planned,
}: {
  title: string;
  summary: string;
  backend: 'IMPLEMENTED' | 'PARTIALLY IMPLEMENTED' | 'DEFERRED';
  planned: string[];
}) {
  const tone: Tone =
    backend === 'IMPLEMENTED' ? 'positive' : backend === 'PARTIALLY IMPLEMENTED' ? 'caution' : 'neutral';
  return (
    <div>
      <PageHeader title={title} description={summary} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Status">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="caution">Screen: DEFERRED</Badge>
            <Badge tone={tone}>Backend: {backend}</Badge>
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            This screen is not built. Nothing is shown here rather than showing
            sample data, because a control plane that displays invented figures
            is worse than one that displays nothing — the figures get believed.
          </p>
        </Panel>
        <Panel title="What belongs here">
          <ul className="space-y-2 text-sm text-ink-muted">
            {planned.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-ink-subtle">
      {message}
    </p>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className="border-b border-border/60 last:border-0 hover:bg-surface-sunken/60"
            >
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2.5 align-top text-ink">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
