/**
 * Waterfall engine tests (spec §30-§34).
 *
 * These cover the properties the capital-allocation layer is trusted on:
 * conservation of funds, determinism, partial funding, floors/caps, reserve
 * top-up, and rule-set validation. The engine is pure, so everything here is
 * exact-value assertion rather than approximation — money is never compared
 * with tolerances.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AllocationCategory,
  TierComputationType,
  WaterfallCalculationStatus,
  WaterfallRuleStatus,
  type WaterfallCalculationInput,
  type WaterfallRuleSet,
  type WaterfallTier,
} from '@beyu/types';

import {
  applyBasisPoints,
  calculateWaterfall,
  computeInputHash,
  summarizeByCategory,
  validateRuleSet,
  WaterfallEngineError,
} from '../src/modules/waterfall/waterfall.engine';

// --- fixtures --------------------------------------------------------------

function tier(overrides: Partial<WaterfallTier> & { priority: number }): WaterfallTier {
  return {
    id: `tier-${overrides.priority}`,
    ruleSetId: 'rs-1',
    name: `Tier ${overrides.priority}`,
    category: AllocationCategory.OperatingObligations,
    computationType: TierComputationType.FixedAmount,
    fixedAmountMinor: null,
    percentageBps: null,
    reserveTargetMinor: null,
    reserveCurrentMinor: null,
    minimumMinor: null,
    maximumMinor: null,
    thresholdMinor: null,
    condition: null,
    destinationEntityId: null,
    requiresApproval: false,
    ...overrides,
  } as WaterfallTier;
}

function ruleSet(tiers: WaterfallTier[], overrides: Partial<WaterfallRuleSet> = {}): WaterfallRuleSet {
  return {
    id: 'rs-1',
    name: 'Test Rule Set',
    version: '1.0',
    status: WaterfallRuleStatus.Active,
    entityId: null,
    countryCode: null,
    sectorCode: null,
    currency: 'USD',
    effectiveFrom: null,
    effectiveTo: null,
    tiers,
    createdBy: 'user-1',
    approvedBy: 'user-2',
    approvedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const META = {
  calculationId: 'calc-1',
  calculatedBy: 'user-1',
  calculatedAt: '2026-08-11T00:00:00.000Z',
};

function input(overrides: Partial<WaterfallCalculationInput> = {}): WaterfallCalculationInput {
  return { ruleSetId: 'rs-1', periodId: 'p-1', inflowMinor: 1_000_000, currency: 'USD', ...overrides };
}

// --- basis points ----------------------------------------------------------

describe('applyBasisPoints', () => {
  it('computes exact integer percentages', () => {
    assert.equal(applyBasisPoints(1_000_000, 2_500), 250_000); // 25%
    assert.equal(applyBasisPoints(1_000_000, 10_000), 1_000_000); // 100%
    assert.equal(applyBasisPoints(1_000_000, 0), 0);
  });

  it('rounds half away from zero deterministically', () => {
    // 1 minor unit * 50% = 0.5 -> 1
    assert.equal(applyBasisPoints(1, 5_000), 1);
    // 3 * 50% = 1.5 -> 2
    assert.equal(applyBasisPoints(3, 5_000), 2);
    assert.equal(applyBasisPoints(-1, 5_000), -1);
    assert.equal(applyBasisPoints(-3, 5_000), -2);
  });

  it('never loses precision on large amounts', () => {
    // 1 trillion minor units at 33.33% — exact integer arithmetic via BigInt.
    assert.equal(applyBasisPoints(1_000_000_000_000, 3_333), 333_300_000_000);
  });

  it('rejects out-of-range basis points and non-integers', () => {
    assert.throws(() => applyBasisPoints(100, 10_001), WaterfallEngineError);
    assert.throws(() => applyBasisPoints(100, -1), WaterfallEngineError);
    assert.throws(() => applyBasisPoints(100.5, 100), WaterfallEngineError);
  });
});

// --- validation ------------------------------------------------------------

describe('validateRuleSet', () => {
  it('accepts a well-formed rule set', () => {
    const rs = ruleSet([
      tier({ priority: 1, computationType: TierComputationType.FixedAmount, fixedAmountMinor: 100 }),
      tier({ priority: 2, computationType: TierComputationType.Residual }),
    ]);
    assert.deepEqual(validateRuleSet(rs), []);
  });

  it('rejects duplicate tier priorities', () => {
    const rs = ruleSet([
      tier({ priority: 1, fixedAmountMinor: 100 }),
      tier({ priority: 1, fixedAmountMinor: 200 }),
    ]);
    assert.ok(validateRuleSet(rs).some((e) => /priorit/i.test(e)));
  });

  it('rejects a RESIDUAL tier that is not last', () => {
    // A residual tier consumes everything, so any tier after it is dead code —
    // silently unfunded allocations are exactly the failure we must prevent.
    const rs = ruleSet([
      tier({ priority: 1, computationType: TierComputationType.Residual }),
      tier({ priority: 2, computationType: TierComputationType.FixedAmount, fixedAmountMinor: 100 }),
    ]);
    assert.ok(validateRuleSet(rs).some((e) => /residual/i.test(e)));
  });

  it('rejects more than one RESIDUAL tier', () => {
    const rs = ruleSet([
      tier({ priority: 1, computationType: TierComputationType.Residual }),
      tier({ priority: 2, computationType: TierComputationType.Residual }),
    ]);
    assert.ok(validateRuleSet(rs).some((e) => /residual/i.test(e)));
  });

  it('rejects tiers missing their required field', () => {
    assert.ok(
      validateRuleSet(ruleSet([tier({ priority: 1, computationType: TierComputationType.Percentage })]))
        .some((e) => /percentageBps/i.test(e)),
    );
    assert.ok(
      validateRuleSet(ruleSet([tier({ priority: 1, computationType: TierComputationType.FixedAmount })]))
        .some((e) => /fixedAmountMinor/i.test(e)),
    );
    assert.ok(
      validateRuleSet(ruleSet([tier({ priority: 1, computationType: TierComputationType.ReserveTarget })]))
        .some((e) => /reserveTargetMinor/i.test(e)),
    );
  });

  it('rejects minimum greater than maximum', () => {
    const rs = ruleSet([
      tier({ priority: 1, fixedAmountMinor: 500, minimumMinor: 900, maximumMinor: 100 }),
    ]);
    assert.ok(validateRuleSet(rs).length > 0);
  });

  it('refuses to calculate against an invalid rule set', () => {
    const rs = ruleSet([tier({ priority: 1, computationType: TierComputationType.Percentage })]);
    assert.throws(() => calculateWaterfall(rs, input(), META), WaterfallEngineError);
  });
});

// --- core calculation ------------------------------------------------------

describe('calculateWaterfall', () => {
  it('allocates tiers in priority order, not array order', () => {
    const rs = ruleSet([
      tier({ priority: 3, computationType: TierComputationType.Residual }),
      tier({ priority: 1, fixedAmountMinor: 100_000 }),
      tier({ priority: 2, computationType: TierComputationType.Percentage, percentageBps: 5_000 }),
    ]);
    const result = calculateWaterfall(rs, input({ inflowMinor: 1_000_000 }), META);

    assert.deepEqual(result.lines.map((l) => l.priority), [1, 2, 3]);
    assert.equal(result.lines[0].allocatedMinor, 100_000);
    // 50% of the REMAINING 900,000 — percentage applies to available, not inflow.
    assert.equal(result.lines[1].allocatedMinor, 450_000);
    assert.equal(result.lines[2].allocatedMinor, 450_000);
    assert.equal(result.unallocatedMinor, 0);
  });

  it('conserves funds exactly: allocated + unallocated === inflow', () => {
    const rs = ruleSet([
      tier({ priority: 1, fixedAmountMinor: 333_333 }),
      tier({ priority: 2, computationType: TierComputationType.Percentage, percentageBps: 3_333 }),
    ]);
    const result = calculateWaterfall(rs, input({ inflowMinor: 1_000_001 }), META);
    assert.equal(result.totalAllocatedMinor + result.unallocatedMinor, result.inflowMinor);
  });

  it('funds partially rather than overdrawing', () => {
    const rs = ruleSet([
      tier({ priority: 1, fixedAmountMinor: 800_000 }),
      tier({ priority: 2, fixedAmountMinor: 500_000 }),
    ]);
    const result = calculateWaterfall(rs, input({ inflowMinor: 1_000_000 }), META);

    assert.equal(result.lines[0].allocatedMinor, 800_000);
    // Wanted 500,000 but only 200,000 remained.
    assert.equal(result.lines[1].allocatedMinor, 200_000);
    assert.ok(result.lines[1].adjustments.some((a) => /partial funding/i.test(a)));
    assert.equal(result.unallocatedMinor, 0);
  });

  it('records skipped tiers instead of omitting them', () => {
    const rs = ruleSet([
      tier({ priority: 1, fixedAmountMinor: 1_000_000 }),
      tier({ priority: 2, fixedAmountMinor: 50_000 }),
    ]);
    const result = calculateWaterfall(rs, input({ inflowMinor: 1_000_000 }), META);

    assert.equal(result.lines.length, 2, 'every tier must appear in the record');
    assert.equal(result.lines[1].skipped, true);
    assert.match(result.lines[1].skipReason ?? '', /No funds remaining/i);
  });

  it('honours thresholds and declarative conditions', () => {
    const thresholded = ruleSet([tier({ priority: 1, fixedAmountMinor: 100, thresholdMinor: 5_000_000 })]);
    const r1 = calculateWaterfall(thresholded, input({ inflowMinor: 1_000_000 }), META);
    assert.equal(r1.lines[0].skipped, true);
    assert.equal(r1.unallocatedMinor, 1_000_000);

    const conditional = ruleSet([
      tier({
        priority: 1,
        fixedAmountMinor: 100_000,
        condition: { metric: 'periodProfit', operator: 'gt', valueMinor: 500_000 },
      }),
    ]);
    const unprofitable = calculateWaterfall(
      conditional,
      input({ context: { periodProfitMinor: 100_000 } }),
      META,
    );
    assert.equal(unprofitable.lines[0].skipped, true);

    const profitable = calculateWaterfall(
      conditional,
      input({ context: { periodProfitMinor: 900_000 } }),
      META,
    );
    assert.equal(profitable.lines[0].allocatedMinor, 100_000);
  });

  it('applies floors and caps, in that order', () => {
    const floored = ruleSet([
      tier({
        priority: 1,
        computationType: TierComputationType.Percentage,
        percentageBps: 100, // 1% = 10,000
        minimumMinor: 50_000,
      }),
    ]);
    const r1 = calculateWaterfall(floored, input({ inflowMinor: 1_000_000 }), META);
    assert.equal(r1.lines[0].allocatedMinor, 50_000);
    assert.ok(r1.lines[0].adjustments.some((a) => /minimum/i.test(a)));

    const capped = ruleSet([
      tier({
        priority: 1,
        computationType: TierComputationType.Percentage,
        percentageBps: 5_000, // 50% = 500,000
        maximumMinor: 200_000,
      }),
    ]);
    const r2 = calculateWaterfall(capped, input({ inflowMinor: 1_000_000 }), META);
    assert.equal(r2.lines[0].allocatedMinor, 200_000);
    assert.ok(r2.lines[0].adjustments.some((a) => /maximum/i.test(a)));
  });

  it('tops a reserve up to its target and no further', () => {
    const rs = ruleSet([
      tier({
        priority: 1,
        computationType: TierComputationType.ReserveTarget,
        reserveTargetMinor: 500_000,
        reserveCurrentMinor: 300_000,
      }),
    ]);
    const result = calculateWaterfall(rs, input({ inflowMinor: 1_000_000 }), META);
    assert.equal(result.lines[0].allocatedMinor, 200_000);

    // Already at target: allocate nothing, never claw back.
    const full = ruleSet([
      tier({
        priority: 1,
        computationType: TierComputationType.ReserveTarget,
        reserveTargetMinor: 500_000,
        reserveCurrentMinor: 700_000,
      }),
    ]);
    const r2 = calculateWaterfall(full, input({ inflowMinor: 1_000_000 }), META);
    assert.equal(r2.lines[0].allocatedMinor, 0);
    assert.equal(r2.unallocatedMinor, 1_000_000);
  });

  it('handles a zero inflow without inventing funds', () => {
    const rs = ruleSet([
      tier({ priority: 1, fixedAmountMinor: 100_000 }),
      tier({ priority: 2, computationType: TierComputationType.Residual }),
    ]);
    const result = calculateWaterfall(rs, input({ inflowMinor: 0 }), META);
    assert.equal(result.totalAllocatedMinor, 0);
    assert.equal(result.unallocatedMinor, 0);
    assert.ok(result.lines.every((l) => l.skipped));
  });

  it('rejects negative inflow and currency mismatches', () => {
    const rs = ruleSet([tier({ priority: 1, fixedAmountMinor: 1 })]);
    assert.throws(() => calculateWaterfall(rs, input({ inflowMinor: -1 }), META), WaterfallEngineError);
    assert.throws(
      () => calculateWaterfall(rs, input({ currency: 'TZS' }), META),
      /Currency mismatch/,
    );
  });

  it('marks the result CALCULATED, never approved or executed', () => {
    // BEYU OS decides; Finance OS executes. The engine must never emit a
    // status implying money moved.
    const rs = ruleSet([tier({ priority: 1, computationType: TierComputationType.Residual })]);
    const result = calculateWaterfall(rs, input(), META);
    assert.equal(result.status, WaterfallCalculationStatus.Calculated);
  });

  it('pins the rule set version into the result', () => {
    const rs = ruleSet([tier({ priority: 1, computationType: TierComputationType.Residual })], {
      version: '2.7',
    });
    assert.equal(calculateWaterfall(rs, input(), META).ruleSetVersion, '2.7');
  });
});

// --- determinism -----------------------------------------------------------

describe('determinism and inputHash', () => {
  const rs = ruleSet([
    tier({ priority: 1, fixedAmountMinor: 123_456 }),
    tier({ priority: 2, computationType: TierComputationType.Percentage, percentageBps: 1_234 }),
    tier({ priority: 3, computationType: TierComputationType.Residual }),
  ]);

  it('returns identical results for identical inputs', () => {
    const a = calculateWaterfall(rs, input({ inflowMinor: 987_654_321 }), META);
    const b = calculateWaterfall(rs, input({ inflowMinor: 987_654_321 }), META);
    assert.deepEqual(a, b);
  });

  it('produces a stable hash regardless of tier array order', () => {
    const reordered = ruleSet([...rs.tiers].reverse());
    assert.equal(
      computeInputHash(rs, input({ inflowMinor: 5_000 })),
      computeInputHash(reordered, input({ inflowMinor: 5_000 })),
    );
  });

  it('changes the hash when any rule or input changes', () => {
    const base = computeInputHash(rs, input({ inflowMinor: 5_000 }));

    assert.notEqual(base, computeInputHash(rs, input({ inflowMinor: 5_001 })));
    assert.notEqual(base, computeInputHash(rs, input({ periodId: 'p-2', inflowMinor: 5_000 })));

    const bumped = ruleSet(rs.tiers, { version: '9.9' });
    assert.notEqual(base, computeInputHash(bumped, input({ inflowMinor: 5_000 })));

    const edited = ruleSet([
      tier({ priority: 1, fixedAmountMinor: 123_457 }), // one minor unit different
      ...rs.tiers.slice(1),
    ]);
    assert.notEqual(base, computeInputHash(edited, input({ inflowMinor: 5_000 })));
  });
});

// --- property-based fuzzing ------------------------------------------------

describe('conservation holds under fuzzing', () => {
  /** Deterministic PRNG so a failure is always reproducible. */
  function mulberry32(seed: number) {
    return function next() {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('never creates or destroys money across 2000 random rule sets', () => {
    const rand = mulberry32(20260811);
    const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
    let checked = 0;

    for (let run = 0; run < 2000; run++) {
      const tierCount = 1 + Math.floor(rand() * 6);
      const tiers: WaterfallTier[] = [];

      for (let i = 0; i < tierCount; i++) {
        const type = pick([
          TierComputationType.FixedAmount,
          TierComputationType.Percentage,
          TierComputationType.ReserveTarget,
        ]);
        const t = tier({ priority: i + 1, computationType: type });

        if (type === TierComputationType.FixedAmount) {
          t.fixedAmountMinor = Math.floor(rand() * 2_000_000);
        } else if (type === TierComputationType.Percentage) {
          t.percentageBps = Math.floor(rand() * 10_001);
        } else {
          t.reserveTargetMinor = Math.floor(rand() * 1_000_000);
          t.reserveCurrentMinor = Math.floor(rand() * 1_000_000);
        }

        if (rand() < 0.3) t.thresholdMinor = Math.floor(rand() * 1_000_000);
        if (rand() < 0.3) {
          const lo = Math.floor(rand() * 500_000);
          t.minimumMinor = lo;
          t.maximumMinor = lo + Math.floor(rand() * 500_000); // keep min <= max
        }
        tiers.push(t);
      }

      // Optionally terminate with a residual tier.
      if (rand() < 0.5) {
        tiers.push(tier({ priority: tiers.length + 1, computationType: TierComputationType.Residual }));
      }

      const rs = ruleSet(tiers);
      if (validateRuleSet(rs).length > 0) continue;

      const inflow = Math.floor(rand() * 10_000_000);
      const result = calculateWaterfall(rs, input({ inflowMinor: inflow }), META);
      checked++;

      assert.equal(
        result.totalAllocatedMinor + result.unallocatedMinor,
        inflow,
        `conservation broken on run ${run}`,
      );
      assert.ok(result.totalAllocatedMinor >= 0, `negative total on run ${run}`);
      assert.ok(result.unallocatedMinor >= 0, `negative residual on run ${run}`);
      assert.equal(result.lines.length, tiers.length, `missing lines on run ${run}`);

      // Per-line ledger continuity: each line's arithmetic must close.
      for (const line of result.lines) {
        assert.ok(line.allocatedMinor >= 0);
        assert.equal(
          line.availableBeforeMinor - line.allocatedMinor,
          line.remainingAfterMinor,
          `line ledger broken on run ${run}`,
        );
      }

      // The sum of line allocations must equal the reported total.
      const summed = result.lines.reduce((acc, l) => acc + l.allocatedMinor, 0);
      assert.equal(summed, result.totalAllocatedMinor, `line sum mismatch on run ${run}`);
    }

    assert.ok(checked > 500, `expected a meaningful sample, only checked ${checked}`);
  });
});

// --- reporting -------------------------------------------------------------

describe('summarizeByCategory', () => {
  it('aggregates allocations by category', () => {
    const rs = ruleSet([
      tier({ priority: 1, category: AllocationCategory.StatutoryTax, fixedAmountMinor: 100_000 }),
      tier({ priority: 2, category: AllocationCategory.StatutoryTax, fixedAmountMinor: 50_000 }),
      tier({
        priority: 3,
        category: AllocationCategory.FoundationAllocation,
        computationType: TierComputationType.Residual,
      }),
    ]);
    const result = calculateWaterfall(rs, input({ inflowMinor: 1_000_000 }), META);
    const summary = summarizeByCategory(result);
    const find = (c: AllocationCategory) => summary.find((s) => s.category === c)?.allocatedMinor;

    // Two StatutoryTax tiers must collapse into one line.
    assert.equal(find(AllocationCategory.StatutoryTax), 150_000);
    assert.equal(find(AllocationCategory.FoundationAllocation), 850_000);

    // Sorted by size, descending, for direct use in reports.
    assert.deepEqual(
      summary.map((s) => s.category),
      [AllocationCategory.FoundationAllocation, AllocationCategory.StatutoryTax],
    );

    // The summary must account for every allocated unit.
    const total = summary.reduce((a, s) => a + s.allocatedMinor, 0);
    assert.equal(total, result.totalAllocatedMinor);
  });
});
