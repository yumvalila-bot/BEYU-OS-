import { type LabOrderStatus, type LabResultStatus } from './enums';

export interface LabTest {
  id: string;
  tenantId: string;
  code: string;
  loincCode?: string | null;
  name: string;
  category: string;
  specimenType?: string | null;
  turnaroundHours?: number | null;
  priceMinor?: number | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface LabOrder {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId?: string | null;
  ordererId: string;
  status: LabOrderStatus;
  priority: 'ROUTINE' | 'URGENT' | 'STAT';
  tests: Array<{ testId: string; testCode: string }>;
  clinicalInfo?: string | null;
  orderedAt: string;
  collectedAt?: string | null;
  receivedAt?: string | null;
}

export interface Specimen {
  id: string;
  tenantId: string;
  patientId: string;
  orderId: string;
  type: string;
  collectedAt: string;
  collectedBy: string;
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'UNSATISFACTORY' | 'ENTERED_IN_ERROR';
  accessionNumber?: string | null;
  containerId?: string | null;
}

export interface LabResult {
  id: string;
  tenantId: string;
  orderId: string;
  specimenId?: string | null;
  testId: string;
  patientId: string;
  status: LabResultStatus;
  valueQuantity?: { value: number; unit: string } | null;
  valueString?: string | null;
  interpretation?: 'NORMAL' | 'ABNORMAL' | 'CRITICAL' | 'HIGH' | 'LOW' | null;
  referenceRange?: { low?: number; high?: number; text?: string } | null;
  isCritical: boolean;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  performedAt: string;
}
