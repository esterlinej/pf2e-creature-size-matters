/**
 * Shared size category helpers for PF2e Creature Size Matters
 */

export const MODULE_ID = 'pf2e-creature-size-matters';

export const SIZE_MAP = {
    tiny: 0, sm: 1, med: 2, lg: 3, huge: 4, grg: 5
};

export const SIZE_LABELS = {
    tiny: 'Tiny', sm: 'Small', med: 'Medium',
    lg: 'Large', huge: 'Huge', grg: 'Gargantuan'
};

/** Fallback reference when no party PCs are available (Medium). */
export const ENCOUNTER_REFERENCE_SIZE = 'med';
export const ENCOUNTER_REFERENCE_CATEGORY = SIZE_MAP[ENCOUNTER_REFERENCE_SIZE];
const MEDIUM_CATEGORY = ENCOUNTER_REFERENCE_CATEGORY;

/** @param {ActorPF2e} actor */
export function isReallyPC(actor) {
    const traits = actor.system?.traits?.value ?? [];
    return actor.isOfType?.('character')
        && !['eidolon', 'minion'].some((t) => traits.includes(t));
}

export function getPartyActorMembers() {
    const { party } = game.actors;
    return party?.members?.filter((a) => a.alliance === 'party' && isReallyPC(a)) ?? [];
}

/**
 * Effective size for differential and encounter rules (respects Small PC setting).
 * @param {ActorPF2e} actor
 */
export function getEffectiveSize(actor) {
    const rawSize = actor?.size;
    if (!rawSize) return ENCOUNTER_REFERENCE_SIZE;
    const isSmallPC = rawSize === 'sm' && actor.type === 'character';
    const treatAsMedium = game.settings.get(MODULE_ID, 'treatSmallPCsAsMedium');

    if (isSmallPC && treatAsMedium) return 'med';
    return rawSize;
}

/** @param {number} category */
export function categoryToSizeLabel(category) {
    for (const [key, value] of Object.entries(SIZE_MAP)) {
        if (value === category) return SIZE_LABELS[key] ?? key;
    }
    return SIZE_LABELS.med;
}

/**
 * Round mean size step; fractional 0.5 ties toward Medium (category 2).
 * @param {number} mean
 */
export function roundPartyReferenceStep(mean) {
    const lower = Math.floor(mean);
    const upper = Math.ceil(mean);
    if (lower === upper) return lower;
    const fraction = mean - lower;
    if (fraction < 0.5) return lower;
    if (fraction > 0.5) return upper;
    const distLower = Math.abs(lower - MEDIUM_CATEGORY);
    const distUpper = Math.abs(upper - MEDIUM_CATEGORY);
    if (distLower < distUpper) return lower;
    if (distUpper < distLower) return upper;
    return MEDIUM_CATEGORY;
}

/**
 * Average party PC size step (Treat Small PCs as Medium applies).
 * @param {ActorPF2e[]} actors
 */
export function getPartyReferenceSizeStep(actors) {
    const pcs = (actors ?? []).filter((a) => isReallyPC(a) && a.isOfType?.('character'));
    if (pcs.length === 0) return MEDIUM_CATEGORY;
    const mean = pcs.reduce((sum, actor) => sum + (SIZE_MAP[getEffectiveSize(actor)] ?? MEDIUM_CATEGORY), 0)
        / pcs.length;
    return roundPartyReferenceStep(mean);
}

/**
 * @param {EncounterPF2e | null | undefined} encounter
 */
export function resolveEncounterReferenceStep(encounter) {
    const cached = encounter?.metrics?.[MODULE_ID]?.referenceCategory;
    if (typeof cached === 'number') return cached;

    const partyMembers = getPartyActorMembers();
    if (!encounter) {
        return getPartyReferenceSizeStep(partyMembers);
    }

    const inEncounter = partyMembers.filter((m) => m.combatant?.encounter === encounter);
    const fighty = inEncounter.length > 0 ? inEncounter : partyMembers;
    return getPartyReferenceSizeStep(fighty);
}

/**
 * Level shift vs party reference size step.
 * @param {ActorPF2e} actor
 * @param {number} [referenceStep]
 */
export function getSizeLevelShift(actor, referenceStep) {
    if (!actor?.size && !actor?.isOfType?.('character', 'npc')) return 0;
    const ref = referenceStep ?? resolveEncounterReferenceStep(game.combat);
    const category = SIZE_MAP[getEffectiveSize(actor)] ?? MEDIUM_CATEGORY;
    return category - ref;
}

export function isSizeEncounterXpEnabled() {
    return game.settings.get(MODULE_ID, 'sizeAdjustedEncounter') === true;
}

/**
 * Level used for PF2e encounter XP/threat only (does not mutate the actor).
 * @param {ActorPF2e} actor
 * @param {number} [referenceStep]
 */
export function getEncounterBudgetLevel(actor, referenceStep) {
    const base = actor?.level ?? 0;
    if (!isSizeEncounterXpEnabled()) return base;
    if (!actor?.isOfType?.('character', 'npc')) return base;
    return base + getSizeLevelShift(actor, referenceStep);
}

/**
 * GM-facing tooltip, e.g. "Lv 11 → effective 12 (Large; party ref. Medium)".
 * @param {ActorPF2e} actor
 * @param {number} [referenceStep]
 */
export function formatEncounterEffectiveLevel(actor, referenceStep) {
    if (!actor?.isOfType?.('character', 'npc')) return '';
    const ref = referenceStep ?? resolveEncounterReferenceStep(game.combat);
    const shift = getSizeLevelShift(actor, ref);
    if (shift === 0) return '';
    const base = actor.level;
    const effective = base + shift;
    const sizeLabel = SIZE_LABELS[getEffectiveSize(actor)] ?? getEffectiveSize(actor);
    return game.i18n.format(`${MODULE_ID}.encounter.effectiveLevel`, {
        base,
        effective,
        size: sizeLabel,
        reference: categoryToSizeLabel(ref)
    });
}

/** Combat tracker badge text, e.g. "CSM: 13". */
export function formatEncounterTrackerMarker(budgetLevel) {
    if (globalThis.game?.i18n) {
        return game.i18n.format(`${MODULE_ID}.encounter.trackerMarker`, { level: budgetLevel });
    }
    return `CSM: ${budgetLevel}`;
}
