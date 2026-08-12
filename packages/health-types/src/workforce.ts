export interface Practitioner {
  id: string;
  tenantId: string;
  userId?: string | null;
  code: string;
  firstName: string;
  lastName: string;
  gender?: string | null;
  specialty?: string | null;
  qualification?: string | null;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
  phone?: string | null;
  email?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: string;
}

export interface PractitionerRole {
  id: string;
  practitionerId: string;
  facilityId: string;
  departmentId?: string | null;
  role: string;
  isPrimary: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Shift {
  id: string;
  tenantId: string;
  practitionerId: string;
  facilityId: string;
  departmentId?: string | null;
  start: string;
  end: string;
  type: 'DAY' | 'NIGHT' | 'ON_CALL' | 'LEAVE';
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}
