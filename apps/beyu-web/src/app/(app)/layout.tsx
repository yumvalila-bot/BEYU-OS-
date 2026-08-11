import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { ApiError, apiFetch } from '@/lib/api';
import type { MeResponse } from '@/lib/contracts';

export const dynamic = 'force-dynamic';

/**
 * Gate for every authenticated route.
 *
 * The check is a real call to /auth/me, not a look at whether a cookie
 * exists. A cookie can hold an expired or revoked token, and only the API can
 * say whether a session is still valid. This layout decides what to *render*;
 * it is not the security boundary — every request the pages make is
 * separately authorized by the API, which is the only place that cannot be
 * bypassed by editing a cookie.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  let me: MeResponse;
  try {
    me = await apiFetch<MeResponse>('/auth/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/auth/login');
    }
    throw error;
  }

  return (
    <AppShell
      user={{ displayName: me.displayName, email: me.email, roles: me.roles }}
    >
      {children}
    </AppShell>
  );
}
