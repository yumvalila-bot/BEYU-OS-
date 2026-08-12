import { PageHeader } from '@/components/primitives';
export default function Page() {
  return (
    <div>
      <PageHeader title="Pharmacy" description="BEYU HEALTH OS workspace — tenant-isolated, audited, API-driven." />
      <div className="panel p-8 text-sm text-ink-muted">
        <p>This workspace connects to the Health OS API. Real PostgreSQL, RLS, audit chain, RBAC, purpose-of-use, Noelia governance.</p>
        <ul className="mt-4 list-disc pl-5 space-y-1">
          <li>Multi-tenant isolation via app.tenant GUC + RLS</li>
          <li>Audit trail append-only hash chain</li>
          <li>Role-based workspaces (DOCTOR, NURSE, OPHTHALMOLOGIST, etc)</li>
          <li>FHIR R4 / HL7 / DICOM ready</li>
          <li>Noelia AI: recommendations require human confirmation</li>
        </ul>
        <div className="mt-6 rounded-lg bg-navy-900 p-4 text-white text-xs">
          BEYU FAMILY TRUST → HOLDING → Country → Sector Operating → HEALTH OS → Tenants → Facilities → Departments → Users/Patients<br/>
          NOELIA → HIVE → Specialized Engines → Authorized Data → HITL Action
        </div>
      </div>
    </div>
  );
}
