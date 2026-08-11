import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Tenants' };

export default function TenantsPage() {
  return (
    <NotBuilt
      title="Tenants"
      summary="Tenant provisioning and isolation across the platform."
      backend="DEFERRED"
      planned={[
            'Tenant register with the operating system each belongs to',
            'Row-level security posture per tenant, already enforced in the database',
            'Tenant lifecycle: provisioning, suspension, decommissioning',
            'Per-tenant configuration without code changes',
      ]}
    />
  );
}
