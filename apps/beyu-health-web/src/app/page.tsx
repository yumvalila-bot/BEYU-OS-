import Link from 'next/link';
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 text-white font-bold">B</div>
            <div><div className="font-bold tracking-widest">BEYU</div><div className="text-[10px] font-semibold uppercase tracking-widest text-accent">Health OS</div></div>
          </div>
          <div className="flex gap-3">
            <Link href="/auth/login" className="btn-secondary">Sign In</Link>
            <Link href="/dashboard" className="btn-primary">Open Health OS</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-16">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">BEYU FAMILY TRUST → BEYU HOLDING → TZ → HEALTH LLC → HEALTH OS</div>
          <h1 className="text-5xl font-bold leading-tight text-ink">Complete Healthcare<br/>Operating System</h1>
          <p className="mt-6 text-lg text-ink-muted">One longitudinal patient record. Modular monolith that scales from a small clinic to thousands of facilities. Ophthalmology first-class, pharmacy, lab, radiology, telemedicine, ambulance, billing, insurance, inventory, workforce, compliance, governance, analytics, FHIR, HL7, DICOM, and governed AI with Noelia & HIVE.</p>
          <div className="mt-8 flex gap-3">
            <Link href="/dashboard" className="btn-primary px-6 py-3">Launch Clinical Workstation</Link>
            <Link href="/ophthalmology" className="btn-secondary px-6 py-3">Ophthalmology Module</Link>
          </div>
          <div className="mt-12 grid grid-cols-3 gap-4 text-sm">
            <div className="panel p-4"><div className="font-semibold">Multi-tenant</div><div className="text-ink-muted">Tenant isolation, RLS, audit chain, break-glass</div></div>
            <div className="panel p-4"><div className="font-semibold">Standards</div><div className="text-ink-muted">FHIR R4, HL7 v2, DICOMweb, ICD-10/11, SNOMED, LOINC</div></div>
            <div className="panel p-4"><div className="font-semibold">AI Governed</div><div className="text-ink-muted">Noelia with RBAC, ABAC, purpose-of-use, human-in-loop</div></div>
          </div>
        </div>
      </main>
    </div>
  );
}
