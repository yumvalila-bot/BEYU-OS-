import { type NoeliaOutputType } from './enums';

export interface NoeliaQuery {
  question: string;
  tenantId: string;
  patientId?: string | null;
  contextType?: 'CLINICAL' | 'OPERATIONAL' | 'FINANCIAL' | 'GENERAL';
  purposeOfUse: string;
}

export interface NoeliaResponse {
  id: string;
  type: NoeliaOutputType;
  answer: string;
  confidence?: number | null;
  citations?: Array<{ source: string; reference: string }>;
  warnings?: string[];
  requiresHumanConfirmation: boolean;
  tenantId: string;
  createdAt: string;
}

export interface HiveTask {
  id: string;
  tenantId: string;
  type: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  engine: 'CLINICAL' | 'OPERATIONAL' | 'FINANCIAL' | 'PHARMACY' | 'LABORATORY' | 'RADIOLOGY' | 'OPHTHALMOLOGY' | 'EXECUTIVE' | 'COMPLIANCE' | 'SUPPLY_CHAIN';
  priority: number;
  createdBy: string;
  createdAt: string;
  completedAt?: string | null;
}
