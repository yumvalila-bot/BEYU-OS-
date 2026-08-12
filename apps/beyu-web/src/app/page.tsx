import { redirect } from 'next/navigation';

import { readAccessToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function IndexPage() {
  redirect((await readAccessToken()) ? '/dashboard' : '/auth/login');
}
