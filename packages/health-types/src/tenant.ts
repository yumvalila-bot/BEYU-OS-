import { FacilityType, TenantStatus, TenantType } from './enums';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: TenantType;
  status: TenantStatus;
  countryCode: string;
  parentTenantId?: string | null;
  settings: Record<string, unknown>;
  branding: Record<string, unknown>;
  dataResidency: {
    storageRegion: string;
    backupRegion: string;
    processingRegion: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Facility {
  id: string;
  tenantId: string;
  name: string;
  type: FacilityType;
  code: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  operatingHours?: Record<string, unknown> | null;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  parentFacilityId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  facilityId: string;
  name: string;
  code: string;
  specialty?: string | null;
  parentDepartmentId?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export interface Room {
  id: string;
  facilityId: string;
  departmentId?: string | null;
  name: string;
  roomType: 'CONSULTATION' | 'WARD' | 'OPERATING_THEATRE' | 'LABORATORY' | 'IMAGING' | 'PHARMACY' | 'STORAGE' | 'OTHER';
  status: 'AVAILABLE' | 'OCCUPIED' | 'OUT_OF_SERVICE' | 'RESERVED';
}

export interface Bed {
  id: string;
  facilityId: string;
  wardId?: string | null;
  roomId?: string | null;
  bedNumber: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'OUT_OF_SERVICE' | 'CLEANING';
  patientId?: string | null;
}
