import { PageHeader } from '@/components/primitives';
export default function Page() {
  return (
    <div>
      <PageHeader title="Patients" description="Unified longitudinal record: outpatient, inpatient, emergency, pharmacy, lab, radiology, ophthalmology, telemedicine, ambulance. One patient, one record, tenant-isolated, audited." />
      <div className="panel">
        <div className="border-b border-border p-4 flex gap-3">
          <input className="field max-w-sm" placeholder="Search MRN, name, phone, national ID" />
          <button className="btn-secondary">Search</button>
          <button className="btn-primary">New Patient</button>
        </div>
        <div className="p-6 text-sm text-ink-muted">
          Patient search uses PostgreSQL full-text + trigram, respects tenant RLS. Duplicate detection via national ID, phone, fuzzy name. Timeline aggregates encounters, conditions, observations, vitals, notes, prescriptions, lab, imaging, appointments, invoices.
          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-surface-sunken p-3"><div className="font-medium">MRN Auto</div><div className="text-xs">BEYU-YYYY-######, tenant-scoped</div></div>
            <div className="rounded-lg bg-surface-sunken p-3"><div className="font-medium">Consents</div><div className="text-xs">General, Treatment, Data-Sharing, Telemedicine</div></div>
            <div className="rounded-lg bg-surface-sunken p-3"><div className="font-medium">Privacy</div><div className="text-xs">Minimum necessary, purpose limitation, break-glass</div></div>
          </div>
          <div className="mt-6 rounded-lg bg-navy-900 p-4 text-white text-xs">API: GET /api/v1/patients | POST /api/v1/patients | GET /api/v1/patients/:id/timeline</div>
        </div>
      </div>
    </div>
  );
}
