/**
 * Guards lib-wrapper package_id === module.json id (lib-wrapper rejects suffixed ids).
 */
import { readFileSync } from 'node:fs';
import { MODULE_ID } from '../scripts/size-common.mjs';

const manifest = JSON.parse(readFileSync(new URL('../module.json', import.meta.url), 'utf8'));

if (typeof MODULE_ID !== 'string' || MODULE_ID.length === 0) {
    console.error('MODULE_ID must be a non-empty string');
    process.exit(1);
}

if (manifest.id !== MODULE_ID) {
    console.error(`module.json id "${manifest.id}" !== MODULE_ID "${MODULE_ID}"`);
    process.exit(1);
}

if (MODULE_ID !== 'pf2e-creature-size-matters') {
    console.error(`Unexpected MODULE_ID: ${MODULE_ID}`);
    process.exit(1);
}

console.log('module-id.test.mjs: ok');
