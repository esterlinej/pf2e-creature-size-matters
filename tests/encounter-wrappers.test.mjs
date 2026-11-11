/**
 * libWrapper WRAPPER contract: wrapped() exactly once on every branch.
 */
import assert from 'node:assert/strict';
import {
    chainAnalyzeWithAdjustment,
    chainCalculateXp,
    createAnalyzeLibWrapper,
    createCalculateXpLibWrapper,
} from '../scripts/encounter-wrapper-logic.mjs';

function countingWrapped(value) {
    let calls = 0;
    const fn = function wrapped(...args) {
        calls += 1;
        return typeof value === 'function' ? value(...args) : value;
    };
    fn.getCalls = () => calls;
    return fn;
}

const vanillaMetrics = { threat: 'moderate', budget: { spent: 80 } };
const adjustedMetrics = { threat: 'severe', budget: { spent: 120 } };

function makeAnalyzeDeps(overrides = {}) {
    const guard = { inProgress: false };
    return {
        guard,
        isEnabled: () => true,
        isReadyForAdjustment: () => true,
        computeAdjustedMetrics: () => adjustedMetrics,
        onAdjustmentError: () => {},
        ...overrides,
        guard: overrides.guard ?? guard,
    };
}

// ─── analyze: setting off ───────────────────────────────────────────────────

{
    const wrapped = countingWrapped(vanillaMetrics);
    const deps = makeAnalyzeDeps({ isEnabled: () => false });
    const result = chainAnalyzeWithAdjustment(deps, wrapped, {}, []);
    assert.equal(wrapped.getCalls(), 1, 'analyze off: wrapped once');
    assert.equal(result, vanillaMetrics);
}

// ─── analyze: not ready for adjustment ─────────────────────────────────────

{
    const wrapped = countingWrapped(vanillaMetrics);
    const deps = makeAnalyzeDeps({ isReadyForAdjustment: () => false });
    const result = chainAnalyzeWithAdjustment(deps, wrapped, {}, []);
    assert.equal(wrapped.getCalls(), 1, 'analyze not ready: wrapped once');
    assert.equal(result, vanillaMetrics);
}

// ─── analyze: setting on, adjustment applied ───────────────────────────────

{
    const wrapped = countingWrapped(vanillaMetrics);
    const deps = makeAnalyzeDeps();
    const result = chainAnalyzeWithAdjustment(deps, wrapped, {}, []);
    assert.equal(wrapped.getCalls(), 1, 'analyze on: wrapped once');
    assert.deepEqual(result, adjustedMetrics);
}

// ─── analyze: re-entry guard ─────────────────────────────────────────────

{
    const wrapped = countingWrapped(vanillaMetrics);
    const guard = { inProgress: true };
    let computeCalls = 0;
    const deps = makeAnalyzeDeps({
        guard,
        computeAdjustedMetrics: () => {
            computeCalls += 1;
            return adjustedMetrics;
        },
    });
    const result = chainAnalyzeWithAdjustment(deps, wrapped, {}, []);
    assert.equal(wrapped.getCalls(), 1, 'analyze re-entry: wrapped once');
    assert.equal(computeCalls, 0, 'analyze re-entry: skip adjustment');
    assert.equal(result, vanillaMetrics);
}

// ─── analyze: adjustment throws ───────────────────────────────────────────

{
    const wrapped = countingWrapped(vanillaMetrics);
    let errors = 0;
    const deps = makeAnalyzeDeps({
        computeAdjustedMetrics: () => {
            throw new Error('adjust failed');
        },
        onAdjustmentError: () => {
            errors += 1;
        },
    });
    const result = chainAnalyzeWithAdjustment(deps, wrapped, {}, []);
    assert.equal(wrapped.getCalls(), 1, 'analyze throw: wrapped once');
    assert.equal(errors, 1);
    assert.equal(result, vanillaMetrics);
}

// ─── analyze: adjustment returns null → vanilla ────────────────────────────

{
    const wrapped = countingWrapped(vanillaMetrics);
    const deps = makeAnalyzeDeps({ computeAdjustedMetrics: () => null });
    const result = chainAnalyzeWithAdjustment(deps, wrapped, {}, []);
    assert.equal(wrapped.getCalls(), 1);
    assert.equal(result, vanillaMetrics);
}

// ─── analyze libWrapper `this` binding ─────────────────────────────────────

{
    const encounter = { id: 'enc1' };
    const wrapped = countingWrapped(vanillaMetrics);
    const deps = makeAnalyzeDeps({ isEnabled: () => false });
    const libFn = createAnalyzeLibWrapper(deps);
    libFn.call(encounter, wrapped);
    assert.equal(wrapped.getCalls(), 1);
}

// ─── calculateXP branches ───────────────────────────────────────────────────

const xpResult = { rating: 'moderate', totalXP: 80 };

{
    const wrapped = countingWrapped(xpResult);
    const result = chainCalculateXp(
        { isEnabled: () => false, adjustNpcLevels: (l) => l.map((x) => x + 99) },
        wrapped,
        [9, 4, [11], [], { pwol: false }]
    );
    assert.equal(wrapped.getCalls(), 1, 'calculateXP off: wrapped once');
    assert.deepEqual(result, xpResult);
}

{
    const wrapped = countingWrapped(xpResult);
    const result = chainCalculateXp(
        {
            isEnabled: () => true,
            adjustNpcLevels: (levels) => levels.map((l) => l + 1),
        },
        wrapped,
        [9, 4, [11], [], { pwol: false }]
    );
    assert.equal(wrapped.getCalls(), 1, 'calculateXP on: wrapped once');
    assert.deepEqual(result, xpResult);
}

{
    const wrapped = countingWrapped(xpResult);
    let errors = 0;
    const result = chainCalculateXp(
        {
            isEnabled: () => true,
            adjustNpcLevels: () => {
                throw new Error('bad adjust');
            },
            onError: () => {
                errors += 1;
            },
        },
        wrapped,
        [9, 4, [11], [], { pwol: false }]
    );
    assert.equal(wrapped.getCalls(), 1, 'calculateXP throw: wrapped once');
    assert.equal(errors, 1);
    assert.deepEqual(result, xpResult);
}

{
    const wrapped = countingWrapped(xpResult);
    const libFn = createCalculateXpLibWrapper({
        isEnabled: () => false,
        adjustNpcLevels: (l) => l,
    });
    libFn(wrapped, 9, 4, [11], [], { pwol: false });
    assert.equal(wrapped.getCalls(), 1);
}

console.log('encounter-wrappers.test.mjs: ok');
