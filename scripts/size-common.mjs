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

/** Medium is always the encounter XP / threat reference (category 2). */
export const ENCOUNTER_REFERENCE_SIZE = 'med';
export const ENCOUNTER_REFERENCE_CATEGORY = SIZE_MAP[ENCOUNTER_REFERENCE_SIZE];

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

/**
 * Size steps relative to Medium: Tiny -2, Small -1, Medium 0, Large +1, Huge +2, Gargantuan +3.
 * @param {ActorPF2e} actor
 * @returns {number}
 */
export function getSizeLevelShift(actor) {
    if (!actor?.size && !actor?.isOfType?.('character', 'npc')) return 0;
    const category = SIZE_MAP[getEffectiveSize(actor)] ?? ENCOUNTER_REFERENCE_CATEGORY;
    return category - ENCOUNTER_REFERENCE_CATEGORY;
}

export function isSizeEncounterXpEnabled() {
    return game.settings.get(MODULE_ID, 'sizeAdjustedEncounter') === true;
}

/**
 * Level used for PF2e encounter XP/threat only (does not mutate the actor).
 * @param {ActorPF2e} actor
 */
export function getEncounterBudgetLevel(actor) {
    const base = actor?.level ?? 0;
    if (!isSizeEncounterXpEnabled()) return base;
    if (!actor?.isOfType?.('character', 'npc')) return base;
    return base + getSizeLevelShift(actor);
}

/**
 * GM-facing label, e.g. "Lv 4 → effective 6 (Huge)".
 * @param {ActorPF2e} actor
 */
export function formatEncounterEffectiveLevel(actor) {
    if (!actor?.isOfType?.('character', 'npc')) return '';
    const shift = getSizeLevelShift(actor);
    if (shift === 0) return '';
    const base = actor.level;
    const effective = base + shift;
    const sizeLabel = SIZE_LABELS[getEffectiveSize(actor)] ?? getEffectiveSize(actor);
    return game.i18n.format(`${MODULE_ID}.encounter.effectiveLevel`, {
        base,
        effective,
        size: sizeLabel
    });
}
