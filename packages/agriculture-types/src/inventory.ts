/** Inventory contracts — warehouses, inputs, stock movements, storage lots. */

export interface Warehouse {
  id: string;
  tenantId: string;
  farmId: string | null;
  code: string;
  name: string;
  warehouseType: string;
  /** Cold-chain flag — cold stores gate which produce may be stored. */
  isColdStore: boolean;
  capacityKg: number | null;
  status: string;
  createdAt: string;
}

export interface InputItem {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  manufacturer: string | null;
  /** Restricted inputs (e.g. controlled pesticides) require justification on issuance. */
  isRestricted: boolean;
  status: string;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  warehouseId: string;
  inputItemId: string | null;
  storageLotId: string | null;
  movementType: string;
  quantity: number;
  unit: string;
  referenceType: string | null;
  referenceId: string | null;
  occurredOn: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}
