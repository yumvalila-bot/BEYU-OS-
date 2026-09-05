import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Strategy' };

export default function StrategyPage() {
  return (
    <NotBuilt
      title="Strategy"
      summary="Objectives, key results and strategic initiatives cascaded through the structure."
      backend="DEFERRED"
      planned={[
            'Objective hierarchy from trust level down to sector level',
            'Measurable key results with owners and review cadence',
            'Initiative portfolio with capital linkage',
            'Cascade integrity: every sector objective traceable to a group objective',
      ]}
    />
  );
}
