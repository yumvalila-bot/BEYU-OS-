import { redirect } from 'next/navigation';

import { readAccessToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default function IndexPage() {
  redirect(readAccessToken() ? '/dashboard' : '/auth/login');
}
