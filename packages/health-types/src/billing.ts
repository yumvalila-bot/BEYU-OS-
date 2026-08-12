export interface ServiceItem {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  category: string;
  unitPriceMinor: number;
  currency: string;
  taxRateBps?: number | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Invoice {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId?: string | null;
  invoiceNumber: string;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIALLY_PAID' | 'VOIDED' | 'OVERDUE';
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  issuedAt?: string | null;
  dueDate?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  serviceId?: string | null;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface Payment {
  id: string;
  tenantId: string;
  invoiceId: string;
  amountMinor: number;
  currency: string;
  method: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'INSURANCE' | 'OTHER';
  reference?: string | null;
  paidAt: string;
  receivedBy: string;
}

export interface InsurancePayer {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  type: 'NHIF' | 'PRIVATE' | 'CORPORATE' | 'GOVERNMENT' | 'OTHER';
  contactInfo?: Record<string, unknown> | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface InsuranceClaim {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId?: string | null;
  payerId: string;
  claimNumber: string;
  status: 'DRAFT' | 'SUBMITTED' | 'ADJUDICATING' | 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED' | 'PAID';
  totalMinor: number;
  approvedMinor?: number | null;
  submittedAt?: string | null;
  adjudicatedAt?: string | null;
  createdAt: string;
}
