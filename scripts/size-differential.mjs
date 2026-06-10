/**
 * PF2e Creature Size Matters
 * Prompts GM when a larger creature hits a smaller one in melee
 * with bonus damage and a Reflex save requirement
 */

const MODULE_ID = 'pf2e-creature-size-matters';

const SIZE_MAP = {
    tiny: 0, sm: 1, med: 2, lg: 3, huge: 4, grg: 5
};

const SIZE_LABELS = {
    tiny: 'Tiny', sm: 'Small', med: 'Medium',
    lg: 'Large', huge: 'Huge', grg: 'Gargantuan'
};

// ─── Condition UUIDs (PF2e Remaster) ─────────────────────────────────────────

const CONDITION_UUIDS = {
    'off-guard': 'Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg',
    'prone':     'Compendium.pf2e.conditionitems.Item.j91X7x0XSomq8d60',
    'clumsy':    'Compendium.pf2e.conditionitems.Item.i3OJZU2nk64Df3xm'
};

// ─── Settings Registration ────────────────────────────────────────────────────

Hooks.once('init', () => {

    // ── Damage ──────────────────────────────────────────────────────────────

    game.settings.register(MODULE_ID, 'damagePerCategory', {
        name: 'Base Damage Per Size Category',
        hint: 'Flat bonus damage per size category difference. Used unless a tier override is set.',
        scope: 'world', config: true, type: Number, default: 5
    });

    game.settings.register(MODULE_ID, 'damageTier1', {
        name: 'Override: 1 Category Damage',
        hint: 'Leave at 0 to use base damage per category.',
        scope: 'world', config: true, type: Number, default: 0
    });

    game.settings.register(MODULE_ID, 'damageTier2', {
        name: 'Override: 2 Category Damage',
        hint: 'Leave at 0 to use base damage per category.',
        scope: 'world', config: true, type: Number, default: 0
    });

    game.settings.register(MODULE_ID, 'damageTier3', {
        name: 'Override: 3+ Category Damage',
        hint: 'Leave at 0 to use base damage per category.',
        scope: 'world', config: true, type: Number, default: 0
    });

    game.settings.register(MODULE_ID, 'criticalMultiplier', {
        name: 'Double Bonus Damage on Critical Hit',
        hint: 'When enabled, bonus damage is doubled on a critical hit. When disabled, two buttons appear — normal and doubled — letting the GM choose.',
        scope: 'world', config: true, type: Boolean, default: true
    });

    // ── Save ────────────────────────────────────────────────────────────────

    game.settings.register(MODULE_ID, 'baseDC', {
        name: 'Base Reflex DC',
        hint: 'Base DC before size category modifier is applied.',
        scope: 'world', config: true, type: Number, default: 10
    });

    game.settings.register(MODULE_ID, 'dcPerCategory', {
        name: 'DC Modifier Per Size Category',
        hint: 'Added to Base DC per size category difference.',
        scope: 'world', config: true, type: Number, default: 5
    });

    game.settings.register(MODULE_ID, 'conditionTier1', {
        name: 'Condition: 1 Category Difference',
        hint: 'Condition applied on failed save at 1 size category difference.',
        scope: 'world', config: true, type: String,
        choices: {
            'off-guard': 'Off-Guard',
            'clumsy':    'Clumsy 1',
            'none':      'None'
        },
        default: 'off-guard'
    });

    game.settings.register(MODULE_ID, 'conditionTier2', {
        name: 'Condition: 2+ Category Difference',
        hint: 'Condition applied on failed save at 2+ size category difference.',
        scope: 'world', config: true, type: String,
        choices: {
            'prone':     'Prone',
            'off-guard': 'Off-Guard',
            'none':      'None'
        },
        default: 'prone'
    });

    // ── Automation ──────────────────────────────────────────────────────────

    game.settings.register(MODULE_ID, 'autoApplyDamage', {
        name: 'Auto Apply Bonus Damage',
        hint: 'Manual: GM applies damage. Button: click to apply. Auto: applies immediately.',
        scope: 'world', config: true, type: String,
        choices: {
            'manual': 'Manual',
            'button': 'Button in Card',
            'auto':   'Auto Apply'
        },
        default: 'button'
    });

    game.settings.register(MODULE_ID, 'autoRollSave', {
        name: 'Auto Roll Reflex Save',
        hint: 'Automatically rolls the target\'s Reflex save when a size differential hit occurs.',
        scope: 'world', config: true, type: Boolean, default: false
    });

    // ── Display ─────────────────────────────────────────────────────────────

    game.settings.register(MODULE_ID, 'whisperGM', {
        name: 'Whisper to GM Only',
        hint: 'If enabled, the size differential card is only visible to the GM.',
        scope: 'world', config: true, type: Boolean, default: true
    });

    console.log(`${MODULE_ID} | Initialized`);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSizeDifferential(attackerSize, targetSize) {
    const atk = SIZE_MAP[attackerSize] ?? 2;
    const tgt = SIZE_MAP[targetSize]   ?? 2;
    return Math.max(0, atk - tgt);
}

function getBonusDamage(diff) {
    const base  = game.settings.get(MODULE_ID, 'damagePerCategory');
    const tier1 = game.settings.get(MODULE_ID, 'damageTier1');
    const tier2 = game.settings.get(MODULE_ID, 'damageTier2');
    const tier3 = game.settings.get(MODULE_ID, 'damageTier3');

    if (diff >= 3 && tier3 > 0) return tier3;
    if (diff === 2 && tier2 > 0) return tier2;
    if (diff === 1 && tier1 > 0) return tier1;
    return base * diff;
}

function getReflexDC(diff) {
    const base = game.settings.get(MODULE_ID, 'baseDC');
    const mod  = game.settings.get(MODULE_ID, 'dcPerCategory');
    return base + (mod * diff);
}

function getConditionSetting(diff) {
    return diff >= 2
        ? game.settings.get(MODULE_ID, 'conditionTier2')
        : game.settings.get(MODULE_ID, 'conditionTier1');
}

function getConditionLabel(conditionKey) {
    const labels = {
        'off-guard': 'Off-Guard',
        'clumsy':    'Clumsy 1',
        'prone':     'Prone',
        'none':      'None'
    };
    return labels[conditionKey] ?? 'Off-Guard';
}

// ─── Condition Link Helper ────────────────────────────────────────────────────

async function buildConditionLink(conditionKey) {
    const uuid = CONDITION_UUIDS[conditionKey];
    if (!uuid) return `<strong>${getConditionLabel(conditionKey)}</strong>`;

    const label = getConditionLabel(conditionKey);
    const enriched = await TextEditor.enrichHTML(
        `@UUID[${uuid}]{${label}}`,
        { async: true }
    );
    return enriched;
}

// ─── Apply Damage Helper ──────────────────────────────────────────────────────

async function applyBonusDamage(targetUuid, damage) {
    const resolved = await fromUuid(targetUuid);
    const actor = resolved?.actor ?? resolved;
    if (!actor) return false;

    const currentHP = actor.system?.attributes?.hp?.value;
    if (currentHP === undefined) return false;

    const newHP = Math.max(0, currentHP - damage);
    await actor.update({ 'system.attributes.hp.value': newHP });
    return true;
}

// ─── Roll Save Helper ─────────────────────────────────────────────────────────

async function rollReflexSave(targetUuid, reflexDC, conditionLabel) {
    const resolved = await fromUuid(targetUuid);
    const actor = resolved?.actor ?? resolved;
    if (!actor) return false;

    const reflexSave = actor.saves?.reflex;
    if (!reflexSave) {
        console.warn(`${MODULE_ID} | No reflex save found on actor`, actor.name);
        return false;
    }

    await reflexSave.roll({
        dc: { value: reflexDC },
        extraRollNotes: [{
            outcome: ['failure', 'criticalFailure'],
            text: `Becomes <strong>${conditionLabel}</strong>`
        }]
    });
    return true;
}

// ─── Build Apply Buttons ──────────────────────────────────────────────────────

function buildApplyButtons(targetUuid, bonusDamage, isCrit, autoApply, critMultiplierEnabled) {
    if (autoApply === 'manual') {
        const displayDamage = isCrit && critMultiplierEnabled
            ? bonusDamage * 2
            : bonusDamage;
        return `<p class="size-manual-note">📌 Manually apply <strong>${displayDamage}</strong> bonus damage${isCrit && critMultiplierEnabled ? ' <em>(critical ×2)</em>' : ''}</p>`;
    }

    if (autoApply !== 'button') return ''; // 'auto' handled separately

    // Single button — auto-doubled if crit + setting enabled
    if (!isCrit || critMultiplierEnabled) {
        const displayDamage = isCrit && critMultiplierEnabled
            ? bonusDamage * 2
            : bonusDamage;
        const critLabel = isCrit && critMultiplierEnabled ? ' <em>(Critical ×2)</em>' : '';
        return `
            <button class="size-apply-damage"
                data-target-uuid="${targetUuid}"
                data-damage="${displayDamage}">
                ⚔️ Apply ${displayDamage} Bonus Damage${critLabel}
            </button>`;
    }

    // Crit but setting disabled — show two buttons
    const critDamage = bonusDamage * 2;
    return `
        <button class="size-apply-damage"
            data-target-uuid="${targetUuid}"
            data-damage="${bonusDamage}">
            ⚔️ Apply ${bonusDamage} Damage (Normal)
        </button>
        <button class="size-apply-damage"
            data-target-uuid="${targetUuid}"
            data-damage="${critDamage}">
            ⚔️ Apply ${critDamage} Damage (Critical ×2)
        </button>`;
}

// ─── Chat Card ────────────────────────────────────────────────────────────────

async function postSizeDifferentialMessage(attackerActor, targetActor, diff, outcome) {
    const bonusDamage           = getBonusDamage(diff);
    const reflexDC              = getReflexDC(diff);
    const conditionKey          = getConditionSetting(diff);
    const conditionLabel        = getConditionLabel(conditionKey);
    const conditionLink         = await buildConditionLink(conditionKey);
    const atkSize               = SIZE_LABELS[attackerActor.size] ?? attackerActor.size;
    const tgtSize               = SIZE_LABELS[targetActor.size]   ?? targetActor.size;
    const autoApply             = game.settings.get(MODULE_ID, 'autoApplyDamage');
    const whisperGM             = game.settings.get(MODULE_ID, 'whisperGM');
    const autoRoll              = game.settings.get(MODULE_ID, 'autoRollSave');
    const critMultiplierEnabled = game.settings.get(MODULE_ID, 'criticalMultiplier');
    const isCrit                = outcome === 'criticalSuccess';

    // Display damage in card
    const displayDamage = isCrit && critMultiplierEnabled
        ? bonusDamage * 2
        : bonusDamage;
    const critNote = isCrit
        ? critMultiplierEnabled
            ? ' <em>(Critical Hit — ×2)</em>'
            : ' <em>(Critical Hit)</em>'
        : '';

    const applyButtons = buildApplyButtons(
        targetActor.uuid, bonusDamage, isCrit, autoApply, critMultiplierEnabled
    );

    const saveButton = !autoRoll
        ? `<button class="size-roll-save"
               data-target-uuid="${targetActor.uuid}"
               data-dc="${reflexDC}"
               data-condition="${conditionLabel}">
               🎲 Roll Reflex Save DC ${reflexDC}
           </button>`
        : '';

    const content = `
        <div class="pf2e chat-card action-card">
            <header class="card-header flexrow">
                <img src="icons/svg/sword.svg" width="36" height="36" alt="Crossed Swords"/>
                <h3>⚔️ Size Differential Impact${isCrit ? ' 💥' : ''}</h3>
            </header>
            <div class="card-content">
                <p>
                    <strong>${attackerActor.name}</strong> <em>(${atkSize})</em>
                    strikes
                    <strong>${targetActor.name}</strong> <em>(${tgtSize})</em>
                </p>
                <p>Size difference: <strong>${diff} categor${diff === 1 ? 'y' : 'ies'}</strong></p>
                <hr/>
                <p>📌 Bonus damage: <strong>${displayDamage}</strong>${critNote}</p>
                <p>📌 <strong>${targetActor.name}</strong> must succeed at
                   <strong>Reflex DC ${reflexDC}</strong>
                   or become ${conditionLink}
                </p>
                <div class="size-buttons flexcol" style="gap:4px; margin-top:8px;">
                    ${applyButtons}
                    ${saveButton}
                </div>
            </div>
        </div>
    `;

    const whisper = whisperGM ? ChatMessage.getWhisperRecipients('GM') : [];

    await ChatMessage.create({
        content,
        speaker: { alias: 'Size Rules' },
        whisper
    });

    // Auto apply damage
    if (autoApply === 'auto') {
        await applyBonusDamage(targetActor.uuid, displayDamage);
    }

    // Auto roll save
    if (autoRoll) {
        await rollReflexSave(targetActor.uuid, reflexDC, conditionLabel);
    }
}

// ─── Button Click Handlers ────────────────────────────────────────────────────

Hooks.on('renderChatMessage', (message, html) => {

    // Apply damage button(s)
    html.find('.size-apply-damage').on('click', async (event) => {
        if (!game.user.isGM) return;
        const btn        = event.currentTarget;
        const targetUuid = btn.dataset.targetUuid;
        const damage     = parseInt(btn.dataset.damage);

        const success = await applyBonusDamage(targetUuid, damage);
        if (success) {
            html.find('.size-apply-damage').prop('disabled', true);
            btn.textContent = '✅ Damage Applied';
        } else {
            ui.notifications.warn('Size Matters: Could not find target actor to apply damage.');
        }
    });

    // Roll save button
    html.find('.size-roll-save').on('click', async (event) => {
        if (!game.user.isGM) return;
        const btn        = event.currentTarget;
        const targetUuid = btn.dataset.targetUuid;
        const dc         = parseInt(btn.dataset.dc);
        const condition  = btn.dataset.condition;

        const success = await rollReflexSave(targetUuid, dc, condition);
        if (success) {
            btn.disabled    = true;
            btn.textContent = '✅ Save Rolled';
        } else {
            ui.notifications.warn('Size Matters: Could not find target actor to roll save.');
        }
    });
});

// ─── Main Hook ────────────────────────────────────────────────────────────────

Hooks.on('createChatMessage', async (message) => {
    if (!game.user.isGM) return;

    const flags = message.flags?.pf2e;
    if (!flags) return;

    const context = flags.context;
    if (!context) return;

    // Melee attacks only
    if (!context.domains?.includes('melee-attack-roll')) return;

    // Hits only
    const outcome = context.outcome;
    if (!outcome || outcome === 'failure' || outcome === 'criticalFailure') return;

    // Get attacker
    const attackerActor = message.actor;
    if (!attackerActor) return;

    // Get target
    const targetActorUuid = context.target?.actor;
    if (!targetActorUuid) return;

    let targetActor;
    try {
        targetActor = await fromUuid(targetActorUuid);
        if (targetActor?.actor) targetActor = targetActor.actor;
    } catch {
        return;
    }
    if (!targetActor) return;

    // Calculate differential
    const diff = getSizeDifferential(attackerActor.size, targetActor.size);
    if (diff === 0) return;

    await postSizeDifferentialMessage(attackerActor, targetActor, diff, outcome);
});
