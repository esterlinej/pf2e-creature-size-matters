/**
 * libWrapper WRAPPER helpers — `wrapped` must run exactly once on every code path.
 */

/**
 * @typedef {{
 *   isEnabled: () => boolean,
 *   isReadyForAdjustment: () => boolean,
 *   computeAdjustedMetrics: (encounter: unknown) => object | null,
 *   guard: { inProgress: boolean },
 *   onAdjustmentError?: (err: unknown) => void,
 * }} AnalyzeWrapperDeps
 */

/**
 * @param {AnalyzeWrapperDeps} deps
 * @param {Function} wrapped
 * @param {unknown} encounter
 * @param {unknown[]} args
 */
export function chainAnalyzeWithAdjustment(deps, wrapped, encounter, args) {
    if (deps.guard.inProgress) {
        return wrapped.apply(encounter, args);
    }

    const vanilla = wrapped.apply(encounter, args);

    if (!deps.isEnabled() || !deps.isReadyForAdjustment()) {
        return vanilla;
    }

    try {
        deps.guard.inProgress = true;
        const adjusted = deps.computeAdjustedMetrics(encounter);
        return adjusted ?? vanilla;
    } catch (err) {
        deps.onAdjustmentError?.(err);
        return vanilla;
    } finally {
        deps.guard.inProgress = false;
    }
}

/**
 * @param {AnalyzeWrapperDeps} deps
 */
export function createAnalyzeLibWrapper(deps) {
    return function analyzeSizeWrapper(wrapped, ...args) {
        return chainAnalyzeWithAdjustment(deps, wrapped, this, args);
    };
}

/**
 * @typedef {{
 *   isEnabled: () => boolean,
 *   adjustNpcLevels: (levels: number[]) => number[],
 *   onError?: (err: unknown) => void,
 * }} CalculateXpWrapperDeps
 */

/**
 * @param {CalculateXpWrapperDeps} deps
 * @param {Function} wrapped
 * @param {unknown[]} callArgs — [partyLevel, partySize, npcLevels, hazards, dcOptions]
 */
export function chainCalculateXp(deps, wrapped, callArgs) {
    const invoke = (npcLevels) => wrapped(...callArgs.slice(0, 2), npcLevels, ...callArgs.slice(3));

    try {
        if (!deps.isEnabled()) {
            return invoke(callArgs[2]);
        }
        return invoke(deps.adjustNpcLevels(callArgs[2]));
    } catch (err) {
        deps.onError?.(err);
        return invoke(callArgs[2]);
    }
}

/**
 * @param {CalculateXpWrapperDeps} deps
 */
export function createCalculateXpLibWrapper(deps) {
    return function calculateXpWrapper(wrapped, partyLevel, partySize, npcLevels, hazards, dcOptions) {
        return chainCalculateXp(deps, wrapped, [partyLevel, partySize, npcLevels, hazards, dcOptions]);
    };
}
