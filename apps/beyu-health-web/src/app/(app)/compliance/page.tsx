import { PageHeader } from '@/components/primitives';
import { cookies } from 'next/headers';

async function fetchData(token: string, path: string) {
  try {
    const base = process.env.NEXT_PUBLIC_HEALTH_API_URL ?? 'http://localhost:4001';
    const res = await fetch(`${base}/api/v1${path}`, {
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
  const packs = token ? await fetchData(token, '/compliance/packs') : null;
  const dashboard = token ? await fetchData(token, '/compliance/dashboard/00000000-0000-0000-0000-000000000001') : null;

  const groupByAuthority = (data: any[]) => {
    const groups: Record<string, any[]> = {};
    (data ?? []).forEach((p: any) => {
      const auth = p.authority ?? 'Other';
      if (!groups[auth]) groups[auth] = [];
      groups[auth].push(p);
    });
    return groups;
  };

  const grouped = packs ? groupByAuthority(Array.isArray(packs) ? packs : []) : {};

  const isquaPacks = packs ? (Array.isArray(packs) ? packs.filter((p: any) => p.authority === 'ISQua' || p.code?.startsWith('ISQUA')) : []) : [];
  const isoPacks = packs ? (Array.isArray(packs) ? packs.filter((p: any) => p.authority === 'ISO' || p.authority === 'CEN') : []) : [];
  const nabhPacks = packs ? (Array.isArray(packs) ? packs.filter((p: any) => p.authority === 'NABH') : []) : [];
  const jciPacks = packs ? (Array.isArray(packs) ? packs.filter((p: any) => p.authority === 'JCI') : []) : [];
  const tzPacks = packs ? (Array.isArray(packs) ? packs.filter((p: any) => ['MOH','NHIF','TMDA','TRA','DATA_COMMISSION'].includes(p.authority)) : []) : [];

  return (
    <div>
      <PageHeader title="Compliance — ISQua, ISO, NABH, JCI, Tanzania" description="International accreditation: ISQua EEA Principles 8th, ISO 9001/15189/7101/27001/27799/45001/14001, NABH Hospital 5th Eye Care 3rd, JCI Hospital 8th IPSG, Tanzania MOH/MTUHA/NHIF/TMDA/TRA/Data Protection. Configurable packs, not hard-coded laws." />
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="kpi-card">
          <div className="text-xs uppercase tracking-widest text-ink-subtle">Total Packs</div>
          <div className="text-2xl font-bold mt-1">{Array.isArray(packs) ? packs.length : 0}</div>
          <div className="text-xs text-ink-muted mt-1">31 packs, 74 requirements</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs uppercase tracking-widest text-ink-subtle">ISQua</div>
          <div className="text-2xl font-bold mt-1">{isquaPacks.length}</div>
          <div className="text-xs text-ink-muted mt-1">EEA Principles 8th</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs uppercase tracking-widest text-ink-subtle">ISO</div>
          <div className="text-2xl font-bold mt-1">{isoPacks.length}</div>
          <div className="text-xs text-ink-muted mt-1">9001, 15189, 7101, 27001</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs uppercase tracking-widest text-ink-subtle">NABH</div>
          <div className="text-2xl font-bold mt-1">{nabhPacks.length}</div>
          <div className="text-xs text-ink-muted mt-1">Hospital 5th, Eye Care 3rd</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs uppercase tracking-widest text-ink-subtle">JCI</div>
          <div className="text-2xl font-bold mt-1">{jciPacks.length}</div>
          <div className="text-xs text-ink-muted mt-1">Hospital 8th, IPSG 6 goals</div>
        </div>
      </div>

      {/* Dashboard Scores */}
      {dashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="panel p-5">
            <h3 className="font-semibold mb-2">Compliance Score</h3>
            <div className="text-sm">
              <div>Compliant: <span className="font-bold text-green-600">{dashboard.complianceScore?.compliant ?? 0}</span> / {dashboard.complianceScore?.total ?? 0}</div>
              <div className="mt-2 h-2 w-full bg-surface-sunken rounded-full"><div className="h-2 bg-green-600 rounded-full" style={{width: `${((dashboard.complianceScore?.compliant ?? 0) / (dashboard.complianceScore?.total || 1) * 100).toFixed(0)}%`}} /></div>
              <div className="mt-2 text-xs text-ink-muted">Non-Compliant: {dashboard.complianceScore?.non_compliant ?? 0} | Partial: {dashboard.complianceScore?.partial ?? 0}</div>
            </div>
          </div>
          <div className="panel p-5">
            <h3 className="font-semibold mb-2">Incidents</h3>
            <div className="text-sm space-y-1">
              {dashboard.incidents?.slice(0,5).map((inc:any,i:number)=>(
                <div key={i} className="flex justify-between"><span>{inc.type} {inc.severity}</span><span className="badge bg-surface-sunken">{inc.count}</span></div>
              )) ?? <div className="text-ink-muted">No incidents — Good</div>}
            </div>
          </div>
          <div className="panel p-5">
            <h3 className="font-semibold mb-2">Audit Violations</h3>
            <div className="text-sm">
              <div>Break-glass last 30d: <span className="font-bold">{dashboard.auditViolations?.break_glass ?? 0}</span></div>
              <div>Suspicious access: {dashboard.auditViolations?.suspicious_access ?? 0}</div>
              <div className="mt-2 text-xs text-ink-muted">Overdue evidence: {dashboard.overdue?.overdue_count ?? 0}</div>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Packs by Authority */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="panel p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-600" /> ISQua — International Society for Quality</h3>
          <div className="text-xs text-ink-muted mb-3">ISQua EEA Principles 8th Edition — governance, standards development, surveyor competence, evaluation process. ISQua accredits accreditation bodies themselves (e.g., NABH, JCI, ACHC, COHSASA are ISQua EEA accredited). BEYU Health OS implements ISQua principles for external evaluation readiness.</div>
          <div className="space-y-2">
            {isquaPacks.map((p:any)=>(
              <div key={p.id} className="rounded-lg bg-surface-sunken p-3">
                <div className="font-medium text-sm">{p.code} — {p.name}</div>
                <div className="text-xs text-ink-muted mt-1">{p.description?.slice(0,120)}</div>
                <div className="text-xs mt-1">Requirements: {p.requirement_count ?? 0} | Authority: {p.authority} | v{p.version}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-purple-600" /> ISO — Quality, Lab, Security, Healthcare Management</h3>
          <div className="text-xs text-ink-muted mb-3">ISO 9001:2015 QMS, 15189:2022 Medical Labs, 7101:2023 Healthcare Org Management (first consensus standard), 27001:2022 ISMS + 27799 health informatics security, 45001 OH&S, 14001 Environmental.</div>
          <div className="space-y-2 max-h-[300px] overflow-auto">
            {isoPacks.map((p:any)=>(
              <div key={p.id} className="rounded-lg border border-border p-3">
                <div className="font-medium text-sm">{p.code}</div>
                <div className="text-xs">{p.name}</div>
                <div className="text-xs text-ink-muted mt-1">Reqs: {p.requirement_count ?? 0} | {p.config?.type ?? ''} {p.config?.certifiable ? '• Certifiable' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="panel p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-500" /> NABH — National Accreditation Board Hospitals (India)</h3>
          <div className="text-xs text-ink-muted mb-3">NABH 5th Edition Hospital (10 chapters AAC/COP/MOM/PRE/HIC/CQI/ROM/FMS/HRM/IMS, 100 standards, 651 elements), Eye Care 3rd Edition specialized for eye hospitals — first-class support for BEYU Eye & General Hospital ophthalmology-first-class differentiator, Clinic 2nd, Lab 3rd, Emergency 1st.</div>
          <div className="space-y-2">
            {nabhPacks.map((p:any)=>(
              <div key={p.id} className="rounded-lg bg-surface-sunken p-3">
                <div className="font-medium text-sm">{p.code} — {p.name}</div>
                <div className="text-xs text-ink-muted mt-1">{p.description?.slice(0,150)}</div>
                <div className="text-xs mt-1">
                  {p.config?.chapters ? `Chapters: ${p.config.chapters.join(', ')}` : ''}
                  {p.config?.standards ? ` | Standards: ${p.config.standards}` : ''}
                  {p.config?.specialized ? ' • Ophthalmology specialized' : ''}
                </div>
                <div className="mt-2 text-xs">
                  <div className="font-medium">Key Requirements:</div>
                  <ul className="list-disc pl-4 mt-1 text-ink-muted">
                    {p.code==='NABH-HOSPITAL-5TH' && <>
                      <li>AAC: Admission, initial assessment, transfer, discharge</li>
                      <li>COP: Vulnerable patients, care plan, ophthalmology exam protocol VA/refraction/slit-lamp/IOP/fundus</li>
                      <li>MOM: Prescription, dispensing, allergy/interaction checks — BEYU pharmacy safetyCheck enforces</li>
                      <li>HIC: Hand hygiene, BMW, OT sterilization, intravitreal injection protocol</li>
                      <li>IMS: One patient one record, timeline, audit trail — BEYU core differentiator</li>
                    </>}
                    {p.code==='NABH-EYE-CARE-3RD' && <>
                      <li>Comprehensive eye exam: VA unaided/aided/pinhole/near/BCVA, IOP Goldmann/NCT, slit-lamp, gonioscopy, fundus</li>
                      <li>OCT/OCTA, fundus photo, VF, topography quality + PACS</li>
                      <li>Cataract: biometry, IOL calc, OT checklist, outcomes</li>
                      <li>Glaucoma: optic disc, VF, treatment, follow-up</li>
                      <li>DR screening: fundus photo, referral, laser, anti-VEGF</li>
                    </>}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-600" /> JCI — Joint Commission International 8th Edition 2024</h3>
          <div className="text-xs text-ink-muted mb-3">JCI 8th Edition 2024 gold standard 70+ countries, 16 chapters IPSG/ACC/PFR/AOP/COP/ASC/MMU/PFE/QPS/PCI/GLD/FMS/SQE/MOI/Global Health/Climate, 6 IPSG mandatory, new climate + health equity focus. Recognized as ISQua EEA accredited.</div>
          <div className="space-y-2">
            {jciPacks.map((p:any)=>(
              <div key={p.id} className="rounded-lg border border-border p-3">
                <div className="font-medium text-sm">{p.code} — {p.name}</div>
                <div className="text-xs text-ink-muted mt-1">{p.description?.slice(0,150)}</div>
                <div className="text-xs mt-1">
                  {p.config?.chapters ? `Chapters: ${p.config.chapters.slice(0,6).join(', ')}...` : ''}
                  {p.config?.ipsg ? ` | IPSG: ${p.config.ipsg} goals` : ''}
                  {p.config?.recognized_countries ? ` | ${p.config.recognized_countries} countries` : ''}
                </div>
                {p.code==='JCI-HOSPITAL-8TH' && (
                  <div className="mt-2 text-xs">
                    <div className="font-medium">6 IPSG (mandatory core):</div>
                    <ol className="list-decimal pl-4 mt-1 text-ink-muted space-y-0.5">
                      <li>Identify patients correctly — two identifiers, MRN BEYU-YYYY-###### + secondary</li>
                      <li>Improve effective communication — handover SBAR, critical results</li>
                      <li>Improve medication safety — high-alert, LASA, reconciliation, safetyCheck</li>
                      <li>Ensure safe surgery — time-out, site marking, OD/OS/OU laterality confirmed</li>
                      <li>Reduce HAI — hand hygiene, IPC, sterilization</li>
                      <li>Reduce patient harm from falls — Morse assessment, interventions</li>
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tanzania + Africa */}
      <div className="panel p-5 mb-6">
        <h3 className="font-semibold mb-3">Tanzania & Africa — Local Compliance + International Recognition</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">Tanzania Packs</h4>
            <div className="mt-2 space-y-1 text-sm">
              {tzPacks.map((p:any)=>(
                <div key={p.id} className="flex justify-between border-b border-border/50 py-1">
                  <span>{p.code}</span><span className="text-ink-muted">{p.requirement_count ?? 0} reqs</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">Africa — COHSASA</h4>
            <div className="mt-2 text-sm text-ink-muted">
              COHSASA 7th Edition (Council for Health Service Accreditation of Southern Africa) — Africa-focused, ISQua accredited, relevant for Tanzania expansion. BEYU Health OS supports COHSASA hospital accreditation.
            </div>
            <div className="mt-2 text-xs">
              <div>ISQua accredited: Yes</div>
              <div>Region: Africa</div>
              <div>Relevant for TZ: Yes</div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">BEYU Mapping to Standards</h4>
            <div className="mt-2 text-xs text-ink-muted space-y-1">
              <div>• One patient one record → NABH IMS-002, JCI MOI, ISO 27799, ISO 27001</div>
              <div>• Audit hash chain → JCI QPS, NABH CQI, ISO 9001 9.1, ISQua Governance</div>
              <div>• Pharmacy safetyCheck → JCI IPSG-03 MMU, NABH MOM-002</div>
              <div>• Ophthalmology first-class → NABH Eye Care 3rd, NABH-HOSPITAL COP-003</div>
              <div>• RLS tenant isolation → ISO 27001, ISO 27799, JCI MOI privacy</div>
              <div>• MTUHA auto → Tanzania MOH compliance</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-navy-900 p-4 text-white text-xs">
        <div className="font-semibold">Compliance Framework — Configurable Packs, Not Hard-Coded Laws (Spec §22)</div>
        <div className="mt-1 opacity-80">BEYU Health OS does not hard-code one country's laws. Supports configurable compliance packs: Tanzania MOH/MTUHA/NHIF/TMDA/TRA/Data Protection, ISO 9001/15189/7101/27001/27799/45001/14001/15224, ISQua EEA 8th, NABH Hospital 5th Eye Care 3rd Clinic 2nd Lab 3rd Emergency 1st, JCI Hospital 8th Ambulatory 4th Lab 4th Primary Care 1st IPSG, ACHC US, COHSASA Africa 7th — 31 packs, 74 requirements, evidence tracking, incidents, audit violations, dashboard.</div>
        <div className="mt-2">API: GET /api/v1/compliance/packs, /packs/:id/requirements, /evidence/:tenantId POST /evidence, /incidents/:tenantId POST /incidents, /dashboard/:tenantId</div>
      </div>
    </div>
  );
}
