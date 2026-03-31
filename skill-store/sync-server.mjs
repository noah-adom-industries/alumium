#!/usr/bin/env node
/**
 * Alumium Sync Server — local HTTP API for the store web UI to trigger installs/uninstalls.
 *
 * Runs on the user's container at port 8792. The store web UI (port 8790) calls this API
 * to modify ~/.alumium/skills.json and sync the filesystem.
 *
 * Endpoints:
 *   GET  /api/skills          — list installed skills from config
 *   POST /api/skills/install  — { slug, source, path?, version? } → install
 *   POST /api/skills/remove   — { slug } → uninstall
 *   POST /api/skills/enable   — { slug } → enable
 *   POST /api/skills/disable  — { slug } → disable
 *   POST /api/skills/sync     — full sync (no body needed)
 *   GET  /health              — health check
 */

import { createServer } from 'http';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, readdirSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const PORT = parseInt(process.env.SYNC_PORT || '8792', 10);
const ALUMIUM_DIR = join(homedir(), '.alumium');
const CONFIG_PATH = join(ALUMIUM_DIR, 'skills.json');
const SKILLS_DIR = join(homedir(), '.claude', 'skills');
const CACHE_DIR = join(ALUMIUM_DIR, 'cache');

// ── Config ──────────────────────────────────────────────

function readConfig() {
  if (!existsSync(CONFIG_PATH)) return { version: 1, skills: {} };
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

function writeConfig(config) {
  mkdirSync(ALUMIUM_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// ── Git helpers ─────────────────────────────────────────

function cloneOrUpdate(source, cacheDir) {
  const match = source.match(/^github:(.+)$/);
  if (!match) throw new Error(`Unsupported source: ${source}`);
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

function skillDir(slug) { return join(SKILLS_DIR, slug); }
function isInstalled(slug) { return existsSync(join(skillDir(slug), 'SKILL.md')) || existsSync(join(skillDir(slug), 'SKILL.md.disabled')); }
function isEnabled(slug) { return existsSync(join(skillDir(slug), 'SKILL.md')); }
function isDisabled(slug) { return existsSync(join(skillDir(slug), 'SKILL.md.disabled')); }

function installFromCache(slug, cacheDir, skillPath) {
  const srcDir = skillPath ? join(cacheDir, skillPath) : cacheDir;
  const destDir = skillDir(slug);
  if (!existsSync(join(srcDir, 'SKILL.md'))) throw new Error(`No SKILL.md found at ${srcDir}`);
  if (existsSync(destDir)) rmSync(destDir, { recursive: true });
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'README.md'].includes(entry.name)) continue;
    cpSync(join(srcDir, entry.name), join(destDir, entry.name), { recursive: true });
  }
}

// ── HTTP helpers ────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
  });
}

function json(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

// ── Server ──────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    // Health
    if (method === 'GET' && path === '/health') {
      return json(res, { ok: true, service: 'alumium-sync', port: PORT });
    }

    // List installed skills
    if (method === 'GET' && path === '/api/skills') {
      const config = readConfig();
      const skills = Object.entries(config.skills).map(([slug, entry]) => ({
        slug,
        ...entry,
        on_disk: isInstalled(slug),
        enabled: isEnabled(slug),
        disabled: isDisabled(slug),
      }));
      return json(res, { skills });
    }

    // Install
    if (method === 'POST' && path === '/api/skills/install') {
      const body = await parseBody(req);
      if (!body.slug || !body.source) return json(res, { error: 'slug and source required' }, 400);

      const config = readConfig();
      const { slug, source, path: skillPath, version } = body;
      const repoName = source.replace('github:', '').replace('/', '--');
      const cacheDir = join(CACHE_DIR, repoName);

      cloneOrUpdate(source, cacheDir);
      checkoutVersion(cacheDir, version || 'latest');
      installFromCache(slug, cacheDir, skillPath);

      config.skills[slug] = {
        version: version || 'latest',
        enabled: true,
        source,
        path: skillPath || undefined,
        installed_at: config.skills[slug]?.installed_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _lastSyncVersion: version || 'latest',
      };
      writeConfig(config);

      // Update managed marker
      writeFileSync(join(ALUMIUM_DIR, '.managed-skills'), Object.keys(config.skills).join('\n') + '\n', 'utf-8');

      return json(res, { ok: true, action: 'installed', slug });
    }

    // Remove
    if (method === 'POST' && path === '/api/skills/remove') {
      const body = await parseBody(req);
      if (!body.slug) return json(res, { error: 'slug required' }, 400);

      const config = readConfig();
      const { slug } = body;
      delete config.skills[slug];
      writeConfig(config);

      const dir = skillDir(slug);
      if (existsSync(dir)) rmSync(dir, { recursive: true });

      writeFileSync(join(ALUMIUM_DIR, '.managed-skills'), Object.keys(config.skills).join('\n') + '\n', 'utf-8');

      return json(res, { ok: true, action: 'removed', slug });
    }

    // Enable
    if (method === 'POST' && path === '/api/skills/enable') {
      const body = await parseBody(req);
      if (!body.slug) return json(res, { error: 'slug required' }, 400);

      const config = readConfig();
      if (config.skills[body.slug]) config.skills[body.slug].enabled = true;
      writeConfig(config);

      const dir = skillDir(body.slug);
      const disabled = join(dir, 'SKILL.md.disabled');
      const enabled = join(dir, 'SKILL.md');
      if (existsSync(disabled) && !existsSync(enabled)) renameSync(disabled, enabled);

      return json(res, { ok: true, action: 'enabled', slug: body.slug });
    }

    // Disable
    if (method === 'POST' && path === '/api/skills/disable') {
      const body = await parseBody(req);
      if (!body.slug) return json(res, { error: 'slug required' }, 400);

      const config = readConfig();
      if (config.skills[body.slug]) config.skills[body.slug].enabled = false;
      writeConfig(config);

      const dir = skillDir(body.slug);
      const enabled = join(dir, 'SKILL.md');
      const disabled = join(dir, 'SKILL.md.disabled');
      if (existsSync(enabled)) renameSync(enabled, disabled);

      return json(res, { ok: true, action: 'disabled', slug: body.slug });
    }

    // Full sync
    if (method === 'POST' && path === '/api/skills/sync') {
      const config = readConfig();
      const results = { installed: [], updated: [], enabled: [], disabled: [], errors: [] };

      for (const [slug, entry] of Object.entries(config.skills)) {
        try {
          if (!entry.source) continue;
          const repoName = entry.source.replace('github:', '').replace('/', '--');
          const cacheDir = join(CACHE_DIR, repoName);
          const needsInstall = !isInstalled(slug);
          const needsUpdate = !needsInstall && entry._lastSyncVersion !== entry.version;

          if (needsInstall || needsUpdate) {
            cloneOrUpdate(entry.source, cacheDir);
            checkoutVersion(cacheDir, entry.version || 'latest');
            installFromCache(slug, cacheDir, entry.path);
            entry._lastSyncVersion = entry.version;
            entry.updated_at = new Date().toISOString();
            if (needsInstall) { entry.installed_at = entry.installed_at || entry.updated_at; results.installed.push(slug); }
            else results.updated.push(slug);
          }

          if (entry.enabled === false && isEnabled(slug)) {
            renameSync(join(skillDir(slug), 'SKILL.md'), join(skillDir(slug), 'SKILL.md.disabled'));
            results.disabled.push(slug);
          } else if (entry.enabled !== false && isDisabled(slug)) {
            renameSync(join(skillDir(slug), 'SKILL.md.disabled'), join(skillDir(slug), 'SKILL.md'));
            results.enabled.push(slug);
          }
        } catch (e) { results.errors.push(`${slug}: ${e.message}`); }
      }

      writeConfig(config);
      writeFileSync(join(ALUMIUM_DIR, '.managed-skills'), Object.keys(config.skills).join('\n') + '\n', 'utf-8');

      return json(res, { ok: true, results });
    }

    json(res, { error: 'Not found' }, 404);
  } catch (e) {
    json(res, { error: e.message }, 500);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[sync] Alumium Sync Server on http://127.0.0.1:${PORT}`);
});
