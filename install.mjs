#!/usr/bin/env node
/**
 * Alumium Installer
 *
 * - Installs the alumium skill to ~/.claude/skills/alumium/
 * - Registers MCP servers in ~/.claude/.mcp.json
 * - Sets up SQLite databases (skill-store and wiki)
 *
 * Usage:
 *   node install.mjs
 *   node install.mjs --force-db   # recreate databases
 */

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { homedir } from 'os';

const home = homedir();
const repoRoot = dirname(new URL(import.meta.url).pathname);
const forceDb = process.argv.includes('--force-db');

const SKILLS_DEST = resolve(home, '.claude/skills');
const GLOBAL_MCP_CONFIG = resolve(home, '.claude/.mcp.json');

console.log('Alumium Installer');
console.log('=================\n');
console.log(`  Repo:    ${repoRoot}`);
console.log(`  Home:    ${home}\n`);

// ── 1. Install npm dependencies ───────────────────────────

console.log('1. Installing npm dependencies...');
try {
  execSync('npm install', { cwd: resolve(repoRoot, 'skill-store'), stdio: 'inherit' });
  execSync('npm install', { cwd: resolve(repoRoot, 'wiki'), stdio: 'inherit' });
  console.log('   ✓ Dependencies installed\n');
} catch (e) {
  console.error('   ✗ npm install failed:', e.message);
  process.exit(1);
}

// ── 2. Set up databases ───────────────────────────────────

console.log('2. Setting up databases...');
try {
  const storeDbPath = resolve(repoRoot, 'skill-store/store.sqlite3');
  const wikiDbPath = resolve(repoRoot, 'wiki/wiki.sqlite3');

  if (!existsSync(storeDbPath) || forceDb) {
    const args = forceDb ? ['--force'] : [];
    execSync(`node setup-db.js ${args.join(' ')}`, { cwd: resolve(repoRoot, 'skill-store'), stdio: 'inherit' });
    console.log('   ✓ Skill store database ready');
  } else {
    console.log('   ✓ Skill store database already exists (use --force-db to recreate)');
  }

  if (!existsSync(wikiDbPath) || forceDb) {
    const args = forceDb ? ['--force'] : [];
    execSync(`node setup-db.js ${args.join(' ')}`, { cwd: resolve(repoRoot, 'wiki'), stdio: 'inherit' });
    console.log('   ✓ Wiki database ready');
  } else {
    console.log('   ✓ Wiki database already exists (use --force-db to recreate)');
  }
  console.log();
} catch (e) {
  console.error('   ✗ Database setup failed:', e.message);
  process.exit(1);
}

// ── 3. Install skill ──────────────────────────────────────

console.log('3. Installing skill...');
const skillSrc = resolve(repoRoot, 'skills/alumium');
const skillDest = resolve(SKILLS_DEST, 'alumium');

mkdirSync(skillDest, { recursive: true });
cpSync(skillSrc, skillDest, { recursive: true, force: true });
console.log(`   ✓ Skill installed to ${skillDest}\n`);

// ── 4. Register MCP servers ───────────────────────────────

console.log('4. Registering MCP servers...');

const storeMcpPath = resolve(repoRoot, 'skill-store/mcp/server.js');
const wikiMcpPath = resolve(repoRoot, 'wiki/mcp/server.js');

const newServers = {
  'alumium-store': {
    command: 'node',
    args: [storeMcpPath],
    env: { STORE_API: 'http://127.0.0.1:8790' },
  },
  'alumium-wiki': {
    command: 'node',
    args: [wikiMcpPath],
    env: { WIKI_API: 'http://127.0.0.1:8791' },
  },
};

let mcpConfig = { mcpServers: {} };
if (existsSync(GLOBAL_MCP_CONFIG)) {
  try { mcpConfig = JSON.parse(readFileSync(GLOBAL_MCP_CONFIG, 'utf-8')); }
  catch { mcpConfig = { mcpServers: {} }; }
}
if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

for (const [name, cfg] of Object.entries(newServers)) {
  mcpConfig.mcpServers[name] = cfg;
  console.log(`   ✓ Registered ${name}`);
}

writeFileSync(GLOBAL_MCP_CONFIG, JSON.stringify(mcpConfig, null, 2), 'utf-8');
console.log(`   ✓ Written to ${GLOBAL_MCP_CONFIG}\n`);

// ── Done ──────────────────────────────────────────────────

console.log('Alumium installed successfully!\n');
console.log('Next steps:');
console.log('  1. Start the skill store:  node skill-store/server.js');
console.log('  2. Start the wiki:         node wiki/server.js');
console.log('  3. Reload Claude Code to pick up the MCP servers and /alumium skill');
console.log();
console.log('  Skill Store: http://127.0.0.1:8790');
console.log('  Wiki:        http://127.0.0.1:8791');
console.log();
console.log('  MCP tools available after reload:');
console.log('    store_search, store_get, store_install, store_publish, store_rate,');
console.log('    store_list_bundles, store_get_bundle, store_install_bundle, store_create_bundle');
console.log('    wiki_search, wiki_get_page, wiki_publish, wiki_list_pages, wiki_upload_asset');
