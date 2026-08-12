import { type AllergyCriticality, type EncounterClass, type EncounterStatus } from './enums';

export interface Allergy {
  id: string;
  patientId: string;
  tenantId: string;
  code?: string | null;
  display: string;
  criticality: AllergyCriticality;
  type: 'ALLERGY' | 'INTOLERANCE';
  category?: string | null;
  recordedDate: string;
  recorderId: string;
  note?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'RESOLVED';
}

export interface Condition {
  id: string;
  patientId: string;
  tenantId: string;
  code: string;
  display: string;
  system: 'ICD-10' | 'ICD-11' | 'SNOMED-CT' | 'CUSTOM';
  clinicalStatus: 'ACTIVE' | 'RECURRENCE' | 'RELAPSE' | 'INACTIVE' | 'REMISSION' | 'RESOLVED';
  verificationStatus: 'UNCONFIRMED' | 'PROVISIONAL' | 'DIFFERENTIAL' | 'CONFIRMED' | 'REFUTED' | 'ENTERED_IN_ERROR';
  category?: string | null;
  severity?: 'MILD' | 'MODERATE' | 'SEVERE' | null;
  onsetDate?: string | null;
  abatementDate?: string | null;
  recordedDate: string;
  recorderId: string;
}

export interface Observation {
  id: string;
  patientId: string;
  encounterId?: string | null;
  tenantId: string;
  code: string;
  display: string;
  system?: string | null;
  valueQuantity?: { value: number; unit: string } | null;
  valueString?: string | null;
  valueBoolean?: boolean | null;
  interpretation?: string | null;
  effectiveDateTime: string;
  status: 'REGISTERED' | 'PRELIMINARY' | 'FINAL' | 'AMENDED' | 'CANCELLED';
  performerId?: string | null;
}

export interface VitalSign {
  id: string;
  patientId: string;
  encounterId?: string | null;
  tenantId: string;
  type: 'BLOOD_PRESSURE' | 'HEART_RATE' | 'TEMPERATURE' | 'RESPIRATORY_RATE' | 'SPO2' | 'WEIGHT' | 'HEIGHT' | 'BMI' | 'OTHER';
  systolic?: number | null;
  diastolic?: number | null;
  value: number;
  unit: string;
  recordedAt: string;
  recordedBy: string;
}

export interface Encounter {
  id: string;
  patientId: string;
  tenantId: string;
  facilityId: string;
  departmentId?: string | null;
  practitionerId?: string | null;
  class: EncounterClass;
  status: EncounterStatus;
  type?: string | null;
  priority?: 'ROUTINE' | 'URGENT' | 'ASAP' | 'STAT' | null;
  reason?: string | null;
  periodStart: string;
  periodEnd?: string | null;
  bedId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalNote {
  id: string;
  patientId: string;
  encounterId?: string | null;
  tenantId: string;
  authorId: string;
  type: 'PROGRESS' | 'ADMISSION' | 'DISCHARGE' | 'PROCEDURE' | 'CONSULTATION' | 'NURSING' | 'OTHER';
  title: string;
  content: string;
  status: 'DRAFT' | 'FINAL' | 'AMENDED' | 'ENTERED_IN_ERROR';
  confidentiality?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CarePlan {
  id: string;
  patientId: string;
  tenantId: string;
  title: string;
  description?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'REVOKED' | 'COMPLETED' | 'ENTERED_IN_ERROR';
  intent: 'PROPOSAL' | 'PLAN' | 'ORDER' | 'OPTION';
  periodStart?: string | null;
  periodEnd?: string | null;
  authorId: string;
  createdAt: string;
}

export interface Procedure {
  id: string;
  patientId: string;
  encounterId?: string | null;
  tenantId: string;
  code: string;
  display: string;
  status: 'PREPARATION' | 'IN_PROGRESS' | 'NOT_DONE' | 'ON_HOLD' | 'STOPPED' | 'COMPLETED' | 'ENTERED_IN_ERROR' | 'UNKNOWN';
  performedDateTime?: string | null;
  performerId?: string | null;
  note?: string | null;
}
