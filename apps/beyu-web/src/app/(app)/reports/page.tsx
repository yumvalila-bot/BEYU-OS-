import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Reports' };

export default function ReportsPage() {
  return (
    <NotBuilt
      title="Reports"
      summary="Reporting and analytics across the control plane."
      backend="DEFERRED"
      planned={[
            'Standard board and trustee report packs',
            'Scheduled generation and distribution',
            'Export to PDF and spreadsheet formats',
            'Figures assembled from the control plane only, with sector figures shown as submitted',
      ]}
    />
  );
}
