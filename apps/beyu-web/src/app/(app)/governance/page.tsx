import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Governance' };

export default function GovernancePage() {
  return (
    <NotBuilt
      title="Governance"
      summary="Boards, committees, meetings, resolutions and delegated authority."
      backend="DEFERRED"
      planned={[
            'Board and committee composition with terms and independence flags',
            'Meeting scheduling, agendas, minutes and quorum tracking',
            'Resolutions with voting records, tied to the audit trail',
            'Delegation of authority matrix, enforced by the policy engine rather than described in a document',
      ]}
    />
  );
}
