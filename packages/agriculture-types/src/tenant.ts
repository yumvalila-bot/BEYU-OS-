/** Tenant contracts — the agriculture enterprise boundary. */

export interface AgriTenant {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  countryCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgriTenantInput {
  name: string;
  slug: string;
  type: string;
  countryCode: string;
  parentTenantId?: string | null;
}
