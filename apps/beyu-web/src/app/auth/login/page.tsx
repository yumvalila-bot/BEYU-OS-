import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BrandMark } from '@/components/brand';
import { readAccessToken } from '@/lib/session';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  if (readAccessToken()) redirect('/dashboard');

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel. Navy and gold, and on small screens it collapses away
          entirely rather than pushing the form below the fold. */}
      <div className="hidden flex-col justify-between bg-navy-950 p-10 lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark size={36} />
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight text-gold-300">BEYU OS</div>
            <div className="text-xs uppercase tracking-wider text-navy-500">
              BEYU Family Trust
            </div>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-gold-200">
            The control plane for BEYU FAMILY TRUST
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-navy-500">
            Organization, ownership, governance, strategy, capital allocation,
            risk and compliance — governed to the Sector LLC boundary, and no
            further.
          </p>
        </div>

        <p className="text-xs text-navy-600">
          Authorised access only. Every action is recorded in an append-only
          audit trail.
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandMark size={36} />
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-ink">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-ink-muted">
            Use your BEYU identity to continue.
          </p>

          <LoginForm />

          <p className="mt-6 text-xs leading-relaxed text-ink-subtle">
            Sessions are held in httpOnly cookies and are never readable by
            scripts in this page. Five failed attempts lock the account for
            fifteen minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
