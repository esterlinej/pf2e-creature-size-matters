/**
 * Size-adjusted encounter level for XP / threat (Medium reference, GM-only display).
 */

import {
    MODULE_ID,
    getEffectiveSize,
    getEncounterBudgetLevel,
    getSizeLevelShift,
    formatEncounterEffectiveLevel,
    isSizeEncounterXpEnabled,
    ENCOUNTER_REFERENCE_SIZE,
    SIZE_LABELS,
} from './size-common.mjs';

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

const WRAPPER_IDS = {
    analyze: `${MODULE_ID}.analyze`,
    calculateXP: `${MODULE_ID}.calculateXP`,
};

let syncTimer;
let metricsRefreshTimer;

// ─── Settings ────────────────────────────────────────────────────────────────

Hooks.once('init', () => {
    game.settings.register(MODULE_ID, 'sizeAdjustedEncounter', {
        name: 'Size-Adjusted Encounter Level',
        hint: 'Shifts opposition effective level for encounter XP/threat only (Medium reference). Patches apply while enabled; lib-wrapper recommended but optional.',
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

// ─── Opposition (matches EncounterPF2e.analyze) ──────────────────────────────

/** @param {ActorPF2e} actor */
function isReallyPC(actor) {
    const traits = actor.system?.traits?.value ?? [];
    return actor.isOfType?.('character')
        && !['eidolon', 'minion'].some((t) => traits.includes(t));
}

function getPartyMembers() {
    const { party } = game.actors;
    return party?.members?.filter((a) => a.alliance === 'party' && isReallyPC(a)) ?? [];
}

/**
 * @param {EncounterPF2e} encounter
 * @param {ActorPF2e[]} partyMembers
 */
function collectOppositionActors(encounter, partyMembers) {
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
function isPf2eEncounterOpposition(actor) {
    if (!actor) return false;
    if (actor.isOfType?.('hazard')) return true;
    return actor.alliance === 'opposition' && actor.isOfType?.('character', 'npc');
}

/** @param {number[]} npcLevels @param {ActorPF2e[]} oppositionActors */
function mergeAdjustedNpcLevels(npcLevels, oppositionActors) {
    if (oppositionActors.length !== npcLevels.length) return npcLevels;
    return oppositionActors.map((actor, index) => {
        const sheetLevel = actor.level;
        const budgetLevel = getEncounterBudgetLevel(actor);
        if (npcLevels[index] === sheetLevel) return budgetLevel;
        if (npcLevels[index] === budgetLevel) return budgetLevel;
        return npcLevels[index];
    });
}

// ─── Encounter metrics (mirrors EncounterPF2e.analyze) ───────────────────────

/**
 * Full encounter metrics — same rules as PF2e core, optional size-adjusted NPC levels.
 * @param {EncounterPF2e} encounter
 */
function computeEncounterMetrics(encounter) {
    if (!game.ready) return null;

    const partyMembers = getPartyMembers();
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

    const npcActors = opposition.filter((a) => a.isOfType?.('character', 'npc'));
    const useAdjusted = isSizeEncounterXpEnabled();
    const npcLevels = npcActors.map((a) => (useAdjusted ? getEncounterBudgetLevel(a) : a.level));

    const hazards = opposition
        .filter((a) => a.isOfType?.('hazard'))
        .map((h) => ({
            level: h.level,
            isComplex: h.isComplex ?? h.system?.details?.isComplex
        }));

    const calculateXP = getVanillaCalculateXP();
    const pwol = game.pf2e.settings.variants.pwol.enabled;
    const result = calculateXP.call(
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
            .filter((a) => getSizeLevelShift(a) !== 0)
            .map((a) => ({
                id: a.id,
                name: a.name,
                base: a.level,
                effective: getEncounterBudgetLevel(a),
                size: SIZE_LABELS[getEffectiveSize(a)] ?? a.size
            }));
        metrics[MODULE_ID] = {
            referenceSize: ENCOUNTER_REFERENCE_SIZE,
            referenceLabel: SIZE_LABELS.med,
            opponents: opponentNotes
        };
    }

    return metrics;
}

/**
 * @this {EncounterPF2e}
 * @param {() => EncounterMetrics | null} wrapped
 */
function analyzeSizeWrapper(wrapped) {
    if (!isSizeEncounterXpEnabled()) return wrapped.call(this);
    return computeEncounterMetrics(this);
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
        const opposition = collectOppositionActors(encounter, getPartyMembers())
            .filter((a) => a.isOfType?.('character', 'npc'));
        if (opposition.length === npcLevels.length) {
            return opposition.map((a) => getEncounterBudgetLevel(a));
        }
        return npcLevels.map((level) => {
            const actor = opposition.find((a) => a.level === level);
            return actor ? getEncounterBudgetLevel(actor) : level;
        });
    }

    return npcLevels;
}

/** @param {typeof game.pf2e.gm.calculateXP} wrapped */
function calculateXpWrapper(wrapped, partyLevel, partySize, npcLevels, hazards, dcOptions) {
    if (!isSizeEncounterXpEnabled()) {
        return wrapped(partyLevel, partySize, npcLevels, hazards, dcOptions);
    }
    const adjusted = adjustNpcLevelsForCalculateXP(npcLevels);
    return wrapped(partyLevel, partySize, adjusted, hazards, dcOptions);
}

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
    libWrapper.register(
        WRAPPER_IDS.analyze,
        'CONFIG.Combat.documentClass.prototype.analyze',
        analyzeSizeWrapper,
        'WRAPPER'
    );
    libWrapper.register(
        WRAPPER_IDS.calculateXP,
        'game.pf2e.gm.calculateXP',
        calculateXpWrapper,
        'WRAPPER'
    );
    patchState.viaLibWrapper = true;
}

function removeLibWrapperPatches() {
    const libWrapper = globalThis.libWrapper;
    if (!libWrapper) return;
    try {
        libWrapper.unregister(WRAPPER_IDS.analyze);
        libWrapper.unregister(WRAPPER_IDS.calculateXP);
    } catch (err) {
        console.warn(`${MODULE_ID} | libWrapper unregister`, err);
    }
}

function installPlainPatches() {
    if (patchState.active) return;
    captureVanillaCalculateXP();

    const proto = CONFIG.Combat.documentClass.prototype;
    patchState.analyzeOriginal = proto.analyze;
    proto.analyze = function sizeMattersAnalyzePatched() {
        return analyzeSizeWrapper(patchState.analyzeOriginal.bind(this));
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

function maybeNotifyLibWrapperRecommendation() {
    if (globalThis.libWrapper || !game.user?.isGM) return;
    if (game.settings.get(MODULE_ID, 'libWrapperNoticeShown')) return;

    ui.notifications.info(game.i18n.localize(`${MODULE_ID}.encounter.libWrapperRecommended`), { permanent: false });
    game.settings.set(MODULE_ID, 'libWrapperNoticeShown', true);
}

function installEncounterXpPatches() {
    if (patchState.active || !canInstallPatches()) return;

    if (globalThis.libWrapper) {
        installLibWrapperPatches();
    } else {
        installPlainPatches();
        maybeNotifyLibWrapperRecommendation();
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
    refreshAllEncounterMetrics();
}

function queueSyncEncounterXpPatches() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncEncounterXpPatches(), 0);
}

function refreshAllEncounterMetrics() {
    if (!game.user?.isGM) return;
    for (const encounter of game.combats) {
        encounter.metrics = encounter.analyze();
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
    if (getSizeLevelShift(actor) === 0) return false;
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

function appendMetricsReferenceNote(root) {
    if (!game.user.isGM || !isSizeEncounterXpEnabled()) return;

    const scope = root instanceof HTMLElement ? root : document;
    for (const metricsEl of scope.querySelectorAll('#combat .metrics, #combat-popout .metrics, section.metrics')) {
        if (metricsEl.querySelector('.size-matters-metrics-note')) continue;
        const note = document.createElement('div');
        note.classList.add('size-matters-metrics-note');
        note.style.fontSize = 'var(--font-size-12, 0.75rem)';
        note.style.opacity = '0.9';
        note.style.marginTop = '0.25rem';
        note.style.flexBasis = '100%';
        note.style.textAlign = 'center';
        note.textContent = game.i18n.localize(`${MODULE_ID}.encounter.metricsReference`);
        metricsEl.append(note);
    }
}

function decorateEncounterTracker(app, element) {
    if (!game.user.isGM) return;

    const root = element instanceof HTMLElement ? element : document;
    clearEncounterUiDecorations(root);

    const tracker = root.querySelector?.('.directory-list')
        ?? root.querySelector?.('ol.combat-tracker')
        ?? root.querySelector?.('[data-application-part="tracker"]')
        ?? root;

    annotateCombatTrackerLevelDisplays(tracker);
    appendMetricsReferenceNote(root);
}

function onCombatTrackerRender(_app, html) {
    const root = html instanceof HTMLElement ? html : html?.[0] ?? html;
    decorateEncounterTracker(_app, root ?? document);
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

Hooks.on('renderCombatTracker', onCombatTrackerRender);

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
