import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Compliance' };

export default function CompliancePage() {
  return (
    <NotBuilt
      title="Compliance"
      summary="Obligations, evidence and regulatory filing status."
      backend="DEFERRED"
      planned={[
            'Obligation register scoped by jurisdiction and entity',
            'Evidence submission and review, including submissions from sector operating systems',
            'Filing calendar with escalation before deadlines',
            'Breach recording and remediation tracking',
      ]}
    />
  );
}
