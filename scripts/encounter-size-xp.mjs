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

/** @type {{ active: boolean, viaLibWrapper: boolean, analyzeOriginal: Function | null, calculateXpOriginal: Function | null }} */
const patchState = {
    active: false,
    viaLibWrapper: false,
    analyzeOriginal: null,
    calculateXpOriginal: null,
};

const WRAPPER_IDS = {
    analyze: `${MODULE_ID}.analyze`,
    calculateXP: `${MODULE_ID}.calculateXP`,
};

// ─── Settings ────────────────────────────────────────────────────────────────

Hooks.once('init', () => {
    game.settings.register(MODULE_ID, 'sizeAdjustedEncounter', {
        name: `${MODULE_ID}.settings.sizeAdjustedEncounter.name`,
        hint: `${MODULE_ID}.settings.sizeAdjustedEncounter.hint`,
        scope: 'world',
        config: true,
        type: Boolean,
        default: false,
        requiresReload: false
    });

    game.settings.register(MODULE_ID, 'libWrapperNoticeShown', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });
});

// ─── Encounter metrics (combat tracker + award XP) ─────────────────────────────

/** @param {EncounterMetrics} metrics */
function recalculateMetricsFromSize(metrics) {
    const opposition = metrics.participants.opposition ?? [];
    const partyLevel = metrics.budget.partyLevel;
    const fightyParty = metrics.participants.party ?? [];
    const partySize = fightyParty.length;

    const npcActors = opposition.filter((a) => a.isOfType?.('character', 'npc'));
    const npcLevels = npcActors.map((a) => getEncounterBudgetLevel(a));

    const hazards = opposition
        .filter((a) => a.isOfType?.('hazard'))
        .map((h) => ({
            level: h.level,
            isComplex: h.isComplex ?? h.system?.details?.isComplex
        }));

    const pwol = game.pf2e.settings.variants.pwol.enabled;
    const result = game.pf2e.gm.calculateXP(partyLevel, partySize, npcLevels, hazards, { pwol });
    const threat = result.rating;

    const recipients = metrics.award.recipients ?? [];
    const recipientCount = Math.max(recipients.length, 1);
    const award = {
        xp: Math.floor(result.xpPerPlayer * (partySize / recipientCount)),
        recipients
    };

    const opponentNotes = npcActors
        .filter((a) => getSizeLevelShift(a) !== 0)
        .map((a) => ({
            id: a.id,
            name: a.name,
            base: a.level,
            effective: getEncounterBudgetLevel(a),
            size: SIZE_LABELS[getEffectiveSize(a)] ?? a.size
        }));

    return {
        threat,
        budget: {
            spent: result.totalXP,
            max: result.encounterBudgets[threat],
            partyLevel
        },
        award,
        participants: metrics.participants,
        [MODULE_ID]: {
            referenceSize: ENCOUNTER_REFERENCE_SIZE,
            referenceLabel: SIZE_LABELS.med,
            opponents: opponentNotes
        }
    };
}

/**
 * @this {EncounterPF2e}
 * @param {() => EncounterMetrics | null} wrapped
 */
function analyzeSizeWrapper(wrapped) {
    const metrics = wrapped.call(this);
    if (!metrics || !isSizeEncounterXpEnabled()) return metrics;
    return recalculateMetricsFromSize(metrics);
}

/** @param {number[]} npcLevels */
function adjustNpcLevelsForMacro(npcLevels) {
    if (!canvas?.ready) return npcLevels;
    const opposition = canvas.tokens.controlled
        .flatMap((t) => t.actor ?? [])
        .filter((a) => a?.alliance === 'opposition' && a.isOfType?.('character', 'npc'));

    if (opposition.length !== npcLevels.length) return npcLevels;
    return opposition.map((a) => getEncounterBudgetLevel(a));
}

/** @param {typeof game.pf2e.gm.calculateXP} wrapped */
function calculateXpWrapper(wrapped, partyLevel, partySize, npcLevels, hazards, dcOptions) {
    if (!isSizeEncounterXpEnabled()) {
        return wrapped(partyLevel, partySize, npcLevels, hazards, dcOptions);
    }
    const adjusted = adjustNpcLevelsForMacro(npcLevels);
    return wrapped(partyLevel, partySize, adjusted, hazards, dcOptions);
}

function canInstallPatches() {
    return Boolean(
        game.pf2e?.gm?.calculateXP
        && CONFIG.Combat?.documentClass?.prototype?.analyze
    );
}

function installLibWrapperPatches() {
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
    libWrapper.unregister(WRAPPER_IDS.analyze);
    libWrapper.unregister(WRAPPER_IDS.calculateXP);
}

function installPlainPatches() {
    if (patchState.analyzeOriginal) return;

    const proto = CONFIG.Combat.documentClass.prototype;
    patchState.analyzeOriginal = proto.analyze;
    proto.analyze = function sizeMattersAnalyzePatched() {
        return analyzeSizeWrapper(patchState.analyzeOriginal.bind(this));
    };

    patchState.calculateXpOriginal = game.pf2e.gm.calculateXP;
    const original = patchState.calculateXpOriginal;
    game.pf2e.gm.calculateXP = function sizeMattersCalculateXpPatched(...args) {
        return calculateXpWrapper(original.bind(game.pf2e.gm), ...args);
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
    if (patchState.calculateXpOriginal) {
        game.pf2e.gm.calculateXP = patchState.calculateXpOriginal;
        patchState.calculateXpOriginal = null;
    }
}

function maybeNotifyLibWrapperRecommendation(usedLibWrapper) {
    if (usedLibWrapper || !game.user?.isGM) return;
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
        maybeNotifyLibWrapperRecommendation(false);
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
        refreshAllEncounterMetrics();
    } else {
        removeEncounterXpPatches();
        refreshAllEncounterMetrics();
    }
}

function refreshAllEncounterMetrics() {
    if (!game.user?.isGM) return;
    for (const encounter of game.combats) {
        encounter.metrics = encounter.analyze();
    }
    const combatApp = ui.combat;
    if (combatApp?.rendered) {
        combatApp.render({ parts: ['metrics', 'tracker', 'header'] });
    }
}

Hooks.once('pf2e.systemReady', () => {
    syncEncounterXpPatches();
});

Hooks.on('settingChanged', (module, key) => {
    if (module !== MODULE_ID || key !== 'sizeAdjustedEncounter') return;
    syncEncounterXpPatches();
});

// ─── Combat tracker level labels (GM only) ───────────────────────────────────

function annotateCombatTrackerLevelDisplays(root) {
    if (!game.user.isGM || !isSizeEncounterXpEnabled() || !root) return;

    const encounter = game.combat;
    if (!encounter) return;

    for (const row of root.querySelectorAll('li.combatant[data-combatant-id]')) {
        const combatant = encounter.combatants.get(row.dataset.combatantId);
        const actor = combatant?.actor;
        if (!actor || actor.alliance === 'party') continue;

        const note = formatEncounterEffectiveLevel(actor);
        if (!note) continue;

        const levelEl = row.querySelector('.actor-level, .token-name .actor-level');
        if (!levelEl || levelEl.querySelector('.size-matters-encounter-level')) continue;

        const span = document.createElement('span');
        span.classList.add('size-matters-encounter-level');
        span.dataset.tooltip = note;
        span.textContent = ` → eff. ${getEncounterBudgetLevel(actor)}`;
        span.style.opacity = '0.85';
        span.style.fontSize = 'var(--font-size-12, 0.75rem)';
        levelEl.appendChild(span);
    }
}

function appendMetricsReferenceNote() {
    if (!game.user.isGM || !isSizeEncounterXpEnabled()) return;
    const metricsEl = document.querySelector('#combat .metrics, section.metrics');
    if (!metricsEl || metricsEl.querySelector('.size-matters-metrics-note')) return;

    const note = document.createElement('div');
    note.classList.add('size-matters-metrics-note');
    note.style.fontSize = 'var(--font-size-12, 0.75rem)';
    note.style.opacity = '0.9';
    note.style.marginTop = '0.25rem';
    note.textContent = game.i18n.localize(`${MODULE_ID}.encounter.metricsReference`);
    metricsEl.append(note);
}

function onCombatTrackerRender(_app, html) {
    const root = html instanceof HTMLElement ? html : html?.[0] ?? html;
    const tracker = root?.querySelector?.('.directory-list, ol.combat-tracker, .combat-tracker')
        ?? root?.querySelector?.('#combat-tracker')
        ?? root;
    annotateCombatTrackerLevelDisplays(tracker ?? root);
    appendMetricsReferenceNote();
}

Hooks.on('renderCombatTracker', onCombatTrackerRender);

Hooks.on('renderApplication', (app, element) => {
    if (app?.constructor?.name !== 'EncounterTracker') return;
    onCombatTrackerRender(app, element);
});

// ─── Chat card encounter level line (exported for size-differential) ───────────

/** @param {ActorPF2e} actor */
export function buildEncounterXpLevelLine(actor) {
    if (!game.user?.isGM || !isSizeEncounterXpEnabled()) return '';
    const note = formatEncounterEffectiveLevel(actor);
    if (!note) return '';
    return `<p class="size-matters-xp-level">📊 ${game.i18n.localize(`${MODULE_ID}.encounter.chatCardPrefix`)}: <em>${note}</em></p>`;
}
