/** Livestock contracts — herds, animals, health events, production. */

export interface Herd {
  id: string;
  tenantId: string;
  farmId: string;
  code: string;
  name: string;
  species: string;
  notes: string | null;
  createdAt: string;
}

export interface Animal {
  id: string;
  tenantId: string;
  herdId: string | null;
  tagNumber: string;
  species: string;
  breed: string | null;
  sex: string;
  dateOfBirth: string | null;
  status: string;
  acquisitionDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnimalHealthEvent {
  id: string;
  tenantId: string;
  animalId: string;
  eventType: string;
  eventDate: string;
  veterinarian: string | null;
  treatment: string | null;
  withdrawalDays: number | null;
  costAmount: number | null;
  costCurrency: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ProductionRecord {
  id: string;
  tenantId: string;
  herdId: string | null;
  animalId: string | null;
  productionType: string;
  recordedOn: string;
  quantity: number;
  unit: string;
  notes: string | null;
  createdAt: string;
}
