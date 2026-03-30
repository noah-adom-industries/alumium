#!/usr/bin/env node
/**
 * Alumium Wiki — Database Setup
 *
 * Usage:
 *   node setup-db.js            # create if not present
 *   node setup-db.js --force    # drop and recreate
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.WIKI_DB_PATH || join(__dirname, 'wiki.sqlite3');
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

db.exec(`
  CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'project' CHECK(type IN ('project', 'skill')),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    brief TEXT,
    content TEXT,
    author_name TEXT,
    author_id TEXT,
    linked_skills TEXT,
    pub_status TEXT NOT NULL DEFAULT 'submitted' CHECK(pub_status IN ('submitted', 'validated', 'rejected')),
    pub_version TEXT NOT NULL DEFAULT '1.0.0',
    pub_reject_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
  CREATE INDEX IF NOT EXISTS idx_pages_type ON pages(type);
  CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(pub_status);

  CREATE TABLE IF NOT EXISTS asset_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL REFERENCES pages(id),
    filename TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    caption TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_assets_page ON asset_uploads(page_id);
`);

console.log('[setup] Schema created.');
console.log(`[setup] Done. Database: ${DB_PATH}`);
