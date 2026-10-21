#!/usr/bin/env node
// Keeps .claude-plugin/plugin.json's version equal to package.json's.
// Runs from the npm `version` lifecycle (npm version <x>), so a release bumps both.
// With --check it only verifies (used in CI) and exits non-zero on a mismatch.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pluginPath = path.join(root, '.claude-plugin', 'plugin.json');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));

if (plugin.version === version) {
  process.exit(0);
}
if (process.argv.includes('--check')) {
  console.error(`plugin.json version ${plugin.version} != package.json version ${version}. Run: node scripts/sync-plugin-version.js`);
  process.exit(1);
}
plugin.version = version;
fs.writeFileSync(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`);
console.log(`plugin.json version → ${version}`);
