import { PageHeader } from '@/components/primitives';
import { cookies } from 'next/headers';

async function fetchPatients(token: string) {
  try {
    const base = process.env.NEXT_PUBLIC_HEALTH_API_URL ?? 'http://localhost:4001';
    const res = await fetch(`${base}/api/v1/patients?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function Page() {
  const cookieStore = cookies();
  const token = cookieStore.get('beyu_health_access')?.value;
  const data = token ? await fetchPatients(token) : null;
  return (
    <div>
      <PageHeader title="Patients" description="Unified longitudinal record: outpatient, inpatient, emergency, pharmacy, lab, radiology, ophthalmology, telemedicine, ambulance. One patient, one record, tenant-isolated, audited." />
      <div className="panel">
        <div className="border-b border-border p-4 flex gap-3">
          <input className="field max-w-sm" placeholder="Search MRN, name, phone, national ID" />
          <button className="btn-secondary">Search</button>
          <button className="btn-primary">New Patient</button>
        </div>
        <div className="p-0">
          {data?.items?.length ? (
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-xs uppercase tracking-widest text-ink-subtle">
                <tr><th className="px-4 py-2 text-left">MRN</th><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">Gender</th><th className="px-4 py-2 text-left">DOB</th><th className="px-4 py-2 text-left">Phone</th><th className="px-4 py-2 text-left">Status</th></tr>
              </thead>
              <tbody>
                {data.items.map((p: any) => (
                  <tr key={p.id} className="border-t border-border hover:bg-surface-sunken/50">
                    <td className="px-4 py-2 font-mono text-xs">{p.mrn}</td>
                    <td className="px-4 py-2">{p.first_name} {p.last_name}</td>
                    <td className="px-4 py-2">{p.gender}</td>
                    <td className="px-4 py-2">{new Date(p.date_of_birth).toLocaleDateString()}</td>
                    <td className="px-4 py-2">{p.phone}</td>
                    <td className="px-4 py-2"><span className="badge bg-green-100 text-green-700">{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-sm text-ink-muted">
              {token ? 'No patients found or API not reachable. Seed contains BEYU-DEMO-000001 John Doe. MRN auto BEYU-YYYY-###### tenant-scoped. Duplicate detection via national ID, phone, fuzzy name. Timeline aggregates encounters/conditions/observations/vitals/notes/prescriptions/lab/imaging/appointments/invoices.' : 'Sign in to view live patient data from Health OS API. Demo admin: admin@beyu.health / BeyuHealth2026!'}
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-surface-sunken p-3"><div className="font-medium">MRN Auto</div><div className="text-xs">BEYU-YYYY-######, tenant-scoped</div></div>
                <div className="rounded-lg bg-surface-sunken p-3"><div className="font-medium">Consents</div><div className="text-xs">General, Treatment, Data-Sharing, Telemedicine</div></div>
                <div className="rounded-lg bg-surface-sunken p-3"><div className="font-medium">Privacy</div><div className="text-xs">Minimum necessary, purpose limitation, break-glass</div></div>
              </div>
              <div className="mt-6 rounded-lg bg-navy-900 p-4 text-white text-xs">API: GET /api/v1/patients | POST /api/v1/patients | GET /api/v1/patients/:id/timeline — Real PostgreSQL, RLS, audit chain, FTS</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
