/**
 * @beyu/health-api-client — typed client for BEYU HEALTH OS API
 * Single source using @beyu/health-types contracts, no duplicate DTOs.
 */

export interface ClientOptions {
  baseUrl: string;
  token?: string;
  tenantId?: string;
  requestId?: string;
}

export class HealthApiClient {
  constructor(private readonly opts: ClientOptions) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as any),
    };
    if (this.opts.token) headers['Authorization'] = `Bearer ${this.opts.token}`;
    if (this.opts.tenantId) headers['X-Tenant-ID'] = this.opts.tenantId;
    if (this.opts.requestId) headers['X-Request-ID'] = this.opts.requestId;
    const res = await fetch(`${this.opts.baseUrl}/api/v1${path}`, { ...init, headers } as any);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Health API ${res.status} ${path}: ${text.slice(0,800)}`);
    }
    return res.json() as Promise<T>;
  }

  // Auth
  auth = {
    login: (email: string, password: string, tenantId?: string) => this.request<{ accessToken: string; refreshToken: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, tenantId }) }),
    me: () => this.request('/auth/me'),
  };

  // Patients
  patients = {
    list: (q?: { q?: string; limit?: number; offset?: number }) => {
      const params = new URLSearchParams();
      if (q?.q) params.set('q', q.q);
      if (q?.limit) params.set('limit', String(q.limit));
      if (q?.offset) params.set('offset', String(q.offset));
      return this.request(`/patients?${params.toString()}`);
    },
    get: (id: string) => this.request(`/patients/${id}`),
    timeline: (id: string) => this.request(`/patients/${id}/timeline`),
    create: (data: any) => this.request('/patients', { method: 'POST', body: JSON.stringify(data) }),
  };

  // Clinical
  clinical = {
    encounters: (q?: any) => {
      const params = new URLSearchParams(q);
      return this.request(`/clinical/encounters?${params.toString()}`);
    },
    encounter: (id: string) => this.request(`/clinical/encounters/${id}`),
    createEncounter: (data: any) => this.request('/clinical/encounters', { method: 'POST', body: JSON.stringify(data) }),
    createNote: (data: any) => this.request('/clinical/notes', { method: 'POST', body: JSON.stringify(data) }),
    vitals: (patientId: string) => this.request(`/clinical/vitals/${patientId}`),
  };

  // Ophthalmology
  ophthalmology = {
    exams: (q?: any) => {
      const params = new URLSearchParams(q);
      return this.request(`/ophthalmology/exams?${params.toString()}`);
    },
    exam: (id: string) => this.request(`/ophthalmology/exams/${id}`),
    createExam: (data: any) => this.request('/ophthalmology/exams', { method: 'POST', body: JSON.stringify(data) }),
    diseasePatterns: () => this.request('/ophthalmology/analytics/disease-patterns'),
  };

  // Pharmacy
  pharmacy = {
    drugs: (q?: string) => this.request(`/pharmacy/drugs?q=${encodeURIComponent(q ?? '')}`),
    prescriptions: (patientId?: string) => this.request(`/pharmacy/prescriptions?patientId=${patientId ?? ''}`),
    safety: (patientId: string, drugId: string) => this.request(`/pharmacy/safety/${patientId}/${drugId}`),
  };

  // Lab
  laboratory = {
    catalog: (q?: string) => this.request(`/laboratory/catalog?q=${encodeURIComponent(q ?? '')}`),
    orders: (patientId?: string) => this.request(`/laboratory/orders?patientId=${patientId ?? ''}`),
  };

  // Billing
  billing = {
    invoices: (q?: any) => {
      const params = new URLSearchParams(q);
      return this.request(`/billing/invoices?${params.toString()}`);
    },
    revenue: (period?: string) => this.request(`/billing/reports/revenue?period=${period ?? 'month'}`),
  };

  // Reports
  reports = {
    executive: () => this.request('/reports/executive'),
    clinical: () => this.request('/reports/clinical'),
    operational: () => this.request('/reports/operational'),
  };

  // AI
  ai = {
    ask: (question: string, purposeOfUse: string, patientId?: string) => this.request('/ai/noelia/ask', { method: 'POST', body: JSON.stringify({ question, purposeOfUse, patientId }) }),
    conversations: () => this.request('/ai/noelia/conversations'),
  };

  // Tenants
  tenants = {
    list: () => this.request('/tenants'),
    get: (id: string) => this.request(`/tenants/${id}`),
    stats: (id: string) => this.request(`/tenants/${id}/stats`),
  };
  // Inventory
  inventory = {
    items: (q?: string) => this.request(`/inventory/items?q=${encodeURIComponent(q ?? '')}`),
    lowStock: () => this.request('/inventory/low-stock'),
    warehouses: () => this.request('/inventory/warehouses'),
  };
  // Workforce
  workforce = {
    practitioners: (q?: string) => this.request(`/workforce/practitioners?q=${encodeURIComponent(q ?? '')}`),
  };
}

export const HEALTH_API_VERSION = '1.0.0';
