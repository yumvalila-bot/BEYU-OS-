import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Notifications' };

export default function NotificationsPage() {
  return (
    <NotBuilt
      title="Notifications"
      summary="Alerts, subscriptions and delivery preferences."
      backend="DEFERRED"
      planned={[
            'Notification centre with read state per user',
            'Delivery channel preferences: in-app, email, mobile push',
            'Subscription rules by domain and severity',
            'Digest scheduling to keep routine events out of real-time channels',
      ]}
    />
  );
}
