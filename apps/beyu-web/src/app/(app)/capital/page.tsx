import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Capital' };

export default function CapitalPage() {
  return (
    <NotBuilt
      title="Capital"
      summary="Capital pools, allocation requests and approval workflow."
      backend="DEFERRED"
      planned={[
            'Capital pools with balances in integer minor units',
            'Allocation requests from sector operating systems, queued for human approval',
            'Approval workflow with thresholds by role and amount',
            'Deployment tracking against approved allocations',
      ]}
    />
  );
}
