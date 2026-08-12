import { PageHeader, StatCard } from '@/components/primitives';
export default function DashboardPage() {
  return (
    <div>
      <PageHeader title="Executive Command Center" description="BEYU HEALTH OS — Real-time operational, clinical, financial, compliance intelligence. Noelia governed." />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Patients" value="12,483" sub="4.2% this month" trend="up" />
        <StatCard label="Today Encounters" value="342" sub="48 emergency, 12 ophthalmology" />
        <StatCard label="Revenue MTD" value="TZS 482M" sub="Collected 91%" trend="up" />
        <StatCard label="Bed Occupancy" value="78%" sub="32 available, 142 occupied" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="panel p-5 lg:col-span-2">
          <h3 className="font-semibold mb-4">Ophthalmology — First-Class Module (Differentiator)</h3>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-surface-sunken p-3"><div className="text-ink-subtle">Cataract</div><div className="text-lg font-bold">324</div><div className="text-xs text-ink-muted">cases this month</div></div>
            <div className="rounded-lg bg-surface-sunken p-3"><div className="text-ink-subtle">Glaucoma</div><div className="text-lg font-bold">186</div><div className="text-xs text-ink-muted">monitored</div></div>
            <div className="rounded-lg bg-surface-sunken p-3"><div className="text-ink-subtle">Diabetic Retinopathy</div><div className="text-lg font-bold">94</div><div className="text-xs text-ink-muted">screened</div></div>
          </div>
          <div className="mt-4 text-xs text-ink-muted">Visual acuity, refraction, slit-lamp, IOP, gonioscopy, fundus, OCT/OCTA, topography, pachymetry, biometry, optical prescriptions, surgery — fully integrated.</div>
        </div>
        <div className="panel p-5">
          <h3 className="font-semibold mb-3">Noelia AI — Governance Boundary</h3>
          <div className="space-y-2 text-sm">
            <div className="rounded-lg border border-border p-3"><div className="text-xs font-semibold text-accent">CLINICAL DECISION SUPPORT</div><div className="mt-1 text-ink-muted">Advisory only. Requires human confirmation. All retrievals audit-logged.</div></div>
            <div className="rounded-lg border border-border p-3"><div className="text-xs font-semibold">HIVE ENGINES</div><div className="mt-1 text-ink-muted">Clinical, Ophthalmology, Pharmacy, Lab, Radiology, Operational, Financial, Compliance, Supply Chain</div></div>
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel p-5"><h3 className="font-semibold mb-3">Queue and Triage Status</h3><div className="space-y-2 text-sm"><div className="flex justify-between"><span>Emergency</span><span className="badge bg-red-100 text-red-700">12 Immediate</span></div><div className="flex justify-between"><span>Ophthalmology</span><span className="badge bg-yellow-100 text-yellow-700">8 Waiting</span></div><div className="flex justify-between"><span>Pharmacy</span><span className="badge bg-green-100 text-green-700">3 Waiting</span></div></div></div>
        <div className="panel p-5"><h3 className="font-semibold mb-3">Compliance — Tanzania Pack</h3><div className="text-xs text-ink-muted mb-2">MOH, MTUHA, NHIF, TMDA, TRA, Data Protection + ISO-27001</div><div className="h-2 w-full rounded-full bg-surface-sunken"><div className="h-2 w-4/5 rounded-full bg-green-600" /></div><div className="mt-2 text-xs">80 percent compliant — 4 evidence due this week</div></div>
      </div>
      <div className="mt-6 rounded-lg bg-navy-900 p-4 text-white text-xs">BEYU FAMILY TRUST → BEYU HOLDING COMPANY → COUNTRY HOLDING → SECTOR OPERATING → BEYU HEALTH OS. Multi-tenant hospital groups, clinics, eye centers, pharmacies, labs, imaging, ambulance, telemedicine, insurers.</div>
    </div>
  );
}
