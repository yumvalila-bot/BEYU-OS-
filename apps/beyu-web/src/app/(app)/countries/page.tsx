import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Countries' };

export default function CountriesPage() {
  return (
    <NotBuilt
      title="Countries"
      summary="Country holding companies and the regulatory posture of each jurisdiction."
      backend="DEFERRED"
      planned={[
            'Country holding company register with local regulator and filing calendar',
            'Jurisdiction-specific requirements loaded as configuration, never hard-coded — Tanzania included',
            'Cross-border structure view',
            'Local compliance status roll-up',
      ]}
    />
  );
}
