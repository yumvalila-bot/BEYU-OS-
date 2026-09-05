export enum HealthRole {
  SuperAdmin = 'SUPER_ADMIN',
  TenantAdmin = 'TENANT_ADMIN',
  FacilityAdmin = 'FACILITY_ADMIN',
  Doctor = 'DOCTOR',
  ClinicalOfficer = 'CLINICAL_OFFICER',
  Nurse = 'NURSE',
  Optometrist = 'OPTOMETRIST',
  Ophthalmologist = 'OPHTHALMOLOGIST',
  Pharmacist = 'PHARMACIST',
  LabScientist = 'LABORATORY_SCIENTIST',
  Radiologist = 'RADIOLOGIST',
  Radiographer = 'RADIOGRAPHER',
  Receptionist = 'RECEPTIONIST',
  Cashier = 'CASHIER',
  Accountant = 'ACCOUNTANT',
  ProcurementOfficer = 'PROCUREMENT_OFFICER',
  Storekeeper = 'STOREKEEPER',
  AmbulanceCrew = 'AMBULANCE_CREW',
  Executive = 'EXECUTIVE',
  Patient = 'PATIENT',
  Auditor = 'AUDITOR',
}

export interface HealthUser {
  id: string;
  identityId: string;
  email: string;
  phone?: string | null;
  displayName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED' | 'DISABLED';
  mfaEnabled: boolean;
  roles: HealthRole[];
  tenantId?: string | null;
  facilityIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TenantMembership {
  id: string;
  userId: string;
  tenantId: string;
  role: HealthRole;
  facilityId?: string | null;
  departmentId?: string | null;
  status: 'ACTIVE' | 'INVITED' | 'REVOKED';
  grantedAt: string;
  expiresAt?: string | null;
}
