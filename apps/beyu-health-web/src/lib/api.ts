/**
 * Browser / Next server → NestJS Health API.
 * Postgres, Prisma and the Supabase service role are never imported here.
 */
// Same-origin by default so the browser never targets localhost from a preview host.
// Optional NEXT_PUBLIC_HEALTH_API_URL overrides when the API is on another public origin.
const API_URL = process.env.NEXT_PUBLIC_HEALTH_API_URL ?? '';

export async function healthApiFetch(path: string, options: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(rest.headers as Record<string, string>) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/api/v1${path}`, { ...rest, headers, cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}
