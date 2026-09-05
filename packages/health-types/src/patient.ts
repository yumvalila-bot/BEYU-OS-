import { PatientGender } from './enums';

export interface Patient {
  id: string;
  tenantId: string;
  mrn: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  gender: PatientGender;
  dateOfBirth: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  nationality?: string | null;
  nationalId?: string | null;
  bloodGroup?: string | null;
  preferredLanguage: string;
  photoUrl?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'DECEASED' | 'MERGED';
  deceasedDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientIdentifier {
  id: string;
  patientId: string;
  system: string;
  value: string;
  type?: string | null;
}

export interface EmergencyContact {
  id: string;
  patientId: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string | null;
  isPrimary: boolean;
}

export interface PatientRelationship {
  id: string;
  patientId: string;
  relatedPatientId?: string | null;
  relatedPersonName?: string | null;
  relationshipType: string;
}

export interface Consent {
  id: string;
  patientId: string;
  type: 'GENERAL' | 'TREATMENT' | 'DATA_SHARING' | 'RESEARCH' | 'MARKETING';
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  grantedAt: string;
  expiresAt?: string | null;
  grantedBy: string;
  documentId?: string | null;
}
