import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Documents' };

export default function DocumentsPage() {
  return (
    <NotBuilt
      title="Documents"
      summary="Document management with versioning and controlled sharing."
      backend="DEFERRED"
      planned={[
            'Document register with S3-compatible storage and server-side encryption',
            'Version history with immutable prior versions',
            'Explicit sharing to attached operating systems, which see only what is shared',
            'Retention policy enforcement',
      ]}
    />
  );
}
