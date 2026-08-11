import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Waterfall' };

export default function WaterfallPage() {
  return (
    <NotBuilt
      title="Waterfall"
      summary="Strategic cashflow waterfall decisioning. BEYU OS decides; Finance OS executes."
      backend="PARTIALLY IMPLEMENTED"
      planned={[
            'Rule set editor with versioning; historical calculations are never silently mutated',
            'Scenario modelling against alternative rule sets before adoption',
            'Calculation history with the frozen rule snapshot each run used',
            'Distribution decisions handed to Finance OS for execution — no financial execution happens here',
      ]}
    />
  );
}
