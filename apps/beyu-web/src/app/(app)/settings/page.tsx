import type { Metadata } from 'next';

import { Badge, DataTable, ErrorNotice, PageHeader, Panel } from '@/components/primitives';
import { tryApi } from '@/lib/api';
import type { MeResponse } from '@/lib/contracts';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const me = await tryApi<MeResponse>('/auth/me');

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Your identity and security context as the API reports it."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Identity">
          {me.ok ? (
            <DataTable
              columns={['Field', 'Value']}
              rows={[
                ['Name', me.data.displayName],
                ['Email', me.data.email],
                ['User ID', <span key="u" className="font-mono text-xs">{me.data.userId}</span>],
                ['Identity ID', <span key="i" className="font-mono text-xs">{me.data.identityId}</span>],
                ['Active tenant', me.data.activeTenantId ?? '— (trust-level session)'],
              ].map(([label, value]) => [
                <span key="l" className="text-ink-muted">{label}</span>,
                value,
              ])}
            />
          ) : (
            <ErrorNotice error={me.error} what="your identity" />
          )}
        </Panel>

        <Panel title="Roles" description="Granted by the API; not editable from this screen">
          {me.ok ? (
            <div className="flex flex-wrap gap-2">
              {me.data.roles.length === 0 ? (
                <span className="text-sm text-ink-subtle">No roles assigned.</span>
              ) : (
                me.data.roles.map((role) => (
                  <Badge key={role} tone="accent">
                    {role.replace(/([a-z])([A-Z])/g, '$1 $2')}
                  </Badge>
                ))
              )}
            </div>
          ) : (
            <ErrorNotice error={me.error} what="your roles" />
          )}
        </Panel>

        <Panel title="Session security" className="lg:col-span-2">
          <ul className="space-y-2 text-sm text-ink-muted">
            {[
              'Access and refresh tokens are held in httpOnly cookies and are never readable by scripts in this page.',
              'This browser never calls the API directly and never holds a database connection; every request is forwarded by the web server with the token attached server-side.',
              'Refresh tokens are stored hashed and rotate on every use. Presenting a consumed token is treated as compromise.',
              'Five failed sign-in attempts lock an account for fifteen minutes.',
              'What this screen renders is a convenience. Every authorization decision is made by the API, which cannot be bypassed by editing anything on this page.',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="mt-0.5 shrink-0 text-positive">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
