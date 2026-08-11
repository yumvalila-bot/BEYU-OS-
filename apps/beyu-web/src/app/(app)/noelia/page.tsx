import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Noelia' };

export default function NoeliaPage() {
  return (
    <NotBuilt
      title="Noelia"
      summary="AI advisory layer. Recommends; never executes."
      backend="DEFERRED"
      planned={[
            'Conversational advisory over data the asking user is already authorised to see',
            'Recommendations presented with their reasoning and the data they drew on',
            'Every recommendation requiring human approval before it becomes an action',
            'No unrestricted database access and no ability to bypass authorization — the governance boundary is already implemented and tested in @beyu/auth',
      ]}
    />
  );
}
