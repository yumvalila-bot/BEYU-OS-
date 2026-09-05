export interface Warehouse {
  id: string;
  tenantId: string;
  facilityId: string;
  name: string;
  code: string;
  type: 'MAIN' | 'PHARMACY' | 'LAB' | 'THEATRE' | 'GENERAL';
  status: 'ACTIVE' | 'INACTIVE';
}

export interface InventoryItem {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  genericName?: string | null;
  category: string;
  uom: string;
  isDrug: boolean;
  isConsumable: boolean;
  isEquipment: boolean;
  reorderLevel: number;
  createdAt: string;
}

export interface StockBatch {
  id: string;
  tenantId: string;
  itemId: string;
  warehouseId: string;
  batchNumber: string;
  serialNumber?: string | null;
  quantity: number;
  expiryDate?: string | null;
  unitCostMinor?: number | null;
  receivedAt: string;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  itemId: string;
  batchId?: string | null;
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
  type: 'RECEIPT' | 'ISSUE' | 'TRANSFER' | 'ADJUSTMENT' | 'RETURN' | 'WASTAGE' | 'RECALL';
  quantity: number;
  reference?: string | null;
  reason?: string | null;
  performedBy: string;
  performedAt: string;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  poNumber: string;
  supplierId: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  totalMinor: number;
  currency: string;
  orderedAt?: string | null;
  expectedAt?: string | null;
  createdBy: string;
  approvedBy?: string | null;
  createdAt: string;
}
