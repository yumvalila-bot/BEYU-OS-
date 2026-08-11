import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Sectors' };

export default function SectorsPage() {
  return (
    <NotBuilt
      title="Sectors"
      summary="Sector LLCs and the boundary where BEYU OS governance ends."
      backend="DEFERRED"
      planned={[
            'Sector LLC register with the attached operating system for each',
            'Sector performance roll-up assembled from figures the sector OS submits, never read from its database',
            'Sector-level strategic objectives cascaded from group strategy',
            'Explicit boundary marking: what BEYU OS governs and what it does not',
      ]}
    />
  );
}
