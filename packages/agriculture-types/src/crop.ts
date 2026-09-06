/** Crop catalogue, crop cycles, field activities, harvests and storage. */

export interface Crop {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  scientificName: string | null;
  category: string;
  growingDaysMin: number | null;
  growingDaysMax: number | null;
  status: string;
  createdAt: string;
}

export interface CreateCropInput {
  tenantId: string;
  code: string;
  name: string;
  scientificName?: string | null;
  category: string;
  growingDaysMin?: number | null;
  growingDaysMax?: number | null;
}

/** One season of one crop on one field. */
export interface CropCycle {
  id: string;
  tenantId: string;
  fieldId: string;
  cropId: string;
  seasonCode: string;
  status: string;
  plantedOn: string | null;
  expectedHarvestOn: string | null;
  harvestedOn: string | null;
  areaPlantedHa: number | null;
  seedRateKgPerHa: number | null;
  targetYieldTonsPerHa: number | null;
  actualYieldTonsPerHa: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCropCycleInput {
  tenantId: string;
  fieldId: string;
  cropId: string;
  seasonCode: string;
  plantedOn?: string | null;
  expectedHarvestOn?: string | null;
  areaPlantedHa?: number | null;
  seedRateKgPerHa?: number | null;
  targetYieldTonsPerHa?: number | null;
}

export interface FieldActivity {
  id: string;
  tenantId: string;
  cropCycleId: string | null;
  fieldId: string;
  activityType: string;
  status: string;
  scheduledOn: string | null;
  performedOn: string | null;
  performedByUserId: string | null;
  /** Operational cost — a FACT for Finance OS, never a posting. */
  costAmount: number | null;
  costCurrency: string | null;
  financeStatus: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFieldActivityInput {
  tenantId: string;
  fieldId: string;
  cropCycleId?: string | null;
  activityType: string;
  scheduledOn?: string | null;
  performedOn?: string | null;
  costAmount?: number | null;
  costCurrency?: string | null;
  notes?: string | null;
}

export interface Harvest {
  id: string;
  tenantId: string;
  cropCycleId: string;
  fieldId: string;
  status: string;
  harvestedOn: string;
  quantityKg: number;
  moisturePct: number | null;
  qualityGrade: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateHarvestInput {
  tenantId: string;
  cropCycleId: string;
  harvestedOn: string;
  quantityKg: number;
  moisturePct?: number | null;
  qualityGrade?: string | null;
  notes?: string | null;
}

/** A tracked lot of harvested produce in a warehouse. */
export interface StorageLot {
  id: string;
  tenantId: string;
  harvestId: string | null;
  warehouseId: string;
  lotCode: string;
  cropId: string | null;
  quantityKg: number;
  quantityReleasedKg: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}
