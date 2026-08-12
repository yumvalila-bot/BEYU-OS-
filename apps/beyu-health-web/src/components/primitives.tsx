import type { ReactNode } from 'react';
export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
export function StatCard({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: 'up' | 'down' | 'neutral' }) {
  return (
    <div className="kpi-card">
      <div className="text-xs font-medium uppercase tracking-widest text-ink-subtle">{label}</div>
      <div className="mt-2 text-2xl font-bold text-ink">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="panel flex flex-col items-center justify-center p-12 text-center">
      <div className="h-12 w-12 rounded-full bg-surface-sunken mb-4" />
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
    </div>
  );
}
