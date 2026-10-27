#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORY_META } from './catalog-builder.js';

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const catalogMdFile = join(PACKAGE_DIR, 'CATALOG.md');

console.log('=== Diffusion Mode · Architecture & Capability Inspection ===\n');

console.log('--- Standard Core Capability Groups ---');
for (const [catId, meta] of Object.entries(CATEGORY_META)) {
  console.log(`- [${catId}] ${meta.title}`);
  console.log(`  Summary: ${meta.summary}`);
  console.log(`  Core Tools: ${[...meta.tools].join(', ')}`);
}

console.log('\n--- Dynamic Extensions ---');
console.log('- [skills] Domain Skills Repository (Loaded on demand from registered skills)');
console.log('- [mcp:*] External MCP Servers (Dynamically detected and categorized)');
console.log('- [plugin:*] Feature Plugins (Dynamically detected by extension prefix)');

console.log('\n--- Verification Scope ---');
console.log('Static architecture inspection only. No live DSH preset verification was performed.');
console.log('Run npm test for local regression checks; validate Native/PTC mounting in a running DSH host.');

if (existsSync(catalogMdFile)) {
  console.log(`\nFull documentation: ${catalogMdFile}`);
}
