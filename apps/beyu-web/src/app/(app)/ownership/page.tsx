import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Ownership' };

export default function OwnershipPage() {
  return (
    <NotBuilt
      title="Ownership"
      summary="Legal entities, jurisdictions and the ownership graph across the structure."
      backend="DEFERRED"
      planned={[
            'Ownership interests as basis points with effective-from and effective-to dating, so historical positions stay queryable',
            'Entity register with jurisdiction, registration numbers and incorporation dates',
            'Beneficial ownership chains resolved through intermediate holding companies',
            'Cap-table view per entity, with no percentage ever hard-coded',
      ]}
    />
  );
}
