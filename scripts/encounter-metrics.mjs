/**
 * PF2e encounter metrics (mirrors EncounterPF2e.analyze) with optional size-adjusted NPC levels.
 */

import {
    MODULE_ID,
    getEffectiveSize,
    getEncounterBudgetLevel,
    getSizeLevelShift,
    getPartyActorMembers,
    getPartyReferenceSizeStep,
    categoryToSizeLabel,
    isSizeEncounterXpEnabled,
    SIZE_LABELS,
} from './size-common.mjs';

/**
 * @param {EncounterPF2e} encounter
 * @param {ActorPF2e[]} partyMembers
 */
export function collectOppositionActors(encounter, partyMembers) {
    const opposition = [];
    const seen = new Set();
    for (const combatant of encounter.combatants) {
        const actor = combatant.actor;
        if (!actor || partyMembers.includes(actor)) continue;
        const counts = actor.alliance === 'opposition' || actor.isOfType?.('hazard');
        if (!counts) continue;
        if (seen.has(actor.id)) continue;
        seen.add(actor.id);
        opposition.push(actor);
    }
    return opposition;
}

/** @param {ActorPF2e} actor */
export function isPf2eEncounterOpposition(actor) {
    if (!actor) return false;
    if (actor.isOfType?.('hazard')) return true;
    return actor.alliance === 'opposition' && actor.isOfType?.('character', 'npc');
}

/**
 * @param {EncounterPF2e} encounter
 * @param {typeof game.pf2e.gm.calculateXP} calculateXP
 */
export function computeEncounterMetrics(encounter, calculateXP) {
    if (!game.ready || !game.pf2e?.gm) return null;

    const partyMembers = getPartyActorMembers();
    const fightyPartyMembers = (() => {
        const inEncounter = partyMembers.filter((m) => m.combatant?.encounter === encounter);
        return inEncounter.length > 0 ? inEncounter : partyMembers;
    })();

    const opposition = collectOppositionActors(encounter, partyMembers);
    if (!game.actors.party || fightyPartyMembers.length === 0 || opposition.length === 0) {
        return null;
    }

    const partyCharacters = fightyPartyMembers.filter((m) => m.isOfType?.('character'));
    if (partyCharacters.length === 0) return null;

    const partyLevel = Math.round(
        partyCharacters.reduce((sum, actor) => sum + actor.level, 0) / partyCharacters.length
    );

    const referenceStep = getPartyReferenceSizeStep(fightyPartyMembers);

    const npcActors = opposition.filter((a) => a.isOfType?.('character', 'npc'));
    const useAdjusted = isSizeEncounterXpEnabled();
    const npcLevels = npcActors.map((a) => (
        useAdjusted ? getEncounterBudgetLevel(a, referenceStep) : a.level
    ));

    const hazards = opposition
        .filter((a) => a.isOfType?.('hazard'))
        .map((h) => ({
            level: h.level,
            isComplex: h.isComplex ?? h.system?.details?.isComplex
        }));

    const xpFn = calculateXP ?? game.pf2e.gm.calculateXP;
    const pwol = Boolean(game.pf2e.settings?.variants?.pwol?.enabled);
    const result = xpFn.call(
        game.pf2e.gm,
        partyLevel,
        fightyPartyMembers.length,
        npcLevels,
        hazards,
        { pwol }
    );

    const threat = result.rating;
    const budget = {
        spent: result.totalXP,
        max: result.encounterBudgets[threat],
        partyLevel
    };
    const award = {
        xp: Math.floor(result.xpPerPlayer * (fightyPartyMembers.length / partyMembers.length)),
        recipients: partyMembers
    };

    const metrics = {
        threat,
        budget,
        award,
        participants: { party: fightyPartyMembers, opposition }
    };

    if (useAdjusted) {
        const opponentNotes = npcActors
            .filter((a) => getSizeLevelShift(a, referenceStep) !== 0)
            .map((a) => ({
                id: a.id,
                name: a.name,
                base: a.level,
                effective: getEncounterBudgetLevel(a, referenceStep),
                size: SIZE_LABELS[getEffectiveSize(a)] ?? a.size
            }));
        metrics[MODULE_ID] = {
            referenceCategory: referenceStep,
            referenceLabel: categoryToSizeLabel(referenceStep),
            opponents: opponentNotes
        };
    }

    return metrics;
}
