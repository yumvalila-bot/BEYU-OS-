import { cookies } from 'next/headers';

export interface HealthSession {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; displayName: string; roles: string[]; activeTenantId: string | null };
}

export function getSessionFromCookies(): HealthSession | null {
  try {
    const store = cookies();
    const access = store.get('beyu_health_access')?.value;
    const refresh = store.get('beyu_health_refresh')?.value;
    const userRaw = store.get('beyu_health_user')?.value;
    if (!access || !refresh || !userRaw) return null;
    const user = JSON.parse(userRaw);
    return { accessToken: access, refreshToken: refresh, user };
  } catch { return null; }
}
