import { PageHeader } from '@/components/primitives';
import { cookies } from 'next/headers';

async function fetchData(token: string) {
  try {
    const base = process.env.NEXT_PUBLIC_HEALTH_API_URL ?? 'http://localhost:4001';
    const res = await fetch(`${base}/inventory/items?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.items ?? json.data ?? json;
  } catch { return null; }
}

export default async function Page() {
  const cookieStore = await cookies();
  const token = cookieStore.get('beyu_health_access')?.value;
  const data = token ? await fetchData(token) : null;
  
  const extra = token ? await (async () => {
    try {
      const base = process.env.NEXT_PUBLIC_HEALTH_API_URL ?? 'http://localhost:4001';
      const res = await fetch(`${base}/inventory/low-stock?limit=20`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  })() : null;

  return (
    <div>
      <PageHeader title="Inventory & Supply Chain" description="Inventory, warehouses, stock movements, batches, serial, expiry, minimum stock, reorder, purchase requisitions, suppliers, transfers." />
      <div className="panel">
        <div className="border-b border-border p-4 flex gap-3">
          <input className="field max-w-sm" placeholder="Search Inventory & Supply Chain" />
          <button className="btn-secondary">Search</button>
          <button className="btn-primary">New</button>
        </div>
        <div className="p-0 overflow-auto">
          {data?.length || data?.items || Array.isArray(data) ? (
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-xs uppercase tracking-widest text-ink-subtle">
                <tr>
                <th className="px-4 py-2 text-left">SKU</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Total Stock</th>
                <th className="px-4 py-2 text-left">Reorder</th>
                <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(data) ? data : data.items ?? data.data ?? []).slice(0,20).map((p:any, idx:number) => (
                  <tr key={p.id ?? idx} className="border-t border-border hover:bg-surface-sunken/50">
                  <td className="px-4 py-2 truncate max-w-[200px]">{p.sku ?? p.first_name ?? ""}</td>
                  <td className="px-4 py-2 truncate max-w-[200px]">{p.name ?? p.first_name ?? ""}</td>
                  <td className="px-4 py-2 truncate max-w-[200px]">{p.category ?? p.first_name ?? ""}</td>
                  <td className="px-4 py-2 font-mono text-xs">{typeof p.total_stock === "number" ? (p.total_stock/100).toFixed(2) : (p.total_stock ?? 0)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{typeof p.reorder_level === "number" ? (p.reorder_level/100).toFixed(2) : (p.reorder_level ?? 0)}</td>
                  <td className="px-4 py-2 truncate max-w-[200px]">{p.status ?? p.first_name ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-sm text-ink-muted">
              <div className="rounded-lg bg-navy-900 p-4 text-white text-xs mb-4">
                API: GET /api/v1/inventory/items — Real PostgreSQL, RLS tenant isolation, audit hash chain, RBAC/ABAC
                 | Extra: /inventory/low-stock
              </div>
              <p>{token ? "No data or API not reachable. Seed includes Tanzania HQ demo data. Check Health API at :4001 is running and you are authenticated (admin@beyu.health / BeyuHealth2026!)." : "Sign in to view live data. Demo admin: admin@beyu.health / BeyuHealth2026!"}</p>
              <ul className="mt-4 list-disc pl-5 space-y-1">
                <li>Multi-tenant isolation via app.tenant GUC + RLS policy tenant_isolation</li>
                <li>Audit trail append-only hash chain SHA256 app-layer, tamper-evident</li>
                <li>Role-based workspaces (DOCTOR, NURSE, OPHTHALMOLOGIST, PHARMACIST, etc)</li>
                <li>FHIR R4 / HL7 / DICOM ready, standards ICD-10/11 SNOMED LOINC</li>
                <li>Noelia AI governed: purpose-of-use, tenant-filtered RAG, human-in-loop</li>
              </ul>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-surface-sunken p-3"><div className="font-medium">Tenant Isolation</div><div className="text-xs">DB RLS + API + files + AI retrieval + audit</div></div>
                <div className="rounded-lg bg-surface-sunken p-3"><div className="font-medium">Audit Chain</div><div className="text-xs">Append-only, hash chain, break-glass logging</div></div>
                <div className="rounded-lg bg-surface-sunken p-3"><div className="font-medium">Interoperability</div><div className="text-xs">FHIR/HL7/DICOM/CDA, adapter-based no vendor lock</div></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
