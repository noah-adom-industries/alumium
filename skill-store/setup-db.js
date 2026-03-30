#!/usr/bin/env node
/**
 * Alumium Skill Store — Database Setup
 * Creates the SQLite schema and seeds example data.
 *
 * Usage:
 *   node setup-db.js           # create if not present
 *   node setup-db.js --force   # drop and recreate
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.STORE_DB_PATH || join(__dirname, 'store.sqlite3');
const force = process.argv.includes('--force');

mkdirSync(dirname(DB_PATH), { recursive: true });

if (force && existsSync(DB_PATH)) {
  unlinkSync(DB_PATH);
  console.log('[setup] Dropped existing database.');
}

if (existsSync(DB_PATH) && !force) {
  console.log(`[setup] Database already exists at ${DB_PATH}. Use --force to recreate.`);
  process.exit(0);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Schema ────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    brief TEXT,
    skill_source TEXT,
    type TEXT NOT NULL DEFAULT 'skill' CHECK(type IN ('skill', 'widget', 'bundle-item')),
    author_name TEXT,
    author_id TEXT,
    adom_recommended INTEGER NOT NULL DEFAULT 0,
    adom_official INTEGER NOT NULL DEFAULT 0,
    install_count INTEGER NOT NULL DEFAULT 0,
    pub_status TEXT NOT NULL DEFAULT 'submitted' CHECK(pub_status IN ('submitted', 'validated', 'rejected')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug);
  CREATE INDEX IF NOT EXISTS idx_skills_type ON skills(type);
  CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(pub_status);
  CREATE INDEX IF NOT EXISTS idx_skills_official ON skills(adom_official);
  CREATE INDEX IF NOT EXISTS idx_skills_recommended ON skills(adom_recommended);

  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id INTEGER NOT NULL REFERENCES skills(id),
    user_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    review TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(skill_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_ratings_skill ON ratings(skill_id);

  CREATE TABLE IF NOT EXISTS bundles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    adom_official INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_bundles_slug ON bundles(slug);

  CREATE TABLE IF NOT EXISTS bundle_skills (
    bundle_id INTEGER NOT NULL REFERENCES bundles(id),
    skill_id INTEGER NOT NULL REFERENCES skills(id),
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (bundle_id, skill_id)
  );
`);

console.log('[setup] Schema created.');

// ── Seed data ─────────────────────────────────────────────

const skills = [
  {
    slug: 'alumium-wiki',
    name: 'Alumium Wiki',
    description: 'Publish and manage public-facing project documentation using the Alumium Wiki service. Generates clean, human-readable project pages tied to the skill store.',
    brief: 'Publish and manage project wiki pages from Claude Code.',
    type: 'skill',
    adom_official: 1,
    adom_recommended: 1,
    pub_status: 'validated',
  },
  {
    slug: 'alumium-store',
    name: 'Alumium Skill Store',
    description: 'Discover, install, rate, and publish skills in the Alumium Skill Store. Manage skill bundles and build your own workflow library.',
    brief: 'Find, install, and share Claude Code skills.',
    type: 'skill',
    adom_official: 1,
    adom_recommended: 1,
    pub_status: 'validated',
  },
];

const insertSkill = db.prepare(`
  INSERT OR IGNORE INTO skills (slug, name, description, brief, type, adom_official, adom_recommended, pub_status)
  VALUES (@slug, @name, @description, @brief, @type, @adom_official, @adom_recommended, @pub_status)
`);

for (const s of skills) {
  insertSkill.run(s);
}

console.log(`[setup] Seeded ${skills.length} skill(s).`);

// Seed example bundle
const bundleResult = db.prepare(`
  INSERT OR IGNORE INTO bundles (slug, name, description, adom_official)
  VALUES ('alumium-core', 'Alumium Core', 'Essential skills for every Alumium project — wiki and skill store management.', 1)
`).run();

if (bundleResult.changes > 0) {
  const bundleId = db.prepare('SELECT id FROM bundles WHERE slug = ?').get('alumium-core').id;
  for (const s of skills) {
    const skill = db.prepare('SELECT id FROM skills WHERE slug = ?').get(s.slug);
    if (skill) {
      db.prepare('INSERT OR IGNORE INTO bundle_skills (bundle_id, skill_id) VALUES (?, ?)').run(bundleId, skill.id);
    }
  }
  console.log('[setup] Seeded Alumium Core bundle.');
}

console.log(`[setup] Done. Database: ${DB_PATH}`);
