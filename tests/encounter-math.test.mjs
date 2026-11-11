/**
 * Joel lineup: party ref Medium; Jhymm Lv 11 Large → eff 12; Moderate/80 vs Severe/120.
 */
import assert from 'node:assert/strict';
import {
    MODULE_ID,
    getPartyReferenceSizeStep,
    getEncounterBudgetLevel,
    getSizeLevelShift,
    categoryToSizeLabel,
} from '../scripts/size-common.mjs';
import { computeEncounterMetrics } from '../scripts/encounter-metrics.mjs';

const settings = {
    [`${MODULE_ID}.sizeAdjustedEncounter`]: false,
    [`${MODULE_ID}.treatSmallPCsAsMedium`]: true,
};

function makeActor({ id, name, level, size, alliance, type = 'character' }) {
    return {
        id,
        name,
        level,
        size,
        alliance,
        type,
        isOfType(...kinds) {
            return kinds.includes(type) || (kinds.includes('npc') && type === 'npc');
        },
        system: { traits: { value: [] } },
        combatant: null,
    };
}

function installGameMock({ sizeEncounterOn }) {
    settings[`${MODULE_ID}.sizeAdjustedEncounter`] = sizeEncounterOn;

    const partyPcs = [
        makeActor({ id: 'pc1', name: 'Uzul', level: 9, size: 'med', alliance: 'party' }),
        makeActor({ id: 'pc2', name: 'Gurn', level: 9, size: 'med', alliance: 'party' }),
        makeActor({ id: 'pc3', name: "G'roynn", level: 9, size: 'med', alliance: 'party' }),
        makeActor({ id: 'pc4', name: 'Rindell', level: 9, size: 'med', alliance: 'party' }),
    ];

    const jhymm = makeActor({
        id: 'jhymm',
        name: 'Big Jhymm',
        level: 11,
        size: 'lg',
        alliance: 'opposition',
        type: 'npc',
    });

    const encounterRef = { combatants: [] };
    let index = 0;
    for (const actor of [...partyPcs, jhymm]) {
        const combatant = { id: String(index), actor, encounter: encounterRef };
        actor.combatant = combatant;
        encounterRef.combatants.push(combatant);
        index += 1;
    }

    const calculateXP = (_partyLevel, _partySize, npcLevels) => {
        const level = npcLevels[0] ?? 0;
        if (level >= 12) {
            return {
                rating: 'severe',
                totalXP: 120,
                encounterBudgets: { severe: 120, moderate: 100 },
                xpPerPlayer: 30,
            };
        }
        return {
            rating: 'moderate',
            totalXP: 80,
            encounterBudgets: { moderate: 100, severe: 120 },
            xpPerPlayer: 20,
        };
    };

    globalThis.game = {
        ready: true,
        settings: {
            get(module, key) {
                return settings[`${module}.${key}`];
            },
        },
        pf2e: {
            gm: { calculateXP },
            settings: { variants: { pwol: { enabled: false } } },
        },
        actors: {
            party: { members: partyPcs },
        },
        combats: [],
        i18n: { format: () => '' },
    };

    return { encounter: encounterRef, jhymm, partyPcs, calculateXP };
}

// Party reference
{
    const { partyPcs } = installGameMock({ sizeEncounterOn: false });
    const ref = getPartyReferenceSizeStep(partyPcs);
    assert.equal(ref, 2, 'party average size step = Medium (2)');
    assert.equal(categoryToSizeLabel(ref), 'Medium');
}

// Jhymm effective level when setting on
{
    installGameMock({ sizeEncounterOn: true });
    const jhymm = makeActor({
        id: 'jhymm',
        name: 'Big Jhymm',
        level: 11,
        size: 'lg',
        alliance: 'opposition',
        type: 'npc',
    });
    assert.equal(getSizeLevelShift(jhymm, 2), 1);
    assert.equal(getEncounterBudgetLevel(jhymm, 2), 12);
}

// Metrics off → Moderate / 80
{
    const { encounter, calculateXP } = installGameMock({ sizeEncounterOn: false });
    const metrics = computeEncounterMetrics(encounter, calculateXP);
    assert.equal(metrics.threat, 'moderate');
    assert.equal(metrics.budget.spent, 80);
}

// Metrics on → Severe / 120, module metadata
{
    const { encounter, calculateXP } = installGameMock({ sizeEncounterOn: true });
    const metrics = computeEncounterMetrics(encounter, calculateXP);
    assert.equal(metrics.threat, 'severe');
    assert.equal(metrics.budget.spent, 120);
    assert.equal(metrics[MODULE_ID].referenceCategory, 2);
    assert.equal(metrics[MODULE_ID].referenceLabel, 'Medium');
    const jhymmNote = metrics[MODULE_ID].opponents.find((o) => o.name === 'Big Jhymm');
    assert.ok(jhymmNote);
    assert.equal(jhymmNote.effective, 12);
    assert.equal(jhymmNote.base, 11);
}

console.log('encounter-math.test.mjs: ok');
