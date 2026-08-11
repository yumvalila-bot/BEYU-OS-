import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Risks' };

export default function RisksPage() {
  return (
    <NotBuilt
      title="Risks"
      summary="Group risk register, assessment and treatment."
      backend="DEFERRED"
      planned={[
            'Risk register with 1–5 likelihood and impact scoring, already enforced by the schema',
            'Risk appetite statements by category',
            'Treatment plans with owners and due dates',
            'Risks submitted by attached operating systems, which can raise but not read others\'',
      ]}
    />
  );
}
