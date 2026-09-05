import { MedicationRequestStatus } from './enums';

export interface Drug {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  genericName?: string | null;
  form: string;
  strength: string;
  manufacturer?: string | null;
  category?: string | null;
  isControlled: boolean;
  requiresPrescription: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';
  createdAt: string;
}

export interface MedicationRequest {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId?: string | null;
  prescriberId: string;
  drugId: string;
  status: MedicationRequestStatus;
  intent: 'PROPOSAL' | 'PLAN' | 'ORDER' | 'ORIGINAL_ORDER' | 'REFLEX_ORDER' | 'FILLER_ORDER' | 'INSTANCE_ORDER' | 'OPTION';
  priority: 'ROUTINE' | 'URGENT' | 'ASAP' | 'STAT';
  dosageInstruction: string;
  quantity: number;
  unit: string;
  durationDays?: number | null;
  note?: string | null;
  authoredOn: string;
  dispenseRequestId?: string | null;
}

export interface MedicationDispense {
  id: string;
  tenantId: string;
  requestId: string;
  patientId: string;
  drugId: string;
  dispenserId: string;
  quantity: number;
  unit: string;
  batchNumber?: string | null;
  expiryDate?: string | null;
  status: 'PREPARATION' | 'IN_PROGRESS' | 'CANCELLED' | 'ON_HOLD' | 'COMPLETED' | 'ENTERED_IN_ERROR' | 'STOPPED' | 'DECLINED';
  dispensedAt: string;
  note?: string | null;
}

export interface PrescriptionSafetyCheck {
  allergyFound: boolean;
  duplicateFound: boolean;
  interactionFound: boolean;
  doseWarning?: string | null;
  contraindicationFound: boolean;
  details: Array<{ type: string; severity: string; message: string }>;
}
