/** Equipment, maintenance, fuel and workforce contracts. */

export interface Equipment {
  id: string;
  tenantId: string;
  farmId: string | null;
  code: string;
  name: string;
  equipmentType: string;
  status: string;
  purchaseDate: string | null;
  purchaseCost: number | null;
  currency: string | null;
  operatingHours: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceLog {
  id: string;
  tenantId: string;
  equipmentId: string;
  maintenanceType: string;
  performedOn: string;
  performedBy: string | null;
  costAmount: number | null;
  costCurrency: string | null;
  hoursAtService: number | null;
  notes: string | null;
  createdAt: string;
}

export interface FuelLog {
  id: string;
  tenantId: string;
  equipmentId: string;
  fueledOn: string;
  fuelLitres: number;
  hoursAtFueling: number | null;
  costAmount: number | null;
  costCurrency: string | null;
  notes: string | null;
  createdAt: string;
}

export interface FarmWorker {
  id: string;
  tenantId: string;
  farmId: string | null;
  workerCode: string;
  fullName: string;
  phone: string | null;
  role: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrder {
  id: string;
  tenantId: string;
  farmId: string | null;
  fieldId: string | null;
  workOrderNumber: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  assignedToWorkerId: string | null;
  scheduledFor: string | null;
  completedOn: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
