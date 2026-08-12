export interface CreatePatientDto {
  firstName: string;
  lastName: string;
  middleName?: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  dateOfBirth: string;
  phone?: string;
  email?: string;
  nationalId?: string;
  address?: string;
  bloodGroup?: string;
  emergencyContacts?: Array<{ name: string; relationship: string; phone: string; isPrimary?: boolean }>;
}

export interface CreateEncounterDto {
  patientId: string;
  facilityId: string;
  departmentId?: string;
  practitionerId?: string;
  class: 'AMBULATORY' | 'EMERGENCY' | 'INPATIENT' | 'OUTPATIENT' | 'HOME' | 'VIRTUAL' | 'FIELD';
  type?: string;
  reason?: string;
  priority?: 'ROUTINE' | 'URGENT' | 'ASAP' | 'STAT';
}

export interface CreateAppointmentDto {
  patientId: string;
  facilityId: string;
  practitionerId?: string;
  departmentId?: string;
  start: string;
  end: string;
  reason?: string;
  serviceType?: string;
  isTelemedicine?: boolean;
  isWalkIn?: boolean;
}

export interface CreatePrescriptionDto {
  patientId: string;
  encounterId?: string;
  drugId: string;
  dosageInstruction: string;
  quantity: number;
  unit: string;
  durationDays?: number;
  priority?: 'ROUTINE' | 'URGENT' | 'ASAP' | 'STAT';
  note?: string;
}

export interface CreateLabOrderDto {
  patientId: string;
  encounterId?: string;
  tests: string[];
  priority?: 'ROUTINE' | 'URGENT' | 'STAT';
  clinicalInfo?: string;
}

export interface CreateImagingOrderDto {
  patientId: string;
  encounterId?: string;
  modality: string;
  bodySite?: string;
  indication?: string;
  priority?: 'ROUTINE' | 'URGENT' | 'STAT';
}

export interface CreateOphthalmologyExamDto {
  patientId: string;
  encounterId: string;
  chiefComplaint?: string;
  visualAcuity?: Array<{ eye: 'OD' | 'OS' | 'OU'; unaidedDistance?: string; aidedDistance?: string; pinhole?: string; nearVision?: string; bcva?: string }>;
  refraction?: Array<{ eye: 'OD' | 'OS'; sphere?: number; cylinder?: number; axis?: number; add?: number; type?: string }>;
  iop?: Array<{ eye: 'OD' | 'OS' | 'OU'; valueMmhg: number; method: string }>;
  slitLamp?: Array<{ eye: 'OD' | 'OS'; cornea?: string; lens?: string; notes?: string }>;
  fundus?: Array<{ eye: 'OD' | 'OS'; opticDisc?: string; macula?: string; retina?: string }>;
  diagnoses?: Array<{ eye: 'OD' | 'OS' | 'OU'; code: string; display: string; category: string }>;
  plan?: string;
}

export interface CreateInvoiceDto {
  patientId: string;
  encounterId?: string;
  lines: Array<{ description: string; quantity: number; unitPriceMinor: number; serviceId?: string }>;
  discountMinor?: number;
}
