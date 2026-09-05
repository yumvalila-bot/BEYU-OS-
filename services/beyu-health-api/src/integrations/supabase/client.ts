/**
 * Server-side Supabase client for Health OS.
 * Secret/service-role keys never leave this NestJS process.
 */
import { ASSOCIATED_SUPABASE_PROJECT_REF, configuredSupabaseProjectRef, extractSupabaseProjectRef } from '../../db/connection-target';

export interface SupabaseRuntimeStatus {
  configured: boolean;
  projectRef: string | null;
  associatedProjectRef: string;
  usesAssociatedProject: boolean | null;
}

function supabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

function supabaseSecret(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

export function supabaseRuntimeStatus(): SupabaseRuntimeStatus {
  const url = supabaseUrl();
  const secret = supabaseSecret();
  const projectRef = configuredSupabaseProjectRef() ?? (url ? extractSupabaseProjectRef(url) : null);
  return {
    configured: Boolean(url && secret),
    projectRef,
    associatedProjectRef: ASSOCIATED_SUPABASE_PROJECT_REF,
    usesAssociatedProject: projectRef ? projectRef === ASSOCIATED_SUPABASE_PROJECT_REF : null,
  };
}

export async function createSupabaseServiceClient(): Promise<unknown | null> {
  const url = supabaseUrl();
  const secret = supabaseSecret();
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !secret) return null;
  if (publishable && secret === publishable) {
    throw new Error('SUPABASE_SECRET_KEY must not be the publishable key.');
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
