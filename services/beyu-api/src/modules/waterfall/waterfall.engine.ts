/**
 * BEYU OS — Waterfall Cashflow Engine (spec §28-§33, §80).
 *
 * DESIGN GUARANTEES
 * -----------------
 * 1. DETERMINISTIC. All arithmetic uses integer MINOR UNITS (cents) and
 *    integer BASIS POINTS. No floating point is used anywhere in the money
 *    path, so results are bit-identical across runs and machines.
 * 2. NO HARD-CODED PERCENTAGES. Every rate, floor, cap, threshold and reserve
 *    target comes from the tier rows supplied by the caller.
 * 3. VERSION-PINNED. A calculation records the rule set version it used. The
 *    engine is pure, so re-running an archived rule set reproduces history
 *    exactly. Historical results are never silently mutated.
 * 4. NO EXECUTION. The engine decides WHAT SHOULD HAPPEN. It never moves money;
 *    Finance/Treasury executes approved allocations (spec §70).
 * 5. CONSERVATION. inflow === totalAllocated + unallocated, always asserted.
 */

import { createHash } from 'node:crypto';
import {
  type AllocationCategory,
  TierComputationType,
  type WaterfallAllocationLine,
  type WaterfallCalculationInput,
  type WaterfallCalculationResult,
  WaterfallCalculationStatus,
  type WaterfallRuleSet,
  type WaterfallTier,
  type TierCondition,
} from '@beyu/types';

export class WaterfallEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WaterfallEngineError';
  }
}

/** Basis-point denominator. 10000 bps = 100%. */
const BPS_DENOMINATOR = 10_000;

/**
 * Multiplies an integer minor-unit amount by basis points, rounding half-up
 * deterministically. Uses only integer arithmetic.
 */
export function applyBasisPoints(amountMinor: number, bps: number): number {
  assertSafeInteger(amountMinor, 'amountMinor');
  assertSafeInteger(bps, 'bps');
  if (bps < 0 || bps > BPS_DENOMINATOR) {
    throw new WaterfallEngineError(
      `Basis points must be between 0 and ${BPS_DENOMINATOR}, received ${bps}.`,
    );
  }
  const product = BigInt(amountMinor) * BigInt(bps);
  const half = BigInt(BPS_DENOMINATOR) / 2n;
  // Round half away from zero for symmetric behaviour on negatives.
  const rounded =
    product >= 0n
      ? (product + half) / BigInt(BPS_DENOMINATOR)
      : -((-product + half) / BigInt(BPS_DENOMINATOR));
  const result = Number(rounded);
  assertSafeInteger(result, 'basis point result');
  return result;
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new WaterfallEngineError(
      `${label} must be an integer in minor units; received ${value}. ` +
        'Floating-point money is not permitted in the waterfall engine.',
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new WaterfallEngineError(`${label} exceeds the safe integer range: ${value}.`);
  }
}

/** Validates a rule set before it may be activated or calculated against. */
export function validateRuleSet(ruleSet: WaterfallRuleSet): string[] {
  const errors: string[] = [];

  if (!ruleSet.tiers || ruleSet.tiers.length === 0) {
    errors.push('Rule set must define at least one tier.');
    return errors;
  }

  const priorities = new Set<number>();
  for (const tier of ruleSet.tiers) {
    if (priorities.has(tier.priority)) {
      errors.push(`Duplicate tier priority ${tier.priority} in rule set ${ruleSet.id}.`);
    }
    priorities.add(tier.priority);

    switch (tier.computationType) {
      case TierComputationType.FixedAmount:
        if (tier.fixedAmountMinor === null || tier.fixedAmountMinor === undefined) {
          errors.push(`Tier "${tier.name}" is FIXED_AMOUNT but has no fixedAmountMinor.`);
        } else if (tier.fixedAmountMinor < 0) {
          errors.push(`Tier "${tier.name}" has a negative fixed amount.`);
        }
        break;
      case TierComputationType.Percentage:
        if (tier.percentageBps === null || tier.percentageBps === undefined) {
          errors.push(`Tier "${tier.name}" is PERCENTAGE but has no percentageBps.`);
        } else if (tier.percentageBps < 0 || tier.percentageBps > BPS_DENOMINATOR) {
          errors.push(
            `Tier "${tier.name}" percentageBps must be between 0 and ${BPS_DENOMINATOR}.`,
          );
        }
        break;
      case TierComputationType.ReserveTarget:
        if (tier.reserveTargetMinor === null || tier.reserveTargetMinor === undefined) {
          errors.push(`Tier "${tier.name}" is RESERVE_TARGET but has no reserveTargetMinor.`);
        }
        break;
      case TierComputationType.Residual:
        break;
      default:
        errors.push(`Tier "${tier.name}" has unknown computationType.`);
    }

    if (
      tier.minimumMinor !== null &&
      tier.minimumMinor !== undefined &&
      tier.maximumMinor !== null &&
      tier.maximumMinor !== undefined &&
      tier.minimumMinor > tier.maximumMinor
    ) {
      errors.push(`Tier "${tier.name}" has minimum greater than maximum.`);
    }
  }

  const residuals = ruleSet.tiers.filter(
    (t) => t.computationType === TierComputationType.Residual,
  );
  if (residuals.length > 1) {
    errors.push('A rule set may contain at most one RESIDUAL tier.');
  }
  if (residuals.length === 1) {
    const maxPriority = Math.max(...ruleSet.tiers.map((t) => t.priority));
    if (residuals[0].priority !== maxPriority) {
      errors.push('The RESIDUAL tier must have the highest (last) priority.');
    }
  }

  return errors;
}

/** Evaluates a declarative tier condition. No dynamic code execution. */
function evaluateCondition(
  condition: TierCondition,
  ctx: { inflow: number; available: number; periodRevenue: number; periodProfit: number; reserveBalance: number },
): boolean {
  const actual =
    condition.metric === 'inflow'
      ? ctx.inflow
      : condition.metric === 'available'
        ? ctx.available
        : condition.metric === 'periodRevenue'
          ? ctx.periodRevenue
          : condition.metric === 'periodProfit'
            ? ctx.periodProfit
            : ctx.reserveBalance;

  switch (condition.operator) {
    case 'gt':
      return actual > condition.valueMinor;
    case 'gte':
      return actual >= condition.valueMinor;
    case 'lt':
      return actual < condition.valueMinor;
    case 'lte':
      return actual <= condition.valueMinor;
    case 'eq':
      return actual === condition.valueMinor;
    case 'neq':
      return actual !== condition.valueMinor;
    default:
      return false;
  }
}

/**
 * Computes a deterministic hash over the exact rules and inputs used.
 * Stored with the calculation so reproducibility can be proven later.
 */
export function computeInputHash(
  ruleSet: WaterfallRuleSet,
  input: WaterfallCalculationInput,
): string {
  const canonicalTiers = [...ruleSet.tiers]
    .sort((a, b) => a.priority - b.priority)
    .map((t) => ({
      priority: t.priority,
      category: t.category,
      computationType: t.computationType,
      fixedAmountMinor: t.fixedAmountMinor ?? null,
      percentageBps: t.percentageBps ?? null,
      reserveTargetMinor: t.reserveTargetMinor ?? null,
      reserveCurrentMinor: t.reserveCurrentMinor ?? null,
      minimumMinor: t.minimumMinor ?? null,
      maximumMinor: t.maximumMinor ?? null,
      thresholdMinor: t.thresholdMinor ?? null,
      condition: t.condition ?? null,
      destinationEntityId: t.destinationEntityId ?? null,
    }));

  const canonical = JSON.stringify({
    ruleSetId: ruleSet.id,
    ruleSetVersion: ruleSet.version,
    currency: input.currency,
    inflowMinor: input.inflowMinor,
    periodId: input.periodId,
    context: {
      periodRevenueMinor: input.context?.periodRevenueMinor ?? null,
      periodProfitMinor: input.context?.periodProfitMinor ?? null,
    },
    tiers: canonicalTiers,
  });

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Executes the waterfall.
 *
 * PURE FUNCTION: no I/O, no clock dependence except the caller-supplied
 * timestamp, no randomness. Given identical inputs it always returns an
 * identical result.
 */
export function calculateWaterfall(
  ruleSet: WaterfallRuleSet,
  input: WaterfallCalculationInput,
  meta: { calculationId: string; calculatedBy: string; calculatedAt: string },
): WaterfallCalculationResult {
  const validationErrors = validateRuleSet(ruleSet);
  if (validationErrors.length > 0) {
    throw new WaterfallEngineError(
      `Cannot calculate with an invalid rule set: ${validationErrors.join(' ')}`,
    );
  }

  if (ruleSet.currency !== input.currency) {
    throw new WaterfallEngineError(
      `Currency mismatch: rule set is ${ruleSet.currency}, input is ${input.currency}. ` +
        'Cross-currency waterfalls require an explicit, audited conversion step.',
    );
  }

  assertSafeInteger(input.inflowMinor, 'inflowMinor');
  if (input.inflowMinor < 0) {
    throw new WaterfallEngineError('Inflow cannot be negative.');
  }

  const tiers = [...ruleSet.tiers].sort((a, b) => a.priority - b.priority);
  const lines: WaterfallAllocationLine[] = [];

  let available = input.inflowMinor;
  let totalAllocated = 0;

  for (const tier of tiers) {
    const availableBefore = available;
    const adjustments: string[] = [];

    const conditionContext = {
      inflow: input.inflowMinor,
      available,
      periodRevenue: input.context?.periodRevenueMinor ?? 0,
      periodProfit: input.context?.periodProfitMinor ?? 0,
      reserveBalance: tier.reserveCurrentMinor ?? 0,
    };

    // Threshold gate: skip the tier when insufficient funds remain.
    if (
      tier.thresholdMinor !== null &&
      tier.thresholdMinor !== undefined &&
      available < tier.thresholdMinor
    ) {
      lines.push(
        skippedLine(
          tier,
          availableBefore,
          `Available ${available} is below tier threshold ${tier.thresholdMinor}.`,
        ),
      );
      continue;
    }

    // Declarative condition gate.
    if (tier.condition && !evaluateCondition(tier.condition, conditionContext)) {
      lines.push(
        skippedLine(
          tier,
          availableBefore,
          `Condition ${tier.condition.metric} ${tier.condition.operator} ` +
            `${tier.condition.valueMinor} was not met.`,
        ),
      );
      continue;
    }

    // No funds left — record the tier as skipped rather than omitting it, so
    // the calculation remains a complete, explainable record.
    if (available <= 0) {
      lines.push(skippedLine(tier, availableBefore, 'No funds remaining at this tier.'));
      continue;
    }

    let requested = computeTierRequest(tier, available);

    // Apply floor.
    if (tier.minimumMinor !== null && tier.minimumMinor !== undefined) {
      if (requested < tier.minimumMinor) {
        requested = tier.minimumMinor;
        adjustments.push(`Raised to minimum ${tier.minimumMinor}.`);
      }
    }
    // Apply cap.
    if (tier.maximumMinor !== null && tier.maximumMinor !== undefined) {
      if (requested > tier.maximumMinor) {
        requested = tier.maximumMinor;
        adjustments.push(`Capped at maximum ${tier.maximumMinor}.`);
      }
    }
    // Never allocate more than is actually available — funds cannot be invented.
    if (requested > available) {
      adjustments.push(
        `Reduced from ${requested} to available balance ${available} (partial funding).`,
      );
      requested = available;
    }
    if (requested < 0) {
      requested = 0;
      adjustments.push('Negative allocation clamped to zero.');
    }

    available -= requested;
    totalAllocated += requested;

    lines.push({
      tierId: tier.id,
      tierName: tier.name,
      priority: tier.priority,
      category: tier.category,
      computationType: tier.computationType,
      availableBeforeMinor: availableBefore,
      allocatedMinor: requested,
      remainingAfterMinor: available,
      skipped: false,
      adjustments,
      destinationEntityId: tier.destinationEntityId ?? null,
      requiresApproval: tier.requiresApproval,
    });
  }

  // Conservation invariant — a hard guarantee of the engine.
  if (totalAllocated + available !== input.inflowMinor) {
    throw new WaterfallEngineError(
      `Conservation violation: allocated ${totalAllocated} + remaining ${available} ` +
        `!== inflow ${input.inflowMinor}.`,
    );
  }

  return {
    calculationId: meta.calculationId,
    ruleSetId: ruleSet.id,
    ruleSetVersion: ruleSet.version,
    periodId: input.periodId,
    currency: input.currency,
    inflowMinor: input.inflowMinor,
    totalAllocatedMinor: totalAllocated,
    unallocatedMinor: available,
    lines,
    status: WaterfallCalculationStatus.Calculated,
    inputHash: computeInputHash(ruleSet, input),
    calculatedAt: meta.calculatedAt,
    calculatedBy: meta.calculatedBy,
  };
}

function computeTierRequest(tier: WaterfallTier, available: number): number {
  switch (tier.computationType) {
    case TierComputationType.FixedAmount:
      return tier.fixedAmountMinor ?? 0;

    case TierComputationType.Percentage:
      return applyBasisPoints(available, tier.percentageBps ?? 0);

    case TierComputationType.ReserveTarget: {
      const target = tier.reserveTargetMinor ?? 0;
      const current = tier.reserveCurrentMinor ?? 0;
      const gap = target - current;
      return gap > 0 ? gap : 0;
    }

    case TierComputationType.Residual:
      return available;

    default:
      throw new WaterfallEngineError(
        `Unsupported tier computation type: ${String(tier.computationType)}`,
      );
  }
}

function skippedLine(
  tier: WaterfallTier,
  availableBefore: number,
  reason: string,
): WaterfallAllocationLine {
  return {
    tierId: tier.id,
    tierName: tier.name,
    priority: tier.priority,
    category: tier.category,
    computationType: tier.computationType,
    availableBeforeMinor: availableBefore,
    allocatedMinor: 0,
    remainingAfterMinor: availableBefore,
    skipped: true,
    skipReason: reason,
    adjustments: [],
    destinationEntityId: tier.destinationEntityId ?? null,
    requiresApproval: tier.requiresApproval,
  };
}

/** Aggregates a calculation by allocation category, for reporting. */
export function summarizeByCategory(
  result: WaterfallCalculationResult,
): Array<{ category: AllocationCategory; allocatedMinor: number }> {
  const totals = new Map<AllocationCategory, number>();
  for (const line of result.lines) {
    totals.set(line.category, (totals.get(line.category) ?? 0) + line.allocatedMinor);
  }
  return [...totals.entries()]
    .map(([category, allocatedMinor]) => ({ category, allocatedMinor }))
    .sort((a, b) => b.allocatedMinor - a.allocatedMinor);
}
