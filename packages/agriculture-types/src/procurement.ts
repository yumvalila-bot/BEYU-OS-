/**
 * Procurement & sales contracts.
 *
 * FINANCE OS BOUNDARY (critical):
 * Purchase orders, sales orders and contracts here are OPERATIONAL
 * AGRICULTURE RECORDS — who bought what, when, from whom, at what agreed
 * price. They are FACTS. Money movement, ledgers, payables/receivables,
 * FX realisation and accounting belong exclusively to BEYU FINANCE OS.
 * Every monetary record here carries `financeStatus` so reconciliation
 * state is explicit and Agriculture OS never becomes a competing ledger.
 */

export interface Supplier {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  status: string;
  createdAt: string;
}

export interface Buyer {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  status: string;
  createdAt: string;
}

export interface OrderLine {
  id: string;
  itemType: string;
  itemId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  currency: string;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  poNumber: string;
  supplierId: string;
  status: string;
  orderDate: string;
  expectedDeliveryOn: string | null;
  currency: string;
  totalAmount: number;
  /** Operational fact only — ledger state lives in Finance OS. */
  financeStatus: string;
  notes: string | null;
  lines: OrderLine[];
  createdAt: string;
  updatedAt: string;
}

export interface SalesOrder {
  id: string;
  tenantId: string;
  soNumber: string;
  buyerId: string;
  status: string;
  orderDate: string;
  storageLotId: string | null;
  currency: string;
  totalAmount: number;
  /** Operational fact only — ledger state lives in Finance OS. */
  financeStatus: string;
  notes: string | null;
  lines: OrderLine[];
  createdAt: string;
  updatedAt: string;
}

export interface TradeContract {
  id: string;
  tenantId: string;
  contractNumber: string;
  counterpartyType: 'SUPPLIER' | 'BUYER';
  counterpartyId: string;
  status: string;
  startDate: string;
  endDate: string | null;
  currency: string;
  contractedValue: number;
  financeStatus: string;
  terms: string | null;
  createdAt: string;
  updatedAt: string;
}
