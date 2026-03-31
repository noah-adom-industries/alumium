#!/usr/bin/env node
/**
 * Alumium Skill Sync — reconciles ~/.alumium/skills.json with ~/.claude/skills/
 *
 * Reads the config file, then:
 *   - Installs missing skills (git clone or copy from source)
 *   - Updates skills when version changes
 *   - Disables skills (renames SKILL.md → SKILL.md.disabled)
 *   - Enables skills (renames back)
 *   - Uninstalls skills removed from config (deletes directory)
 *
 * Usage:
 *   node sync.mjs                  # full sync
 *   node sync.mjs --status         # print status, no changes
 *   node sync.mjs --install <slug> # add a skill to config and install it
 *   node sync.mjs --remove <slug>  # remove from config and uninstall
 *   node sync.mjs --enable <slug>  # enable a disabled skill
 *   node sync.mjs --disable <slug> # disable without uninstalling
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const ALUMIUM_DIR = join(homedir(), '.alumium');
const CONFIG_PATH = join(ALUMIUM_DIR, 'skills.json');
const SKILLS_DIR = join(homedir(), '.claude', 'skills');
const CACHE_DIR = join(ALUMIUM_DIR, 'cache');

// ── Config ──────────────────────────────────────────────

function readConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return { version: 1, skills: {} };
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

function writeConfig(config) {
  mkdirSync(ALUMIUM_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// ── Git helpers ─────────────────────────────────────────

function cloneOrUpdate(source, cacheDir) {
  // source format: "github:owner/repo"
  const match = source.match(/^github:(.+)$/);
  if (!match) throw new Error(`Unsupported source format: ${source}`);
  const repoUrl = `https://github.com/${match[1]}.git`;

  if (existsSync(join(cacheDir, '.git'))) {
    execSync(`git -C "${cacheDir}" fetch --tags --quiet 2>/dev/null`, { stdio: 'pipe' });
    execSync(`git -C "${cacheDir}" pull --quiet 2>/dev/null`, { stdio: 'pipe' });
  } else {
    mkdirSync(dirname(cacheDir), { recursive: true });
    execSync(`git clone --quiet "${repoUrl}" "${cacheDir}"`, { stdio: 'pipe' });
  }
}

function checkoutVersion(cacheDir, version) {
  if (!version || version === 'latest') {
    execSync(`git -C "${cacheDir}" checkout --quiet main 2>/dev/null || git -C "${cacheDir}" checkout --quiet master 2>/dev/null`, { stdio: 'pipe' });
  } else {
    execSync(`git -C "${cacheDir}" checkout --quiet "${version}" 2>/dev/null`, { stdio: 'pipe' });
  }
}

// ── Skill file operations ───────────────────────────────

function skillDir(slug) {
  return join(SKILLS_DIR, slug);
}

function isInstalled(slug) {
  return existsSync(join(skillDir(slug), 'SKILL.md')) || existsSync(join(skillDir(slug), 'SKILL.md.disabled'));
}

function isEnabled(slug) {
  return existsSync(join(skillDir(slug), 'SKILL.md'));
}

function isDisabled(slug) {
  return existsSync(join(skillDir(slug), 'SKILL.md.disabled'));
}

function installFromCache(slug, cacheDir, skillPath) {
  const srcDir = skillPath ? join(cacheDir, skillPath) : cacheDir;
  const destDir = skillDir(slug);

  if (!existsSync(join(srcDir, 'SKILL.md'))) {
    throw new Error(`No SKILL.md found at ${srcDir}`);
  }

  // Clean and copy
  if (existsSync(destDir)) rmSync(destDir, { recursive: true });
  mkdirSync(destDir, { recursive: true });

  // Copy all files except .git, node_modules, README.md
  const entries = readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (['.git', 'node_modules', 'README.md'].includes(entry.name)) continue;
    const src = join(srcDir, entry.name);
    const dest = join(destDir, entry.name);
    cpSync(src, dest, { recursive: true });
  }
}

function uninstall(slug) {
  const dir = skillDir(slug);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
}

function enable(slug) {
  const dir = skillDir(slug);
  const disabled = join(dir, 'SKILL.md.disabled');
  const enabled = join(dir, 'SKILL.md');
  if (existsSync(disabled) && !existsSync(enabled)) {
    renameSync(disabled, enabled);
  }
}

function disable(slug) {
  const dir = skillDir(slug);
  const enabled = join(dir, 'SKILL.md');
  const disabled = join(dir, 'SKILL.md.disabled');
  if (existsSync(enabled)) {
    renameSync(enabled, disabled);
  }
}

// ── Sync ────────────────────────────────────────────────

function sync(config) {
  const results = { installed: [], updated: [], enabled: [], disabled: [], uninstalled: [], skipped: [], errors: [] };

  // Track which slugs are managed by alumium
  const managed = new Set(Object.keys(config.skills));

  for (const [slug, entry] of Object.entries(config.skills)) {
    try {
      const { source, path, version, enabled: isEn } = entry;

      if (!source) {
        results.skipped.push(`${slug}: no source defined`);
        continue;
      }

      // Extract repo name for cache dir
      const repoName = source.replace('github:', '').replace('/', '--');
      const cacheDir = join(CACHE_DIR, repoName);

      const needsInstall = !isInstalled(slug);
      const needsUpdate = !needsInstall && entry._lastSyncVersion !== version;

      if (needsInstall || needsUpdate) {
        cloneOrUpdate(source, cacheDir);
        checkoutVersion(cacheDir, version);
        installFromCache(slug, cacheDir, path);
        entry._lastSyncVersion = version;
        entry.updated_at = new Date().toISOString();
        if (needsInstall) {
          entry.installed_at = entry.installed_at || new Date().toISOString();
          results.installed.push(slug);
        } else {
          results.updated.push(slug);
        }
      }

      // Handle enable/disable
      if (isEn === false && isEnabled(slug)) {
        disable(slug);
        results.disabled.push(slug);
      } else if (isEn !== false && isDisabled(slug)) {
        enable(slug);
        results.enabled.push(slug);
      }
    } catch (e) {
      results.errors.push(`${slug}: ${e.message}`);
    }
  }

  // Find skills that were removed from config but still on disk
  // Only remove if they have a _lastSyncVersion (meaning alumium put them there)
  // We check the previous config's managed skills via a marker file
  const markerPath = join(ALUMIUM_DIR, '.managed-skills');
  const previouslyManaged = existsSync(markerPath)
    ? new Set(readFileSync(markerPath, 'utf-8').trim().split('\n').filter(Boolean))
    : new Set();

  for (const slug of previouslyManaged) {
    if (!managed.has(slug) && isInstalled(slug)) {
      uninstall(slug);
      results.uninstalled.push(slug);
    }
  }

  // Write current managed set
  mkdirSync(ALUMIUM_DIR, { recursive: true });
  writeFileSync(markerPath, [...managed].join('\n') + '\n', 'utf-8');

  return results;
}

// ── Status ──────────────────────────────────────────────

function printStatus(config) {
  console.log('Alumium Skills Status');
  console.log('─'.repeat(60));

  const slugs = Object.keys(config.skills);
  if (slugs.length === 0) {
    console.log('  No skills in config. Use --install <slug> to add one.');
    return;
  }

  for (const [slug, entry] of Object.entries(config.skills)) {
    const onDisk = isInstalled(slug);
    const en = isEnabled(slug);
    const dis = isDisabled(slug);
    let status;
    if (!onDisk) status = 'NOT INSTALLED';
    else if (en) status = 'installed';
    else if (dis) status = 'disabled';
    else status = 'unknown';

    const ver = entry.version || 'latest';
    const src = entry.source || 'no source';
    console.log(`  ${slug} [${status}] v${ver} — ${src}`);
  }
  console.log('');
}

// ── CLI ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const config = readConfig();

if (args[0] === '--status') {
  printStatus(config);
  process.exit(0);
}

if (args[0] === '--install' && args[1]) {
  // Minimal install: just adds to config, then syncs
  // For full install with store metadata, use the MCP tool or store API
  const slug = args[1];
  const source = args[2] || null;  // optional: github:owner/repo
  const path = args[3] || null;    // optional: path within repo
  const version = args[4] || 'latest';

  if (config.skills[slug]) {
    console.log(`  ${slug} already in config, running sync...`);
  } else {
    config.skills[slug] = {
      version,
      enabled: true,
      source: source,
      path: path || undefined,
      installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    console.log(`  Added ${slug} to config`);
  }

  writeConfig(config);
  const results = sync(config);
  writeConfig(config);  // save _lastSyncVersion
  printResults(results);
  process.exit(results.errors.length > 0 ? 1 : 0);
}

if (args[0] === '--remove' && args[1]) {
  const slug = args[1];
  if (!config.skills[slug]) {
    console.log(`  ${slug} not in config`);
    process.exit(0);
  }
  delete config.skills[slug];
  writeConfig(config);

  if (isInstalled(slug)) {
    uninstall(slug);
    console.log(`  Removed ${slug} from config and disk`);
  } else {
    console.log(`  Removed ${slug} from config`);
  }

  // Update managed marker
  const markerPath = join(ALUMIUM_DIR, '.managed-skills');
  const managed = Object.keys(config.skills);
  writeFileSync(markerPath, managed.join('\n') + '\n', 'utf-8');
  process.exit(0);
}

if (args[0] === '--enable' && args[1]) {
  const slug = args[1];
  if (config.skills[slug]) {
    config.skills[slug].enabled = true;
    writeConfig(config);
  }
  enable(slug);
  console.log(`  Enabled ${slug}`);
  process.exit(0);
}

if (args[0] === '--disable' && args[1]) {
  const slug = args[1];
  if (config.skills[slug]) {
    config.skills[slug].enabled = false;
    writeConfig(config);
  }
  disable(slug);
  console.log(`  Disabled ${slug}`);
  process.exit(0);
}

// Default: full sync
console.log('Alumium Skill Sync');
console.log('─'.repeat(40));
const results = sync(config);
writeConfig(config);
printResults(results);
process.exit(results.errors.length > 0 ? 1 : 0);

function printResults(results) {
  if (results.installed.length) console.log(`  Installed: ${results.installed.join(', ')}`);
  if (results.updated.length) console.log(`  Updated: ${results.updated.join(', ')}`);
  if (results.enabled.length) console.log(`  Enabled: ${results.enabled.join(', ')}`);
  if (results.disabled.length) console.log(`  Disabled: ${results.disabled.join(', ')}`);
  if (results.uninstalled.length) console.log(`  Uninstalled: ${results.uninstalled.join(', ')}`);
  if (results.skipped.length) console.log(`  Skipped: ${results.skipped.join(', ')}`);
  if (results.errors.length) {
    console.log(`  Errors:`);
    results.errors.forEach(e => console.log(`    ${e}`));
  }
  const total = results.installed.length + results.updated.length + results.enabled.length + results.disabled.length + results.uninstalled.length;
  if (total === 0 && results.errors.length === 0) {
    console.log('  Everything up to date.');
  }
}
