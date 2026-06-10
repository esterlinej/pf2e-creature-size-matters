# PF2e Creature Size Matters

A Foundry VTT module for **Pathfinder 2e** that adds meaningful mechanical weight 
to size differentials in melee combat.

## The Problem

PF2e normalizes damage across creature sizes — a Huge giant hitting a Medium 
adventurer deals damage appropriate to the level differential, not the *size* 
differential. The terror of fighting something three times your size has no 
mechanical expression. This module fixes that.

## What It Does

When a larger creature successfully hits a smaller one in **melee combat**, the 
module posts a GM-only card to chat that:

- Calculates the size category difference between attacker and target
- Prompts the GM to apply **bonus damage** scaled to the size differential
- Requires the target to make a **Reflex save** or suffer a condition
- Provides **draggable condition links** to apply directly to the token on a failed save
- Automatically **doubles bonus damage** on a critical hit (configurable)

## Size Categories

| Size | Category |
|------|----------|
| Tiny | 0 |
| Small | 1 |
| Medium | 2 |
| Large | 3 |
| Huge | 4 |
| Gargantuan | 5 |

A Large creature (3) striking a Small creature (1) has a **2 category differential**.

---

## Configuration

All settings are found under **Game Settings → Module Settings → PF2e Creature 
Size Matters**.

---

### Damage Settings

#### Base Damage Per Size Category
**Default: 5**

The flat bonus damage applied per size category difference when no tier override 
is set.

- 1 category difference → +5 damage
- 2 category difference → +10 damage  
- 3 category difference → +15 damage

#### Override: 1 Category Damage
**Default: 0 (disabled)**

Set a specific bonus damage value for exactly 1 size category difference, 
overriding the base calculation. Leave at **0** to use the base value.

#### Override: 2 Category Damage
**Default: 0 (disabled)**

Set a specific bonus damage value for exactly 2 size category difference. 
Leave at **0** to use the base value.

#### Override: 3+ Category Damage
**Default: 0 (disabled)**

Set a specific bonus damage value for 3 or more size category differences. 
Leave at **0** to use the base value.

**Example:** Base damage is 5 per category. You want 1 category = +5, 
2 categories = +15, 3+ categories = +30:
- Base Damage Per Category: `5`
- Override Tier 1: `0` (uses base: 5 × 1 = 5)
- Override Tier 2: `15`
- Override Tier 3: `30`

#### Double Bonus Damage on Critical Hit
**Default: Enabled**

When **enabled** — bonus damage is automatically doubled on a critical hit. 
A single apply button appears showing the doubled value.

When **disabled** — on a critical hit, two buttons appear in the card:
- **Apply X Damage (Normal)** — applies the standard bonus
- **Apply X Damage (Critical ×2)** — applies the doubled bonus

The GM chooses which to apply.

---

### Save Settings

#### Base Reflex DC
**Default: 10**

The base DC for the Reflex save before the per-category modifier is applied.

#### DC Modifier Per Size Category
**Default: 5**

Added to the Base DC per size category difference.

Formula: `Base DC + (DC Modifier × size difference)`

- Default with 1 category: DC 10 + 5 = **DC 15**
- Default with 2 categories: DC 10 + 10 = **DC 20**
- Default with 3 categories: DC 10 + 15 = **DC 25**

#### Condition: 1 Category Difference
**Default: Off-Guard**

The condition applied to the target on a failed Reflex save when the attacker 
is 1 size category larger.

| Option | Effect |
|--------|--------|
| Off-Guard | Target loses their Dexterity bonus to AC |
| Clumsy 1 | Target takes -1 to Dexterity-based checks and DCs |
| None | No condition — damage prompt only |

#### Condition: 2+ Category Difference
**Default: Prone**

The condition applied to the target on a failed Reflex save when the attacker 
is 2 or more size categories larger.

| Option | Effect |
|--------|--------|
| Prone | Target is knocked down, -2 AC vs melee, -4 AC vs ranged |
| Off-Guard | Target loses their Dexterity bonus to AC |
| None | No condition — damage prompt only |

The condition appears as a **draggable link** in the chat card — drag it directly 
onto the target token to apply after a failed save.

---

### Automation Settings

#### Auto Apply Bonus Damage
**Default: Button in Card**

Controls how bonus damage is applied.

| Option | Behavior |
|--------|----------|
| Manual | Card displays the damage value — GM applies it manually |
| Button in Card | A button appears in the card — click to apply damage to the target |
| Auto Apply | Damage is applied to the target automatically on hit |

#### Auto Roll Reflex Save
**Default: Disabled**

When **enabled** — the target's Reflex save is automatically rolled against the 
calculated DC the moment a qualifying hit occurs. No button appears in the card.

When **disabled** — a **🎲 Roll Reflex Save DC X** button appears in the card. 
Click to trigger the PF2e save roller for the target.

---

### Display Settings

#### Whisper to GM Only
**Default: Enabled**

When **enabled** — the size differential card is only visible to the GM.

When **disabled** — the card is visible to all players at the table.

---

## The Chat Card

When a qualifying hit occurs, a card appears showing:

- **Attacker and target** with their size categories
- **Size difference** in categories
- **Bonus damage** to apply (doubled automatically on crits if enabled)
- **Reflex DC** and the condition on a failed save
- A draggable **condition link** — drag onto the token after a failed save
- An **Apply Damage** button (if set to Button mode)
- A **Roll Save** button (if auto-roll is disabled)

---

## Compatibility

| | Version |
|--|---------|
| Foundry VTT | 13+ |
| PF2e System | 6.0.0+ |
| Verified | Foundry 14, PF2e 7.12 |

---

## Design Notes

This module is intentionally **GM-facing** by default. The intent is to add 
narrative and tactical weight to size differentials without overwhelming players 
with additional mechanics they need to track. The GM sees the prompt, applies 
the damage, calls for the save, and narrates the result.

Size differential only applies to **melee attacks**. Ranged attacks, spells, 
and abilities are not affected.

Bonus damage bypasses IWR (Immunity, Weakness, Resistance) when applied via 
the button — it is treated as a direct HP reduction. GMs should account for 
relevant resistances or immunities manually if needed.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

## Author

**Jester** — [github.com/esterlinej](https://github.com/esterlinej)
