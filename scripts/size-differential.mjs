/**
 * PF2e Size Differential Impact
 * Prompts GM when a larger creature hits a smaller one
 * with bonus damage and a Reflex save requirement
 */

const MODULE_ID = 'pf2e-creature-size-matters';

const SIZE_MAP = {
    tiny: 0,
    sm:   1,
    med:  2,
    lg:   3,
    huge: 4,
    grg:  5
};

const SIZE_LABELS = {
    tiny: 'Tiny',
    sm:   'Small',
    med:  'Medium',
    lg:   'Large',
    huge: 'Huge',
    grg:  'Gargantuan'
};

/**
 * Calculate size differential between attacker and target
 * Returns 0 if no differential or target is larger
 */
function getSizeDifferential(attackerSize, targetSize) {
    const atk = SIZE_MAP[attackerSize] ?? 2;
    const tgt = SIZE_MAP[targetSize] ?? 2;
    return Math.max(0, atk - tgt);
}

/**
 * Post the size differential prompt to chat
 */
async function postSizeDifferentialMessage(attacker, target, diff) {
    const bonusDamage = diff * 5;
    const reflexDC    = 10 + (diff * 5);
    const condition   = diff >= 2 ? 'Prone' : 'Flat-Footed';
    const atkSize     = SIZE_LABELS[attacker.size] ?? attacker.size;
    const tgtSize     = SIZE_LABELS[target.size]   ?? target.size;

    const content = `
    <div class="pf2e chat-card action-card">
      <header class="card-header flexrow">
        <img src="icons/svg/sword.svg" width="36" height="36"/>
        <h3>⚔️ Size Differential Impact</h3>
      </header>
      <div class="card-content">
        <p>
          <strong>${attacker.name}</strong> 
          <em>(${atkSize})</em> strikes 
          <strong>${target.name}</strong> 
          <em>(${tgtSize})</em>
        </p>
        <p>Size difference: <strong>${diff} categor${diff === 1 ? 'y' : 'ies'}</strong></p>
        <hr/>
        <p>📌 Apply additional <strong>${bonusDamage} damage</strong></p>
        <p>
          📌 
          <strong>${target.name}</strong> must succeed at a 
          <strong>Reflex DC ${reflexDC}</strong> 
          or become <strong>${condition}</strong>
        </p>
      </div>
    </div>
  `;

    await ChatMessage.create({
        content,
        speaker: { alias: 'Size Rules' },
        whisper: ChatMessage.getWhisperRecipients('GM')  // GM only
    });
}

/**
 * Hook into PF2e chat messages to detect strikes
 * and compare attacker/target sizes
 */
Hooks.on('createChatMessage', async (message) => {
    if (!game.user.isGM) return;

    const flags = message.flags?.pf2e;
    if (!flags) return;
    console.log('PF2e context:', JSON.stringify(flags.context, null, 2));

    const context = flags.context;
    if (!context) return;

    // Melee attacks only
    if (!context.domains?.includes('melee-attack-roll')) return;

    // Hits only — no misses
    const outcome = context.outcome;
    if (!outcome || outcome === 'failure' || outcome === 'criticalFailure') return;

    // Get attacker
    const attackerActor = message.actor;
    if (!attackerActor) return;

    // Get target — use actor UUID directly, more reliable
    const targetActorUuid = context.target?.actor;
    if (!targetActorUuid) return;

    let targetActor;
    try {
        targetActor = await fromUuid(targetActorUuid);
    } catch {
        return;
    }
    if (!targetActor) return;

    // Calculate differential
    const diff = getSizeDifferential(attackerActor.size, targetActor.size);
    if (diff === 0) return;

    await postSizeDifferentialMessage(attackerActor, targetActor, diff);
});

// Register module settings
Hooks.once('init', () => {
    game.settings.register(MODULE_ID, 'bonusPerSize', {
        name: 'Bonus Damage Per Size Category',
        hint: 'Flat damage bonus applied per size category difference',
        scope: 'world',
        config: true,
        type: Number,
        default: 5
    });

    game.settings.register(MODULE_ID, 'dcPerSize', {
        name: 'Reflex DC Base Per Size Category',
        hint: 'Added to DC 10 per size category difference',
        scope: 'world',
        config: true,
        type: Number,
        default: 5
    });

    console.log(`${MODULE_ID} | Initialized`);
});
