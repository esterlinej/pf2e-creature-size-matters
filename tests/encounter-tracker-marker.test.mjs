/**
 * Combat tracker badge label (CSM: N).
 */
import assert from 'node:assert/strict';
import { formatEncounterTrackerMarker } from '../scripts/size-common.mjs';

assert.equal(formatEncounterTrackerMarker(13), 'CSM: 13');
assert.equal(formatEncounterTrackerMarker(12), 'CSM: 12');

console.log('encounter-tracker-marker.test.mjs: ok');
