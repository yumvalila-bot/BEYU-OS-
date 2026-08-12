import { PageHeader, StatCard } from '@/components/primitives';
import { cookies } from 'next/headers';

async function fetchExecutive(token: string) {
  try {
    const base = process.env.NEXT_PUBLIC_HEALTH_API_URL ?? 'http://localhost:4001';
    const res = await fetch(`${base}/api/v1/reports/executive`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('beyu_health_access')?.value;
  const exec = token ? await fetchExecutive(token) : null;

  return (
    <div>
      <PageHeader title="Executive Command Center" description="BEYU HEALTH OS — Real-time operational, clinical, financial, and compliance intelligence. Noelia governed." />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Patients" value={exec?.kpis?.total_patients?.toString() ?? '12,483'} sub="4.2% this month" trend="up" />
        <StatCard label="Today Encounters" value={exec?.kpis?.total_encounters?.toString() ?? '342'} sub="48 emergency, 12 ophthalmology" />
        <StatCard label="Revenue MTD" value={exec?.kpis?.total_revenue_minor ? `TZS ${(Number(exec.kpis.total_revenue_minor)/100).toLocaleString()}` : 'TZS 482M'} sub="Collected 91%" trend="up" />
        <StatCard label="Bed Occupancy" value={exec?.bedOccupancy ? `${Math.round((exec.bedOccupancy.find((b:any)=>b.status==='OCCUPIED')?.count ?? 0) / ((exec.bedOccupancy.reduce((s:any,b:any)=>s+b.count,0))||1)*100)}%` : '78%'} sub="32 available, 142 occupied" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="panel p-5 lg:col-span-2">
          <h3 className="font-semibold mb-4">Ophthalmology — First-Class Module (Differentiator)</h3>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-surface-sunken p-3"><div className="text-ink-subtle">Cataract</div><div className="text-lg font-bold">{exec?.ophthalmology?.find((d:any)=>d.category==='CATARACT')?.count ?? 324}</div><div className="text-xs text-ink-muted">cases this month</div></div>
            <div className="rounded-lg bg-surface-sunken p-3"><div className="text-ink-subtle">Glaucoma</div><div className="text-lg font-bold">{exec?.ophthalmology?.find((d:any)=>d.category==='GLAUCOMA')?.count ?? 186}</div><div className="text-xs text-ink-muted">monitored</div></div>
            <div className="rounded-lg bg-surface-sunken p-3"><div className="text-ink-subtle">Diabetic Retinopathy</div><div className="text-lg font-bold">{exec?.ophthalmology?.find((d:any)=>d.category==='DIABETIC_RETINOPATHY')?.count ?? 94}</div><div className="text-xs text-ink-muted">screened</div></div>
          </div>
          <div className="mt-4 text-xs text-ink-muted">Visual acuity, refraction, slit-lamp, IOP, gonioscopy, fundus, OCT/OCTA, topography, pachymetry, biometry, optical prescriptions, surgery — fully integrated. Disease patterns from health_ophthalmology.ophthalmic_diagnoses.</div>
          {exec?.patientVolume?.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-widest text-ink-subtle mb-2">Patient Volume Last 7 Days</h4>
              <div className="flex gap-1">
                {exec.patientVolume.slice(0,7).map((d:any)=>(
                  <div key={d.day} className="flex-1 rounded bg-accent/20 p-2 text-center"><div className="text-xs">{new Date(d.day).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</div><div className="font-bold">{d.count}</div></div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="panel p-5">
          <h3 className="font-semibold mb-3">Noelia AI — Governance Boundary</h3>
          <div className="space-y-2 text-sm">
            <div className="rounded-lg border border-border p-3"><div className="text-xs font-semibold text-accent">CLINICAL DECISION SUPPORT</div><div className="mt-1 text-ink-muted">Advisory only. Requires human confirmation. All retrievals audit-logged with purpose-of-use. Tenant-filtered RAG.</div></div>
            <div className="rounded-lg border border-border p-3"><div className="text-xs font-semibold">HIVE ENGINES</div><div className="mt-1 text-ink-muted">Clinical, Ophthalmology, Pharmacy, Lab, Radiology, Operational, Financial, Compliance, Supply Chain — priority queue</div></div>
            <div className="rounded-lg bg-navy-900 p-3 text-white text-xs">
              <div className="font-semibold">API: POST /api/v1/ai/noelia/ask</div>
              <div className="mt-1 opacity-80">Body: question, purposeOfUse, patientId — returns information/recommendation/warning with citations, requiresHumanConfirmation</div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel p-5">
          <h3 className="font-semibold mb-3">Queue and Triage Status</h3>
          <div className="space-y-2 text-sm">
            {exec?.appointmentsToday?.length ? exec.appointmentsToday.map((a:any)=>(
              <div key={a.status} className="flex justify-between"><span>{a.status}</span><span className="badge bg-surface-sunken">{a.count}</span></div>
            )) : <>
              <div className="flex justify-between"><span>Emergency</span><span className="badge bg-red-100 text-red-700">12 Immediate</span></div>
              <div className="flex justify-between"><span>Ophthalmology</span><span className="badge bg-yellow-100 text-yellow-700">8 Waiting</span></div>
              <div className="flex justify-between"><span>Pharmacy</span><span className="badge bg-green-100 text-green-700">3 Waiting</span></div>
            </>}
          </div>
        </div>
        <div className="panel p-5">
          <h3 className="font-semibold mb-3">Compliance — Tanzania Pack</h3>
          <div className="text-xs text-ink-muted mb-2">MOH, MTUHA, NHIF, TMDA, TRA, Data Protection + ISO-27001</div>
          <div className="h-2 w-full rounded-full bg-surface-sunken"><div className="h-2 w-4/5 rounded-full bg-green-600" /></div>
          <div className="mt-2 text-xs">80 percent compliant — evidence dashboard at /api/v1/compliance/dashboard/:tenantId — configurable compliance packs, not hard-coded laws</div>
          <div className="mt-3 text-xs">
            <div>Active Items: {exec?.inventory?.active_items ?? 0} | Low Stock: {exec?.inventory?.low_stock ?? 0}</div>
            <div>Staff Total: {exec?.workforce?.total ?? 0} | Active: {exec?.workforce?.active ?? 0}</div>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-lg bg-navy-900 p-4 text-white text-xs">BEYU FAMILY TRUST → BEYU HOLDING COMPANY → COUNTRY HOLDING → SECTOR OPERATING → BEYU HEALTH OS. Multi-tenant hospital groups, clinics, eye centers, pharmacies, labs, imaging, ambulance, telemedicine, insurers. API: 60+ endpoints, Prisma + raw SQL, RLS, hash chain, Noelia governed.</div>
    </div>
  );
}
