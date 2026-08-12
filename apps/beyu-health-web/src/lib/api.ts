const API_URL = process.env.NEXT_PUBLIC_HEALTH_API_URL ?? 'http://localhost:4001';

export async function healthApiFetch(path: string, options: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(rest.headers as any) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/api/v1${path}`, { ...rest, headers, cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0,500)}`);
  }
  return res.json();
}
