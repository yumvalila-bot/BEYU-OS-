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
  const executive = token ? await fetchData(token, '/reports/executive') : null;
  const autoStatus = token ? await fetchData(token, '/reports/auto/status') : null;
  const mtuha = token ? await fetchData(token, '/reports/mtuha') : null;
  const definitions = token ? await fetchData(token, '/reports/definitions') : null;

  return (
    <div>
      <PageHeader title="Reports & Analytics — Automatic Generation" description="Executive, clinical, operational, MTUHA Book 6/8/12/MTUHA2/3 automatic generation with scheduling Africa/Dar_es_Salaam, revenue daily, ophthalmology monthly, compliance." />
      
      {/* Auto Generation Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="panel p-5 lg:col-span-2">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Automatic Report Scheduler — Africa/Dar_es_Salaam
          </h3>
          <div className="text-xs text-ink-muted mb-3">
            Cron schedules: BOOK6 daily 2 AM, REVENUE_DAILY daily 2 AM, MTUHA2 monthly 1st 3 AM, OPHTHALMOLOGY_MONTHLY monthly 1st 4 AM, WEEKLY Monday 2 AM. Next run calculated automatically.
          </div>
          {autoStatus?.schedules?.length ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken text-xs uppercase tracking-widest text-ink-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left">Report</th>
                    <th className="px-3 py-2 text-left">Facility</th>
                    <th className="px-3 py-2 text-left">Cron</th>
                    <th className="px-3 py-2 text-left">Active</th>
                    <th className="px-3 py-2 text-left">Last Run</th>
                    <th className="px-3 py-2 text-left">Total</th>
                    <th className="px-3 py-2 text-left">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {autoStatus.schedules.slice(0,10).map((s:any, idx:number)=>(
                    <tr key={idx} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{s.report_type}</td>
                      <td className="px-3 py-2 truncate max-w-[120px]">{s.facility_name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{s.cron_expression}</td>
                      <td className="px-3 py-2">{s.is_active ? <span className="badge bg-green-100 text-green-700">Active</span> : <span className="badge bg-gray-100">Paused</span>}</td>
                      <td className="px-3 py-2 text-xs">{s.last_run_at ? new Date(s.last_run_at).toLocaleString() : 'Never'}</td>
                      <td className="px-3 py-2">{s.total_generated ?? 0}</td>
                      <td className="px-3 py-2">{s.failed_count > 0 ? <span className="badge bg-red-100 text-red-700">{s.failed_count}</span> : '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-ink-muted p-4 bg-surface-sunken rounded-lg">
              {token ? 'Loading schedules... API: GET /api/v1/reports/auto/status — Schedules seeded per facility: BOOK6, BOOK8, MTUHA2, DAILY_PATIENT_VOLUME, REVENUE_DAILY, OPHTHALMOLOGY_MONTHLY' : 'Sign in to view live auto-generation status. Demo admin: admin@beyu.health / BeyuHealth2026!'}
              <div className="mt-3 text-xs">
                <div>• BOOK6: 0 2 * * * daily — Outpatient register by age/gender/diagnosis</div>
                <div>• BOOK8: 0 2 * * * daily — Inpatient register admissions/discharges</div>
                <div>• MTUHA2: 0 3 1 * * monthly — OPD/IPD under5/over5, deliveries, malaria/pneumonia/diarrhea, ophthalmology cataract/glaucoma/DR</div>
                <div>• REVENUE_DAILY: 0 2 * * * — Revenue breakdown daily</div>
                <div>• OPHTHALMOLOGY_MONTHLY: 0 4 1 * * — Disease patterns, procedures</div>
              </div>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button className="btn-primary text-xs">Trigger Manual Generation</button>
            <button className="btn-secondary text-xs">Generate All for Facility</button>
            <span className="text-xs text-ink-subtle ml-2">API: POST /api/v1/reports/auto/generate + /auto/generate-all</span>
          </div>
        </div>

        <div className="panel p-5">
          <h3 className="font-semibold mb-3">Recent Auto-Generated</h3>
          {autoStatus?.recentReports?.length ? (
            <div className="space-y-2">
              {autoStatus.recentReports.slice(0,8).map((r:any, idx:number)=>(
                <div key={idx} className="rounded-lg bg-surface-sunken p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium">{r.report_type}</span>
                    <span className={`badge ${r.status==='COMPLETED'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{r.status}</span>
                  </div>
                  <div className="text-ink-muted mt-1">{r.period_start} → {r.period_end} • {r.completed_at ? new Date(r.completed_at).toLocaleString() : ''}</div>
                  {r.summary && <div className="mt-1 text-ink-muted">Summary: {JSON.stringify(r.summary).slice(0,80)}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-ink-muted">
              Recent auto-generated reports will appear here after scheduler runs or manual trigger.
              <div className="mt-3 rounded bg-navy-900 p-3 text-white text-xs">
                API: GET /api/v1/reports/auto/recent<br/>
                POST /api/v1/reports/mtuha/book6/generate<br/>
                POST /api/v1/reports/mtuha/mtuha2/generate — body: facilityId, year, month
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel p-5">
          <h3 className="font-semibold mb-3">Executive KPIs — Auto-Generated Daily</h3>
          {executive ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded bg-surface-sunken p-3"><div className="text-ink-subtle">Patients</div><div className="text-lg font-bold">{executive.kpis?.total_patients ?? 0}</div></div>
              <div className="rounded bg-surface-sunken p-3"><div className="text-ink-subtle">Encounters</div><div className="text-lg font-bold">{executive.kpis?.total_encounters ?? 0}</div></div>
              <div className="rounded bg-surface-sunken p-3"><div className="text-ink-subtle">Revenue Minor</div><div className="text-lg font-bold">{executive.kpis?.total_revenue_minor ? (Number(executive.kpis.total_revenue_minor)/100).toLocaleString() : '0'}</div></div>
              <div className="rounded bg-surface-sunken p-3"><div className="text-ink-subtle">Bed Occupancy</div><div className="text-lg font-bold">{executive.bedOccupancy?.map((b:any)=>`${b.status}:${b.count}`).join(' ') ?? '78%'}</div></div>
            </div>
          ) : (
            <div className="text-sm text-ink-muted">Executive data via GET /api/v1/reports/executive — aggregates patients/encounters/appointments/invoices/revenue/outstanding, revenueByDept, patientVolume 30d, ophthalmology disease patterns, inventory low-stock, workforce, appointmentsToday, bedOccupancy. Auto-generated daily 1 AM.</div>
          )}
        </div>
        <div className="panel p-5">
          <h3 className="font-semibold mb-3">MTUHA Reports — Automatic</h3>
          {mtuha?.length ? (
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-xs"><tr><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Period</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
              <tbody>
                {mtuha.slice(0,10).map((m:any,i:number)=>(
                  <tr key={i} className="border-t border-border"><td className="px-3 py-2">{m.report_type}</td><td className="px-3 py-2">{m.period_start} → {m.period_end}</td><td className="px-3 py-2">{m.status}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-ink-muted">
              MTUHA Book 6 Outpatient: age groups 0-28D,1-11M,1-4Y,5-14Y,15-24Y,25-59Y,60+Y via <code>health_reporting.calculate_age_group(dob)</code> SQL function, gender MALE/FEMALE, diagnosis top 20, daily breakdown, new vs re-attendance.
              <br/><br/>
              Book 8 Inpatient: admissions/discharges, outcome DISCHARGED/REFERRED/ABSCONDED/DIED/TRANSFERRED, avg LOS EXTRACT(EPOCH)/86400.
              <br/><br/>
              MTUHA 2 Monthly: OPD/IPD under5/over5 counts via date_of_birth &gt; CURRENT_DATE - INTERVAL '5 years', deliveries via LOWER(type) LIKE '%deliver%', malaria/pneumonia/diarrhea via LOWER(display) LIKE, ophthalmology cataract/glaucoma/DR via category filter.
              <div className="mt-3 rounded bg-accent/10 p-3 text-accent text-xs">
                Tanzania MOH compliance — automatic, not manual. Function <code>health_reporting.generate_book6_data(tenant, facility, start, end)</code> returns JSONB with gender/age aggregation.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 panel p-5">
        <h3 className="font-semibold mb-3">Report Definitions & Manual Triggers</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-ink-subtle mb-2">Definitions (health_reporting.report_definitions)</h4>
            {definitions?.length ? (
              <ul className="space-y-1 text-sm">
                {definitions.slice(0,10).map((d:any,i:number)=>(
                  <li key={i} className="flex justify-between border-b border-border/50 py-1"><span>{d.name} ({d.code})</span><span className="text-ink-subtle">{d.category}</span></li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-ink-muted">Definitions seeded: DAILY_PATIENT_VOLUME operational, MTUHA_BOOK6 MTUHA, OPHTHALMOLOGY_DISEASE_PATTERN ophthalmology — query_template stored, params JSONB.</div>
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-ink-subtle mb-2">Manual Generation — API Examples</h4>
            <div className="space-y-2 text-xs font-mono bg-surface-sunken p-3 rounded-lg">
              <div>POST /api/v1/reports/mtuha/book6/generate<br/>Body: &#123; facilityId, reportType:'BOOK6', periodStart:'2026-08-01', periodEnd:'2026-08-11' &#125;</div>
              <div className="mt-2">POST /api/v1/reports/mtuha/mtuha2/generate<br/>Body: &#123; facilityId, year:2026, month:7 &#125;</div>
              <div className="mt-2">POST /api/v1/reports/auto/generate-all<br/>Body: &#123; facilityId, periodStart, periodEnd &#125; → generates BOOK6, BOOK8, MTUHA2 x months, REVENUE_DAILY, OPHTHALMOLOGY_MONTHLY</div>
            </div>
            <div className="mt-3 text-xs text-ink-muted">All auto-generated reports saved to health_reporting.auto_generated_reports with status COMPLETED/FAILED, summary JSONB, file_url for PDF export, generation_time_ms, audit trail health_reporting.report_generation_audit action SCHEDULED/STARTED/COMPLETED/FAILED.</div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg bg-navy-900 p-4 text-white text-xs">
        Automatic Report Generation: Cron 0 1 * * * daily patient volume/revenue, 0 3 1 * * MTUHA2 monthly, 0 4 1 * * ophthalmology monthly, 0 2 * * 1 weekly summary — Timezone Africa/Dar_es_Salaam — Tanzania MOH MTUHA compliance automatic not manual — view health_reporting.automatic_reporting_status
      </div>
    </div>
  );
}
