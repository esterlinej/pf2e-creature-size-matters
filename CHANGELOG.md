# Changelog

All notable changes to PF2e Creature Size Matters are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.3.2]

### Changed
- Verified compatibility with Foundry VTT 14.367.

## [1.3.1]

*Not documented in the README's own changelog at the time — version and
`compatibility.verified` (14.365) both moved between this and 1.3.0, so
this is reconstructed as a compatibility-verification bump, same shape
as 1.3.2 above, rather than confirmed against an actual record of what
changed. Worth correcting this entry if the real reason was something
else.*

### Changed
- Verified compatibility with Foundry VTT 14.365 (inferred).

## [1.3.0]

### Changed
- Apply Damage now uses PF2e's native `applyDamage()` pipeline, which
  produces a chat card with an undo button when damage is applied,
  instead of the module's own damage-application path.

## [1.2.2]

### Changed
- Confirmed V14 support.

## [1.2.1]

### Fixed
- `module.json` version and download link.

## [1.2.0]

### Added
- **Treat Small Player Characters as Medium** setting — a softer option
  so players aren't penalized (or favored) for choosing a Small
  ancestry in size-differential calculations. Applied symmetrically (a
  Small PC neither takes nor deals size-based bonus damage against a
  Medium+ actor) and only to player characters — Small NPCs/monsters
  are unaffected. Defaults to enabled. The GM card reflects the
  normalization when it applies (e.g. `Small → Medium`).

## [1.1.0]

### Added
- **Save Roll Mode** setting — Post to Chat, GM Rolls, or Both.
- **Post to Chat** mode posts a public inline Reflex save check that
  players roll themselves, with their own character's bonuses, feats,
  and items properly applied — recommended default over the GM rolling
  it server-side.

### Fixed
- Per-category tier damage overrides now correctly multiply by the
  actual size differential (previously did not scale correctly for
  2+ category differences).

## [1.0.0]

Initial release.

### Added
- Size category differential calculation (Tiny through Gargantuan) on
  melee hits between differently-sized creatures.
- GM-only chat card on a qualifying hit: attacker/target size
  categories, size difference, bonus damage to apply (auto-doubled on
  a critical hit, configurable), Reflex DC and failure condition.
- Configurable base damage-per-category and DC-per-category, with
  optional per-tier overrides at 1 / 2 / 3+ category differences.
- Configurable failure condition (Off-Guard, Clumsy 1, Prone, or None)
  for 1-category and 2+-category differentials separately.
- Draggable condition link in the GM card — drop directly onto the
  target token to apply after a failed save.
- Bonus damage applied via PF2e's native damage pipeline with IWR
  bypassed (`skipIWR: true`) — lands as flat HP reduction, unaffected
  by resistances/immunities.
- Ranged attacks, spells, and abilities are intentionally unaffected —
  size differential only applies to melee.
