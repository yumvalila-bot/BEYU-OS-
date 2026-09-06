/**
 * Canonical enums for BEYU AGRICULTURE OS.
 * SINGLE SOURCE OF TRUTH for sector domain vocabulary.
 *
 * BEYU FAMILY TRUST → BEYU HOLDINGS → COUNTRY HOLDING →
 * AGRICULTURE SECTOR COMPANY → AGRICULTURE OS → tenants/entities/users.
 */

export enum AgriTenantType {
  AgribusinessGroup = 'AGRIBUSINESS_GROUP',
  CommercialFarm = 'COMMERCIAL_FARM',
  Cooperative = 'COOPERATIVE',
  SmallholderAssociation = 'SMALLHOLDER_ASSOCIATION',
  ContractFarmingScheme = 'CONTRACT_FARMING_SCHEME',
  ProcessingCompany = 'PROCESSING_COMPANY',
  Exporter = 'EXPORTER',
  ResearchInstitute = 'RESEARCH_INSTITUTE',
}

export enum AgriTenantStatus {
  Provisioning = 'PROVISIONING',
  Active = 'ACTIVE',
  Suspended = 'SUSPENDED',
  Closed = 'CLOSED',
}

export enum FarmType {
  CropFarm = 'CROP_FARM',
  LivestockFarm = 'LIVESTOCK_FARM',
  MixedFarm = 'MIXED_FARM',
  Orchard = 'ORCHARD',
  Nursery = 'NURSERY',
  Aquaculture = 'AQUACULTURE',
  ResearchStation = 'RESEARCH_STATION',
}

export enum LandTenure {
  Freehold = 'FREEHOLD',
  Leasehold = 'LEASEHOLD',
  Communal = 'COMMUNAL',
  ContractFarming = 'CONTRACT_FARMING',
  Rented = 'RENTED',
}

export enum FieldUse {
  Cropland = 'CROPLAND',
  Pasture = 'PASTURE',
  Fallow = 'FALLOW',
  Forestry = 'FORESTRY',
  Infrastructure = 'INFRASTRUCTURE',
  Buffer = 'BUFFER',
}

export enum SoilTexture {
  Sand = 'SAND',
  LoamySand = 'LOAMY_SAND',
  SandyLoam = 'SANDY_LOAM',
  Loam = 'LOAM',
  SiltLoam = 'SILT_LOAM',
  ClayLoam = 'CLAY_LOAM',
  Clay = 'CLAY',
  Volcanic = 'VOLCANIC',
  Alluvial = 'ALLUVIAL',
}

export enum CropCategory {
  Cereal = 'CEREAL',
  Legume = 'LEGUME',
  RootTuber = 'ROOT_TUBER',
  Vegetable = 'VEGETABLE',
  Fruit = 'FRUIT',
  Nut = 'NUT',
  Oilseed = 'OILSEED',
  Fiber = 'FIBER',
  Spice = 'SPICE',
  Forage = 'FORAGE',
  Forestry = 'FORESTRY',
}

export enum CropCycleStatus {
  Planned = 'PLANNED',
  Planted = 'PLANTED',
  Growing = 'GROWING',
  Harvested = 'HARVESTED',
  Terminated = 'TERMINATED',
}

export enum ActivityType {
  LandPreparation = 'LAND_PREPARATION',
  Planting = 'PLANTING',
  Irrigation = 'IRRIGATION',
  Fertilization = 'FERTILIZATION',
  PestControl = 'PEST_CONTROL',
  DiseaseControl = 'DISEASE_CONTROL',
  Weeding = 'WEEDING',
  Pruning = 'PRUNING',
  Thinning = 'THINNING',
  Scouting = 'SCOUTING',
  SoilSampling = 'SOIL_SAMPLING',
  Harvesting = 'HARVESTING',
  PostHarvestHandling = 'POST_HARVEST_HANDLING',
  Maintenance = 'MAINTENANCE',
  Other = 'OTHER',
}

export enum ActivityStatus {
  Scheduled = 'SCHEDULED',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
}

export enum InputCategory {
  Seed = 'SEED',
  Fertilizer = 'FERTILIZER',
  Pesticide = 'PESTICIDE',
  Herbicide = 'HERBICIDE',
  Fungicide = 'FUNGICIDE',
  Fuel = 'FUEL',
  Lubricant = 'LUBRICANT',
  AnimalFeed = 'ANIMAL_FEED',
  Veterinary = 'VETERINARY',
  Packaging = 'PACKAGING',
  Tools = 'TOOLS',
  Other = 'OTHER',
}

export enum StockMovementType {
  Purchase = 'PURCHASE',
  InternalTransfer = 'INTERNAL_TRANSFER',
  IssuanceToActivity = 'ISSUANCE_TO_ACTIVITY',
  Adjustment = 'ADJUSTMENT',
  LossWriteOff = 'LOSS_WRITE_OFF',
  Sale = 'SALE',
  Return = 'RETURN',
}

export enum HarvestStatus {
  Planned = 'PLANNED',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
  Rejected = 'REJECTED',
}

export enum StorageLotStatus {
  InStorage = 'IN_STORAGE',
  Released = 'RELEASED',
  Quarantined = 'QUARANTINED',
  Disposed = 'DISPOSED',
}

export enum LivestockSpecies {
  Cattle = 'CATTLE',
  Goat = 'GOAT',
  Sheep = 'SHEEP',
  Pig = 'PIG',
  Poultry = 'POULTRY',
  Rabbit = 'RABBIT',
  Donkey = 'DONKEY',
  Bee = 'BEE',
  Fish = 'FISH',
}

export enum AnimalSex {
  Male = 'MALE',
  Female = 'FEMALE',
}

export enum AnimalStatus {
  Active = 'ACTIVE',
  Sold = 'SOLD',
  Deceased = 'DECEASED',
  Slaughtered = 'SLAUGHTERED',
  TransferredOut = 'TRANSFERRED_OUT',
}

export enum ProductionType {
  Milk = 'MILK',
  Eggs = 'EGGS',
  Wool = 'WOOL',
  Honey = 'HONEY',
  Meat = 'MEAT',
  Offspring = 'OFFSPRING',
  FishHarvest = 'FISH_HARVEST',
}

export enum EquipmentType {
  Tractor = 'TRACTOR',
  Harvester = 'HARVESTER',
  Planter = 'PLANTER',
  Sprayer = 'SPRAYER',
  IrrigationPump = 'IRRIGATION_PUMP',
  Trailer = 'TRAILER',
  ProcessingMachine = 'PROCESSING_MACHINE',
  Vehicle = 'VEHICLE',
  Generator = 'GENERATOR',
  HandTool = 'HAND_TOOL',
  Other = 'OTHER',
}

export enum EquipmentStatus {
  Operational = 'OPERATIONAL',
  UnderMaintenance = 'UNDER_MAINTENANCE',
  BrokenDown = 'BROKEN_DOWN',
  Disposed = 'DISPOSED',
}

export enum WorkOrderStatus {
  Draft = 'DRAFT',
  Assigned = 'ASSIGNED',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
}

export enum WorkOrderPriority {
  Low = 'LOW',
  Normal = 'NORMAL',
  High = 'HIGH',
  Urgent = 'URGENT',
}

export enum OrderStatus {
  Draft = 'DRAFT',
  Submitted = 'SUBMITTED',
  Approved = 'APPROVED',
  Rejected = 'REJECTED',
  Fulfilled = 'FULFILLED',
  Closed = 'CLOSED',
  Cancelled = 'CANCELLED',
}

export enum ContractStatus {
  Draft = 'DRAFT',
  Active = 'ACTIVE',
  Completed = 'COMPLETED',
  Terminated = 'TERMINATED',
  Disputed = 'DISPUTED',
}

export enum CertificationType {
  GlobalGAP = 'GLOBAL_GAP',
  Organic = 'ORGANIC',
  Fairtrade = 'FAIRTRADE',
  RainforestAlliance = 'RAINFOREST_ALLIANCE',
  HACCP = 'HACCP',
  ISO22000 = 'ISO_22000',
  Phytosanitary = 'PHYTOSANITARY',
  ExportQuality = 'EXPORT_QUALITY',
  Other = 'OTHER',
}

export enum CertificationStatus {
  Applied = 'APPLIED',
  Certified = 'CERTIFIED',
  Suspended = 'SUSPENDED',
  Expired = 'EXPIRED',
  Revoked = 'REVOKED',
}

export enum InspectionResult {
  Pass = 'PASS',
  Conditional = 'CONDITIONAL',
  Fail = 'FAIL',
  Pending = 'PENDING',
}

/** Finance OS integration states — Agriculture OS is NEVER the ledger. */
export enum FinanceIntegrationStatus {
  NotApplicable = 'NOT_APPLICABLE',
  PendingIntegration = 'PENDING_INTEGRATION',
  Integrated = 'INTEGRATED',
  Reconciled = 'RECONCILED',
}

/** Canonical Agriculture OS roles (RBAC layer). */
export enum AgriRole {
  SuperAdmin = 'SUPER_ADMIN',
  FarmManager = 'FARM_MANAGER',
  Agronomist = 'AGRONOMIST',
  LivestockManager = 'LIVESTOCK_MANAGER',
  InventoryManager = 'INVENTORY_MANAGER',
  ProcurementOfficer = 'PROCUREMENT_OFFICER',
  EquipmentManager = 'EQUIPMENT_MANAGER',
  ComplianceOfficer = 'COMPLIANCE_OFFICER',
  FarmWorker = 'FARM_WORKER',
  Auditor = 'AUDITOR',
}
