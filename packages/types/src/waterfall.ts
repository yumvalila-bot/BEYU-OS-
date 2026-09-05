/**
 * BEYU OS — Waterfall Cashflow types (spec §28-§33, §80).
 *
 * BEYU OS decides WHAT SHOULD HAPPEN. Finance OS executes WHAT ACTUALLY HAPPENS.
 * No percentages are hard-coded anywhere: every tier value is data.
 */

/** Allocation categories available to waterfall tiers (spec §29). */
export enum AllocationCategory {
  OperatingObligations = 'OPERATING_OBLIGATIONS',
  StatutoryTax = 'STATUTORY_TAX',
  DebtService = 'DEBT_SERVICE',
  WorkingCapital = 'WORKING_CAPITAL',
  EmergencyReserve = 'EMERGENCY_RESERVE',
  MaintenanceCapex = 'MAINTENANCE_CAPEX',
  GrowthCapex = 'GROWTH_CAPEX',
  StrategicInvestment = 'STRATEGIC_INVESTMENT',
  ApprovedDistributions = 'APPROVED_DISTRIBUTIONS',
  TrustCapital = 'TRUST_CAPITAL',
  FoundationAllocation = 'FOUNDATION_ALLOCATION',
}

/**
 * DEFAULT conceptual priority order (spec §30).
 * This is seed/reference data describing ORDER ONLY — it contains no amounts
 * and no percentages. Operators configure real tiers per rule set.
 */
export const DEFAULT_CATEGORY_PRIORITY: readonly AllocationCategory[] = [
  AllocationCategory.OperatingObligations,
  AllocationCategory.StatutoryTax,
  AllocationCategory.DebtService,
  AllocationCategory.WorkingCapital,
  AllocationCategory.EmergencyReserve,
  AllocationCategory.MaintenanceCapex,
  AllocationCategory.GrowthCapex,
  AllocationCategory.StrategicInvestment,
  AllocationCategory.ApprovedDistributions,
  AllocationCategory.TrustCapital,
  AllocationCategory.FoundationAllocation,
] as const;

/** How a tier computes its allocation from the funds available to it. */
export enum TierComputationType {
  /** Fixed minor-unit amount. */
  FixedAmount = 'FIXED_AMOUNT',
  /** Basis points of the tier's input amount. */
  Percentage = 'PERCENTAGE',
  /** Fill a reserve up to a target balance. */
  ReserveTarget = 'RESERVE_TARGET',
  /** Everything remaining after prior tiers. */
  Residual = 'RESIDUAL',
}

/** Lifecycle of a waterfall rule set (spec §31). */
export enum WaterfallRuleStatus {
  Draft = 'DRAFT',
  Review = 'REVIEW',
  Approval = 'APPROVAL',
  Active = 'ACTIVE',
  Suspended = 'SUSPENDED',
  Archived = 'ARCHIVED',
}

/** Lifecycle of a calculation run. */
export enum WaterfallCalculationStatus {
  Draft = 'DRAFT',
  Calculated = 'CALCULATED',
  PendingApproval = 'PENDING_APPROVAL',
  Approved = 'APPROVED',
  Rejected = 'REJECTED',
  /** Handed to Finance/Treasury for execution. BEYU OS does not execute. */
  ReleasedForExecution = 'RELEASED_FOR_EXECUTION',
}

/**
 * A single waterfall tier definition.
 *
 * Monetary values are integers in MINOR UNITS (e.g. cents) to guarantee
 * deterministic arithmetic. Percentages are BASIS POINTS (1 bp = 0.01%),
 * again integers — never floats (spec §80: calculations must be deterministic).
 */
export interface WaterfallTier {
  id: string;
  ruleSetId: string;
  /** Execution order. Lower runs first. Unique within a rule set. */
  priority: number;
  name: string;
  category: AllocationCategory;
  computationType: TierComputationType;
  /** Minor units. Required for FIXED_AMOUNT. */
  fixedAmountMinor?: number | null;
  /** Basis points (0-10000). Required for PERCENTAGE. */
  percentageBps?: number | null;
  /** Minor units. Required for RESERVE_TARGET. */
  reserveTargetMinor?: number | null;
  /** Current reserve balance in minor units, for RESERVE_TARGET tiers. */
  reserveCurrentMinor?: number | null;
  /** Floor applied to the computed allocation, in minor units. */
  minimumMinor?: number | null;
  /** Cap applied to the computed allocation, in minor units. */
  maximumMinor?: number | null;
  /** Tier is skipped when available funds are below this, in minor units. */
  thresholdMinor?: number | null;
  /** Destination entity for the allocated funds. */
  destinationEntityId?: string | null;
  /** Optional narrowing of applicability. */
  countryCode?: string | null;
  sectorCode?: string | null;
  /** Tier requires explicit human approval before release. */
  requiresApproval: boolean;
  /** Free-form conditional expression evaluated by the rule engine. */
  condition?: TierCondition | null;
  notes?: string | null;
}

/** A declarative, safely-evaluated condition (no arbitrary code execution). */
export interface TierCondition {
  /** Metric drawn from the calculation input context. */
  metric: 'inflow' | 'available' | 'periodRevenue' | 'periodProfit' | 'reserveBalance';
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  /** Comparison value in minor units. */
  valueMinor: number;
}

/**
 * A versioned set of waterfall rules (spec §32).
 * Historical calculations always reference the exact version used and are
 * never silently recomputed.
 */
export interface WaterfallRuleSet {
  id: string;
  name: string;
  /** Semantic-ish version string, e.g. "1.0", "1.1", "2.0". */
  version: string;
  status: WaterfallRuleStatus;
  /** Entity scope the rule set applies to. */
  entityId: string | null;
  countryCode: string | null;
  sectorCode: string | null;
  currency: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  tiers: WaterfallTier[];
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Input to a calculation run. */
export interface WaterfallCalculationInput {
  ruleSetId: string;
  periodId: string;
  /** Total inflow available to the waterfall, in minor units. */
  inflowMinor: number;
  currency: string;
  /** Additional metrics available to tier conditions. */
  context?: {
    periodRevenueMinor?: number;
    periodProfitMinor?: number;
  };
}

/** One computed allocation line. */
export interface WaterfallAllocationLine {
  tierId: string;
  tierName: string;
  priority: number;
  category: AllocationCategory;
  computationType: TierComputationType;
  /** Funds available to this tier before its allocation, in minor units. */
  availableBeforeMinor: number;
  /** Amount allocated to this tier, in minor units. */
  allocatedMinor: number;
  /** Funds remaining after this tier, in minor units. */
  remainingAfterMinor: number;
  /** True when the tier was skipped by a threshold or condition. */
  skipped: boolean;
  skipReason?: string;
  /** Applied caps/floors, for explainability. */
  adjustments: string[];
  destinationEntityId?: string | null;
  requiresApproval: boolean;
}

/** The deterministic result of a calculation run. */
export interface WaterfallCalculationResult {
  calculationId: string;
  ruleSetId: string;
  /** The immutable version of the rules used. */
  ruleSetVersion: string;
  periodId: string;
  currency: string;
  inflowMinor: number;
  totalAllocatedMinor: number;
  /** Unallocated residual, in minor units. Must equal inflow - totalAllocated. */
  unallocatedMinor: number;
  lines: WaterfallAllocationLine[];
  status: WaterfallCalculationStatus;
  /** Deterministic hash of (rules + input) proving reproducibility. */
  inputHash: string;
  calculatedAt: string;
  calculatedBy: string;
}
