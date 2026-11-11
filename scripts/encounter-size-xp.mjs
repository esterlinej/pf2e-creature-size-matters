/**
 * Size-adjusted encounter level for XP / threat (party reference, GM-only display).
 */

import {
    MODULE_ID,
    getEncounterBudgetLevel,
    getSizeLevelShift,
    formatEncounterEffectiveLevel,
    isSizeEncounterXpEnabled,
    getPartyActorMembers,
    resolveEncounterReferenceStep,
} from './size-common.mjs';
import {
    collectOppositionActors,
    isPf2eEncounterOpposition,
    computeEncounterMetrics,
} from './encounter-metrics.mjs';
import {
    createAnalyzeLibWrapper,
    createCalculateXpLibWrapper,
} from './encounter-wrapper-logic.mjs';

/** @type {{
 *   active: boolean,
 *   viaLibWrapper: boolean,
 *   analyzeOriginal: Function | null,
 *   vanillaCalculateXP: Function | null,
 * }} */
const patchState = {
    active: false,
    viaLibWrapper: false,
    analyzeOriginal: null,
    vanillaCalculateXP: null,
};

/** lib-wrapper `package_id` must match module.json `id` exactly (not a suffixed wrapper name). */
const LIBWRAPPER_PACKAGE_ID = MODULE_ID;

let syncTimer;
let metricsRefreshTimer;
/** Prevents re-entrant size adjustment while computing metrics (vanilla analyze still chains). */
const analyzeGuard = { inProgress: false };

const analyzeSizeWrapper = createAnalyzeLibWrapper({
    guard: analyzeGuard,
    isEnabled: () => isSizeEncounterXpEnabled(),
    isReadyForAdjustment: () => Boolean(game.ready && game.pf2e?.gm),
    computeAdjustedMetrics: (encounter) => computeEncounterMetrics(encounter, getVanillaCalculateXP()),
    onAdjustmentError: (err) => {
        console.warn(`${MODULE_ID} | analyze wrapper adjustment failed; using vanilla metrics`, err);
    },
});

/** @param {number[]} npcLevels @param {ActorPF2e[]} oppositionActors */
function mergeAdjustedNpcLevels(npcLevels, oppositionActors) {
    if (oppositionActors.length !== npcLevels.length) return npcLevels;
    const referenceStep = resolveEncounterReferenceStep(game.combat);
    return oppositionActors.map((actor, index) => {
        const sheetLevel = actor.level;
        const budgetLevel = getEncounterBudgetLevel(actor, referenceStep);
        if (npcLevels[index] === sheetLevel) return budgetLevel;
        if (npcLevels[index] === budgetLevel) return budgetLevel;
        return npcLevels[index];
    });
}

/** @param {number[]} npcLevels */
function adjustNpcLevelsForCalculateXP(npcLevels) {
    if (!isSizeEncounterXpEnabled()) return npcLevels;

    if (canvas?.ready) {
        const fromCanvas = canvas.tokens.controlled
            .flatMap((t) => t.actor ?? [])
            .filter((a) => isPf2eEncounterOpposition(a) && a.isOfType?.('character', 'npc'));
        const merged = mergeAdjustedNpcLevels(npcLevels, fromCanvas);
        if (merged.some((lvl, i) => lvl !== npcLevels[i])) return merged;
    }

    const encounter = game.combat;
    if (encounter) {
        const opposition = collectOppositionActors(encounter, getPartyActorMembers())
            .filter((a) => a.isOfType?.('character', 'npc'));
        const referenceStep = resolveEncounterReferenceStep(encounter);
        if (opposition.length === npcLevels.length) {
            return opposition.map((a) => getEncounterBudgetLevel(a, referenceStep));
        }
        return npcLevels.map((level) => {
            const actor = opposition.find((a) => a.level === level);
            return actor ? getEncounterBudgetLevel(actor, referenceStep) : level;
        });
    }

    return npcLevels;
}

const calculateXpWrapper = createCalculateXpLibWrapper({
    isEnabled: () => isSizeEncounterXpEnabled(),
    adjustNpcLevels: adjustNpcLevelsForCalculateXP,
    onError: (err) => {
        console.warn(`${MODULE_ID} | calculateXP wrapper adjustment failed; using vanilla levels`, err);
    },
});

function getVanillaCalculateXP() {
    if (!patchState.vanillaCalculateXP) {
        captureVanillaCalculateXP();
    }
    return patchState.vanillaCalculateXP;
}

function captureVanillaCalculateXP() {
    if (!patchState.vanillaCalculateXP) {
        patchState.vanillaCalculateXP = game.pf2e.gm.calculateXP.bind(game.pf2e.gm);
    }
}

function canInstallPatches() {
    return Boolean(
        game.pf2e?.gm?.calculateXP
        && CONFIG.Combat?.documentClass?.prototype?.analyze
    );
}

function installLibWrapperPatches() {
    captureVanillaCalculateXP();
    const libWrapper = globalThis.libWrapper;
    if (!libWrapper || !LIBWRAPPER_PACKAGE_ID) {
        return false;
    }

    try {
        libWrapper.register(
            LIBWRAPPER_PACKAGE_ID,
            'CONFIG.Combat.documentClass.prototype.analyze',
            analyzeSizeWrapper,
            'WRAPPER'
        );
        libWrapper.register(
            LIBWRAPPER_PACKAGE_ID,
            'game.pf2e.gm.calculateXP',
            calculateXpWrapper,
            'WRAPPER'
        );
        patchState.viaLibWrapper = true;
        return true;
    } catch (err) {
        console.warn(`${MODULE_ID} | libWrapper register failed; using plain patches`, err);
        try {
            libWrapper.unregister(LIBWRAPPER_PACKAGE_ID);
        } catch (unregisterErr) {
            console.warn(`${MODULE_ID} | libWrapper unregister after failed register`, unregisterErr);
        }
        patchState.viaLibWrapper = false;
        return false;
    }
}

function removeLibWrapperPatches() {
    const libWrapper = globalThis.libWrapper;
    if (!libWrapper) return;
    try {
        libWrapper.unregister(LIBWRAPPER_PACKAGE_ID);
    } catch (err) {
        console.warn(`${MODULE_ID} | libWrapper unregister`, err);
    }
    patchState.viaLibWrapper = false;
}

function installPlainPatches() {
    if (patchState.active) return;
    captureVanillaCalculateXP();

    const proto = CONFIG.Combat.documentClass.prototype;
    patchState.analyzeOriginal = proto.analyze;
    proto.analyze = function sizeMattersAnalyzePatched(...args) {
        return analyzeSizeWrapper.call(this, patchState.analyzeOriginal.bind(this), ...args);
    };

    const original = patchState.vanillaCalculateXP;
    game.pf2e.gm.calculateXP = function sizeMattersCalculateXpPatched(...args) {
        return calculateXpWrapper(original, ...args);
    };
    patchState.viaLibWrapper = false;
}

function removePlainPatches() {
    if (patchState.viaLibWrapper) return;

    const proto = CONFIG.Combat.documentClass.prototype;
    if (patchState.analyzeOriginal) {
        proto.analyze = patchState.analyzeOriginal;
        patchState.analyzeOriginal = null;
    }
    if (patchState.vanillaCalculateXP) {
        game.pf2e.gm.calculateXP = patchState.vanillaCalculateXP;
    }
}

// ─── Settings ────────────────────────────────────────────────────────────────

Hooks.once('init', () => {
    game.settings.register(MODULE_ID, 'sizeAdjustedEncounter', {
        name: 'Size-Adjusted Encounter Level',
        hint: 'Shifts opposition effective level for encounter XP/threat vs the party\'s average size (Small PCs as Medium when that setting is on). Patches apply while enabled; lib-wrapper recommended but optional.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: false,
        requiresReload: false,
        onChange: () => queueSyncEncounterXpPatches()
    });

    game.settings.register(MODULE_ID, 'libWrapperNoticeShown', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });
});

function maybeNotifyLibWrapperRecommendation() {
    if (globalThis.libWrapper || !game.user?.isGM) return;
    if (game.settings.get(MODULE_ID, 'libWrapperNoticeShown')) return;

    ui.notifications.info(game.i18n.localize(`${MODULE_ID}.encounter.libWrapperRecommended`), { permanent: false });
    game.settings.set(MODULE_ID, 'libWrapperNoticeShown', true);
}

function installEncounterXpPatches() {
    if (patchState.active || !canInstallPatches()) return;

    const usedLibWrapper = globalThis.libWrapper && installLibWrapperPatches();
    if (!usedLibWrapper) {
        installPlainPatches();
        if (!globalThis.libWrapper) {
            maybeNotifyLibWrapperRecommendation();
        }
    }

    patchState.active = true;
}

function removeEncounterXpPatches() {
    if (!patchState.active) return;

    if (patchState.viaLibWrapper) {
        removeLibWrapperPatches();
    } else {
        removePlainPatches();
    }

    patchState.active = false;
    patchState.viaLibWrapper = false;
}

function syncEncounterXpPatches() {
    if (!game.pf2e) return;

    if (isSizeEncounterXpEnabled()) {
        installEncounterXpPatches();
    } else {
        removeEncounterXpPatches();
    }
    if (game.ready) {
        queueMetricsRefresh();
    }
}

function queueSyncEncounterXpPatches() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncEncounterXpPatches(), 0);
}

function refreshAllEncounterMetrics() {
    if (!game.ready || !game.user?.isGM) return;
    try {
        for (const encounter of game.combats) {
            if (typeof encounter.prepareDerivedData === 'function') {
                encounter.prepareDerivedData();
            } else {
                encounter.reset();
            }
        }
    } catch (err) {
        console.warn(`${MODULE_ID} | refreshAllEncounterMetrics failed`, err);
        return;
    }
    rerenderCombatTracker();
}

function rerenderCombatTracker() {
    const combatApp = ui.combat;
    if (!combatApp?.rendered) return;
    combatApp.render({ force: true });
}

// ─── Combat tracker UI (GM only) ─────────────────────────────────────────────

function clearEncounterUiDecorations(root = document) {
    for (const el of root.querySelectorAll('.size-matters-encounter-level, .size-matters-metrics-note')) {
        el.remove();
    }
}

/** @param {ActorPF2e} actor */
function shouldAnnotateOpposition(actor) {
    if (!actor?.isOfType?.('character', 'npc')) return false;
    if (actor.alliance === 'party') return false;
    if (getSizeLevelShift(actor, resolveEncounterReferenceStep(game.combat)) === 0) return false;
    return isPf2eEncounterOpposition(actor);
}

function annotateCombatTrackerLevelDisplays(root) {
    if (!game.user.isGM || !isSizeEncounterXpEnabled() || !root) return;

    const encounter = game.combat;
    if (!encounter) return;

    for (const row of root.querySelectorAll('li.combatant[data-combatant-id]')) {
        const combatant = encounter.combatants.get(row.dataset.combatantId);
        const actor = combatant?.actor;
        if (!shouldAnnotateOpposition(actor)) continue;

        const note = formatEncounterEffectiveLevel(actor);
        if (!note) continue;

        const levelEl = row.querySelector('.actor-level')
            ?? row.querySelector('.combatant-level')
            ?? row.querySelector('.token-metadata .level');

        if (levelEl) {
            if (levelEl.querySelector('.size-matters-encounter-level')) continue;
            const span = document.createElement('span');
            span.classList.add('size-matters-encounter-level');
            span.dataset.tooltip = note;
            span.textContent = ` → eff. ${getEncounterBudgetLevel(actor)}`;
            span.style.opacity = '0.85';
            span.style.fontSize = 'var(--font-size-12, 0.75rem)';
            levelEl.appendChild(span);
            continue;
        }

        const nameAnchor = row.querySelector('.token-name .name')
            ?? row.querySelector('.token-name strong .name')
            ?? row.querySelector('.combatant-name');
        if (!nameAnchor || row.querySelector('.size-matters-encounter-level')) continue;

        const badge = document.createElement('span');
        badge.classList.add('size-matters-encounter-level');
        badge.dataset.tooltip = note;
        badge.textContent = ` [eff. ${getEncounterBudgetLevel(actor)}]`;
        badge.style.fontSize = 'var(--font-size-11, 0.7rem)';
        badge.style.opacity = '0.9';
        nameAnchor.appendChild(badge);
    }
}

function decorateEncounterTracker(app, element) {
    if (!game.user.isGM) return;

    const root = (element instanceof HTMLElement ? element : null)
        ?? app?.element
        ?? null;
    if (!root) return;

    clearEncounterUiDecorations(root);

    const tracker = root.querySelector('.directory-list')
        ?? root.querySelector('ol.combat-tracker')
        ?? root.querySelector('[data-application-part="tracker"]')
        ?? root;

    annotateCombatTrackerLevelDisplays(tracker);
}

Hooks.once('pf2e.systemReady', () => {
    captureVanillaCalculateXP();
    syncEncounterXpPatches();
});

Hooks.on('settingChanged', (module, key) => {
    if (module !== MODULE_ID || key !== 'sizeAdjustedEncounter') return;
    queueSyncEncounterXpPatches();
});

function queueMetricsRefresh() {
    clearTimeout(metricsRefreshTimer);
    metricsRefreshTimer = setTimeout(() => refreshAllEncounterMetrics(), 50);
}

Hooks.on('createCombatant', queueMetricsRefresh);
Hooks.on('deleteCombatant', queueMetricsRefresh);
Hooks.on('updateActor', (actor, changes) => {
    if (!actor?.combatant) return;
    const details = changes.system?.details ?? {};
    const traits = changes.system?.traits ?? {};
    if ('level' in details || 'size' in traits || 'value' in traits) {
        queueMetricsRefresh();
    }
});

Hooks.on('renderApplication', (app, element) => {
    if (app?.constructor?.name !== 'EncounterTracker') return;
    requestAnimationFrame(() => decorateEncounterTracker(app, element));
});

// ─── Chat card encounter level line (exported for size-differential) ───────────

/** @param {ActorPF2e} actor */
export function buildEncounterXpLevelLine(actor) {
    if (!game.user?.isGM || !isSizeEncounterXpEnabled()) return '';
    if (!actor?.isOfType?.('character', 'npc') || actor.alliance === 'party') return '';
    if (getSizeLevelShift(actor) === 0) return '';
    const note = formatEncounterEffectiveLevel(actor);
    if (!note) return '';
    return `<p class="size-matters-xp-level">📊 ${game.i18n.localize(`${MODULE_ID}.encounter.chatCardPrefix`)}: <em>${note}</em></p>`;
}
