import { type ImagingModality } from './enums';

export interface ImagingOrder {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId?: string | null;
  ordererId: string;
  modality: ImagingModality;
  bodySite?: string | null;
  view?: string | null;
  indication?: string | null;
  priority: 'ROUTINE' | 'URGENT' | 'STAT';
  status: 'DRAFT' | 'ACTIVE' | 'REVOKED' | 'COMPLETED';
  scheduledAt?: string | null;
  orderedAt: string;
}

export interface ImagingStudy {
  id: string;
  tenantId: string;
  orderId: string;
  patientId: string;
  modality: ImagingModality;
  startedAt: string;
  completedAt?: string | null;
  performerId?: string | null;
  status: 'REGISTERED' | 'AVAILABLE' | 'CANCELLED' | 'ENTERED_IN_ERROR' | 'UNKNOWN';
  numberOfSeries: number;
  numberOfInstances: number;
  studyInstanceUid?: string | null;
  pacsUrl?: string | null;
}

export interface ImagingReport {
  id: string;
  tenantId: string;
  studyId: string;
  patientId: string;
  authorId: string;
  status: 'PRELIMINARY' | 'FINAL' | 'AMENDED' | 'CANCELLED';
  findings: string;
  impression: string;
  conclusion?: string | null;
  reportedAt: string;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}
