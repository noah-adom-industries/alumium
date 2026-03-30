/**
 * Alumium Wiki
 *
 * Public-facing project documentation. Each project gets a wiki page —
 * human-readable, AI-generated, tied to the skill store.
 *
 * Port: 8791 (configurable via WIKI_PORT)
 * DB:   ./wiki.sqlite3 (configurable via WIKI_DB_PATH)
 */

import { createServer } from 'http';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.WIKI_PORT || '8791', 10);
const DB_PATH = process.env.WIKI_DB_PATH || join(__dirname, 'wiki.sqlite3');
const AUTH_TOKEN = process.env.WIKI_AUTH_TOKEN || 'alumium-wiki-dev-2025';
const ASSETS_DIR = join(__dirname, 'assets');
const STORE_URL = process.env.STORE_API
  || 'https://noah-service-alumium-skill-store-fwwrark8f72y.adom.cloud/proxy/8790';

// ── Database ──────────────────────────────────────────────

let db;
function openDatabase() {
  if (!existsSync(DB_PATH)) {
    console.error(`[wiki] Database not found at ${DB_PATH}`);
    console.error(`[wiki] Run: node setup-db.js`);
    process.exit(1);
  }
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('cache_size = -16000');
  mkdirSync(ASSETS_DIR, { recursive: true });
  console.log(`[wiki] Database loaded: ${DB_PATH}`);
}
openDatabase();

// ── Theme ─────────────────────────────────────────────────

const T = {
  bg: '#0d1117',
  surface: '#161b22',
  surface2: '#21262d',
  border: '#30363d',
  primary: '#7c3aed',
  text: '#e6edf3',
  muted: '#8b949e',
  success: '#3fb950',
  warning: '#d29922',
  error: '#f85149',
};

// ── HTML Helpers ──────────────────────────────────────────

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mdToHtml(md) {
  // Minimal markdown → HTML (headings, bold, code, paragraphs)
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>(\n|$))+/g, match => `<ul>${match}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])(.+)$/gm, (match) => match.startsWith('<') ? match : match)
    .trim();
}

function shell(title, body, { searchQuery = '' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Alumium Wiki</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${T.bg}; color: ${T.text}; font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.7; }
  a { color: ${T.primary}; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .nav { background: ${T.surface}; border-bottom: 1px solid ${T.border}; padding: 0 24px; display: flex; align-items: center; gap: 24px; height: 56px; }
  .nav-brand { font-weight: 700; font-size: 18px; color: ${T.text}; display: flex; align-items: center; gap: 8px; }
  .nav-brand span { color: ${T.primary}; }
  .nav-links { display: flex; gap: 20px; margin-left: 8px; }
  .nav-links a { color: ${T.muted}; font-size: 14px; }
  .nav-links a:hover { color: ${T.text}; }
  .nav-right { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .nav-right form { display: flex; gap: 8px; }
  .nav-right input { background: ${T.surface2}; border: 1px solid ${T.border}; border-radius: 6px; padding: 6px 12px; color: ${T.text}; font-size: 14px; width: 220px; outline: none; }
  .nav-right input:focus { border-color: ${T.primary}; }
  .nav-right button { background: ${T.primary}; border: none; border-radius: 6px; padding: 6px 14px; color: #fff; font-size: 14px; cursor: pointer; }
  .container { max-width: 900px; margin: 0 auto; padding: 40px 24px; }
  .wide { max-width: 1200px; }
  h1, h2, h3 { font-weight: 700; line-height: 1.3; }
  h1 { font-size: 36px; margin-bottom: 12px; }
  h2 { font-size: 24px; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid ${T.border}; }
  h3 { font-size: 18px; margin: 20px 0 8px; }
  p { margin-bottom: 16px; color: ${T.text}; }
  ul, ol { padding-left: 24px; margin-bottom: 16px; }
  li { margin-bottom: 4px; }
  code { background: ${T.surface2}; border: 1px solid ${T.border}; border-radius: 4px; padding: 1px 6px; font-family: monospace; font-size: 0.9em; }
  pre { background: ${T.surface2}; border: 1px solid ${T.border}; border-radius: 8px; padding: 16px; overflow-x: auto; margin-bottom: 16px; }
  pre code { background: none; border: none; padding: 0; }
  .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .badge-validated { background: ${T.success}22; color: ${T.success}; border: 1px solid ${T.success}44; }
  .badge-submitted { background: ${T.warning}22; color: ${T.warning}; border: 1px solid ${T.warning}44; }
  .badge-rejected { background: ${T.error}22; color: ${T.error}; border: 1px solid ${T.error}44; }
  .badge-project { background: ${T.primary}22; color: ${T.primary}; border: 1px solid ${T.primary}44; }
  .badge-skill { background: #0ea5e922; color: #0ea5e9; border: 1px solid #0ea5e944; }
  .breadcrumb { font-size: 14px; color: ${T.muted}; margin-bottom: 20px; }
  .breadcrumb a { color: ${T.muted}; }
  .breadcrumb a:hover { color: ${T.text}; }
  .page-brief { font-size: 18px; color: ${T.muted}; margin-bottom: 24px; }
  .page-meta { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 32px; color: ${T.muted}; font-size: 13px; }
  .content-body { font-size: 15px; }
  .content-body h2 { font-size: 22px; }
  .content-body h3 { font-size: 17px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
  .card { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 10px; padding: 20px; display: flex; flex-direction: column; gap: 8px; transition: border-color 0.15s; }
  .card:hover { border-color: ${T.primary}; }
  .card-title { font-weight: 600; font-size: 16px; }
  .card-brief { color: ${T.muted}; font-size: 14px; line-height: 1.5; flex: 1; }
  .card-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: ${T.muted}; }
  .empty { color: ${T.muted}; text-align: center; padding: 48px; }
  .hero { background: linear-gradient(135deg, ${T.surface} 0%, ${T.surface2} 100%); border: 1px solid ${T.border}; border-radius: 12px; padding: 40px; margin-bottom: 48px; }
  .hero h1 { font-size: 48px; margin-bottom: 8px; }
  .hero p { font-size: 18px; color: ${T.muted}; }
  .skills-section { margin-top: 32px; padding: 20px; background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 10px; }
  .skills-section h3 { margin-top: 0; margin-bottom: 12px; }
  .skill-chip { display: inline-flex; align-items: center; gap: 6px; background: ${T.surface2}; border: 1px solid ${T.border}; border-radius: 6px; padding: 4px 12px; font-size: 13px; margin: 4px; }
  .assets-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 16px; }
  .asset-card { background: ${T.surface2}; border: 1px solid ${T.border}; border-radius: 8px; padding: 12px; font-size: 13px; }
  .asset-name { font-weight: 500; margin-bottom: 4px; word-break: break-all; }
  .asset-type { color: ${T.muted}; font-size: 12px; }
  .version-badge { font-size: 12px; color: ${T.muted}; background: ${T.surface2}; padding: 2px 8px; border-radius: 4px; font-family: monospace; }
  .notice { border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 14px; }
  .notice-warning { background: ${T.warning}11; border: 1px solid ${T.warning}44; color: ${T.warning}; }
  .notice-error { background: ${T.error}11; border: 1px solid ${T.error}44; color: ${T.error}; }
  .search-results { margin-top: 24px; }
  .search-result { padding: 16px 0; border-bottom: 1px solid ${T.border}; }
  .search-result:last-child { border-bottom: none; }
  .search-result-title { font-size: 17px; font-weight: 600; margin-bottom: 4px; }
  .search-result-brief { color: ${T.muted}; font-size: 14px; }
</style>
</head>
<body>
<nav class="nav">
  <a href="/" class="nav-brand">◆ <span>alumium</span> wiki</a>
  <div class="nav-links">
    <a href="/projects">Projects</a>
    <a href="/skills">Skills</a>
    <a href="${STORE_URL}" target="_blank">Skill Store ↗</a>
  </div>
  <div class="nav-right">
    <form action="/search" method="get">
      <input type="text" name="q" placeholder="Search wiki..." value="${searchQuery}">
      <button type="submit">Search</button>
    </form>
  </div>
</nav>
${body}
</body>
</html>`;
}

function pageCard(page) {
  const typeBadge = `<span class="badge badge-${page.type}">${page.type}</span>`;
  const statusBadge = page.pub_status !== 'validated'
    ? `<span class="badge badge-${page.pub_status}">${page.pub_status}</span>` : '';
  return `
<a href="/${page.type}s/${page.slug}" style="text-decoration:none; color:inherit;">
  <div class="card">
    <div class="card-meta">${typeBadge}${statusBadge}</div>
    <div class="card-title">${esc(page.title)}</div>
    <div class="card-brief">${esc(page.brief || '')}</div>
    <div class="card-meta">${esc(page.author_name || 'Anonymous')} · v${esc(page.pub_version || '1.0.0')}</div>
  </div>
</a>`;
}

// ── Route Handlers ────────────────────────────────────────

function handleLanding(req, res) {
  const recent = db.prepare(`
    SELECT * FROM pages WHERE pub_status = 'validated'
    ORDER BY updated_at DESC LIMIT 9
  `).all();

  const projects = recent.filter(p => p.type === 'project');
  const skills = recent.filter(p => p.type === 'skill');

  const projectSection = projects.length ? `
<div style="margin-bottom: 48px;">
  <div style="font-size:20px; font-weight:600; margin-bottom:16px;">Recent Projects</div>
  <div class="grid">${projects.map(pageCard).join('')}</div>
</div>` : '';

  const skillSection = skills.length ? `
<div style="margin-bottom: 48px;">
  <div style="font-size:20px; font-weight:600; margin-bottom:16px;">Recent Skills</div>
  <div class="grid">${skills.map(pageCard).join('')}</div>
</div>` : '';

  const empty = !recent.length ? `<div class="empty">
    No pages yet. Use the <code>wiki_publish</code> MCP tool to create the first project page.
  </div>` : '';

  const body = `<div class="container wide">
    <div class="hero">
      <h1>◆ Alumium Wiki</h1>
      <p>Public documentation for projects and skills. Human-readable, AI-generated, open to all.</p>
    </div>
    ${projectSection}${skillSection}${empty}
  </div>`;

  respond(res, 200, 'text/html', shell('Home', body));
}

function handleListPages(req, res, type) {
  const pages = db.prepare(`
    SELECT * FROM pages WHERE type = ? AND pub_status = 'validated'
    ORDER BY updated_at DESC LIMIT 100
  `).all(type);

  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1) + 's';

  const body = `<div class="container wide">
    <h1>${typeLabel}</h1>
    <p style="color:${T.muted}; margin-bottom:32px;">${pages.length} ${type}${pages.length !== 1 ? 's' : ''} published</p>
    ${pages.length
      ? `<div class="grid">${pages.map(pageCard).join('')}</div>`
      : `<div class="empty">No ${type}s published yet. Use <code>wiki_publish</code> to add one.</div>`
    }
  </div>`;

  respond(res, 200, 'text/html', shell(typeLabel, body));
}

function handlePageDetail(req, res, type, slug) {
  const page = db.prepare('SELECT * FROM pages WHERE type = ? AND slug = ?').get(type, slug);

  if (!page) {
    respond(res, 404, 'text/html', shell('Not Found',
      `<div class="container"><div class="empty">Page not found: <strong>${esc(type)}/${esc(slug)}</strong></div></div>`
    ));
    return;
  }

  const assets = db.prepare('SELECT * FROM asset_uploads WHERE page_id = ? ORDER BY created_at').all(page.id);
  const linkedSkills = page.linked_skills ? page.linked_skills.split(',').filter(Boolean) : [];

  const statusNotice = page.pub_status === 'submitted'
    ? `<div class="notice notice-warning">This page is pending review and may change.</div>`
    : page.pub_status === 'rejected'
    ? `<div class="notice notice-error">This page was rejected: ${esc(page.pub_reject_reason || 'no reason given')}</div>`
    : '';

  const assetsSection = assets.length ? `
<h2>Assets</h2>
<div class="assets-gallery">
  ${assets.map(a => `
    <div class="asset-card">
      <div class="asset-name"><a href="/assets/${a.file_path}">${esc(a.filename)}</a></div>
      <div class="asset-type">${esc(a.asset_type)}${a.caption ? ` — ${esc(a.caption)}` : ''}</div>
    </div>
  `).join('')}
</div>` : '';

  const linkedSkillsSection = linkedSkills.length ? `
<div class="skills-section">
  <h3>Skills used in this project</h3>
  <div>
    ${linkedSkills.map(s => `<span class="skill-chip">◆ ${esc(s)}</span>`).join('')}
  </div>
  <div style="font-size:13px; color:${T.muted}; margin-top:12px;">
    Install these skills: <code>store_install_bundle</code> or ask Claude to "install skills for ${esc(slug)}"
  </div>
</div>` : '';

  const contentHtml = page.content
    ? `<div class="content-body">${mdToHtml(page.content)}</div>`
    : `<div style="color:${T.muted}">No content yet.</div>`;

  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);

  const body = `<div class="container">
    <div class="breadcrumb">
      <a href="/">Wiki</a> › <a href="/${type}s">${typeLabel}s</a> › ${esc(page.title)}
    </div>
    ${statusNotice}
    <div style="margin-bottom: 8px;" class="page-meta">
      <span class="badge badge-${type}">${type}</span>
      <span class="badge badge-${page.pub_status}">${page.pub_status}</span>
      <span class="version-badge">v${esc(page.pub_version || '1.0.0')}</span>
    </div>
    <h1>${esc(page.title)}</h1>
    ${page.brief ? `<p class="page-brief">${esc(page.brief)}</p>` : ''}
    <div class="page-meta">
      ${page.author_name ? `<span>by ${esc(page.author_name)}</span>` : ''}
      <span>Updated ${esc((page.updated_at || '').slice(0, 10))}</span>
    </div>
    ${contentHtml}
    ${assetsSection}
    ${linkedSkillsSection}
  </div>`;

  respond(res, 200, 'text/html', shell(page.title, body));
}

function handleSearch(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const q = url.searchParams.get('q') || '';

  if (!q.trim()) {
    handleLanding(req, res);
    return;
  }

  const results = db.prepare(`
    SELECT * FROM pages
    WHERE pub_status = 'validated'
      AND (title LIKE ? OR brief LIKE ? OR content LIKE ? OR slug LIKE ?)
    ORDER BY updated_at DESC
    LIMIT 30
  `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);

  const body = `<div class="container">
    <h1>Search: "${esc(q)}"</h1>
    <p style="color:${T.muted}; margin-bottom:24px;">${results.length} result${results.length !== 1 ? 's' : ''}</p>
    ${results.length
      ? `<div class="search-results">${results.map(p => `
          <div class="search-result">
            <div class="search-result-title"><a href="/${p.type}s/${p.slug}">${esc(p.title)}</a></div>
            <div style="margin-bottom:4px;"><span class="badge badge-${p.type}">${p.type}</span></div>
            <div class="search-result-brief">${esc(p.brief || '')}</div>
          </div>
        `).join('')}</div>`
      : `<div class="empty">No results for "<strong>${esc(q)}</strong>".</div>`
    }
  </div>`;

  respond(res, 200, 'text/html', shell(`Search: ${q}`, body, { searchQuery: q }));
}

// ── API Handlers ──────────────────────────────────────────

async function handleApiSearch(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const q = url.searchParams.get('q') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const type = url.searchParams.get('type');

  let query = `SELECT * FROM pages WHERE pub_status = 'validated'`;
  const params = [];

  if (q) {
    query += ` AND (title LIKE ? OR brief LIKE ? OR content LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (type) {
    query += ` AND type = ?`;
    params.push(type);
  }
  query += ` ORDER BY updated_at DESC LIMIT ?`;
  params.push(limit);

  const results = db.prepare(query).all(...params);
  json(res, { results, total: results.length });
}

async function handleApiGetPage(req, res, slug) {
  const page = db.prepare('SELECT * FROM pages WHERE slug = ?').get(slug);
  if (!page) { json(res, { error: 'Page not found' }, 404); return; }
  const assets = db.prepare('SELECT * FROM asset_uploads WHERE page_id = ?').all(page.id);
  json(res, { page, assets });
}

async function handleApiPublish(req, res, body) {
  const { slug, type, title, brief, content, author_name, author_id, version, linked_skills } = body;

  if (!slug || !title || !type) {
    json(res, { error: 'slug, type, and title are required' }, 400);
    return;
  }

  const validTypes = ['project', 'skill'];
  if (!validTypes.includes(type)) {
    json(res, { error: `type must be one of: ${validTypes.join(', ')}` }, 400);
    return;
  }

  const existing = db.prepare('SELECT id, pub_version FROM pages WHERE slug = ?').get(slug);
  if (existing) {
    const parts = (existing.pub_version || '1.0.0').split('.').map(Number);
    const newVer = version || `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    db.prepare(`
      UPDATE pages SET title=?, brief=?, content=?, author_name=?, author_id=?,
        pub_version=?, pub_status='submitted', linked_skills=?, updated_at=datetime('now')
      WHERE slug=?
    `).run(title, brief || null, content || null, author_name || null, author_id || null,
      newVer, linked_skills || null, slug);
    json(res, { ok: true, action: 'updated', slug, version: newVer });
  } else {
    db.prepare(`
      INSERT INTO pages (slug, type, title, brief, content, author_name, author_id, pub_version, linked_skills)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(slug, type, title, brief || null, content || null,
      author_name || null, author_id || null, version || '1.0.0', linked_skills || null);
    json(res, { ok: true, action: 'created', slug, version: version || '1.0.0' });
  }
}

async function handleApiUploadAsset(req, res, slug) {
  // Simple multipart parser for file upload
  const page = db.prepare('SELECT id FROM pages WHERE slug = ?').get(slug);
  if (!page) { json(res, { error: 'Page not found' }, 404); return; }

  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
  if (!boundaryMatch) { json(res, { error: 'Expected multipart/form-data' }, 400); return; }

  const boundary = boundaryMatch[1];
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buf = Buffer.concat(chunks);

  const parts = parseMultipart(buf, boundary);
  const assetType = parts.fields['asset_type'] || 'screenshot';
  const caption = parts.fields['caption'] || null;
  const file = parts.files['file'];

  if (!file) { json(res, { error: 'No file uploaded' }, 400); return; }

  const pageAssetDir = join(ASSETS_DIR, slug);
  mkdirSync(pageAssetDir, { recursive: true });
  const filename = file.filename || `upload-${Date.now()}`;
  const filePath = join(pageAssetDir, filename);
  writeFileSync(filePath, file.data);

  const relPath = `/assets/${slug}/${filename}`;
  db.prepare(`
    INSERT INTO asset_uploads (page_id, filename, asset_type, file_path, file_size, caption)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(page.id, filename, assetType, relPath, file.data.length, caption);

  json(res, { ok: true, asset: { file_path: relPath, filename, asset_type: assetType } });
}

async function handleApiListPages(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const type = url.searchParams.get('type');
  const status = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

  let query = 'SELECT * FROM pages WHERE 1=1';
  const params = [];
  if (type) { query += ' AND type = ?'; params.push(type); }
  if (status) { query += ' AND pub_status = ?'; params.push(status); }
  query += ' ORDER BY updated_at DESC LIMIT ?';
  params.push(limit);

  const pages = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as n FROM pages').get().n;
  json(res, { pages, total });
}

async function handleApiValidate(req, res, slug) {
  db.prepare(`UPDATE pages SET pub_status = 'validated', updated_at = datetime('now') WHERE slug = ?`).run(slug);
  json(res, { ok: true });
}

async function handleApiReject(req, res, slug, body) {
  db.prepare(`UPDATE pages SET pub_status = 'rejected', pub_reject_reason = ?, updated_at = datetime('now') WHERE slug = ?`).run(body.reason || null, slug);
  json(res, { ok: true });
}

// ── Multipart Parser ──────────────────────────────────────

function parseMultipart(buf, boundary) {
  const fields = {};
  const files = {};
  const sep = Buffer.from('--' + boundary);
  const parts = splitBuffer(buf, sep);

  for (const part of parts) {
    if (part.length < 4) continue;
    const headerEnd = indexOfSequence(part, Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) continue;
    const headerStr = part.slice(0, headerEnd).toString();
    const data = part.slice(headerEnd + 4);
    // Strip trailing \r\n
    const body = data.slice(0, data.length - 2);
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    if (filenameMatch) {
      files[name] = { filename: filenameMatch[1], data: body };
    } else {
      fields[name] = body.toString();
    }
  }
  return { fields, files };
}

function splitBuffer(buf, sep) {
  const parts = [];
  let start = 0;
  let pos = buf.indexOf(sep, start);
  while (pos !== -1) {
    if (pos > start) parts.push(buf.slice(start, pos));
    start = pos + sep.length + 2; // skip \r\n after boundary
    pos = buf.indexOf(sep, start);
  }
  if (start < buf.length) parts.push(buf.slice(start));
  return parts;
}

function indexOfSequence(buf, seq) {
  for (let i = 0; i <= buf.length - seq.length; i++) {
    let match = true;
    for (let j = 0; j < seq.length; j++) {
      if (buf[i + j] !== seq[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}

// ── Static Asset Serving ──────────────────────────────────

function serveAsset(req, res, assetPath) {
  const fullPath = join(ASSETS_DIR, assetPath);
  if (!existsSync(fullPath)) {
    json(res, { error: 'Asset not found' }, 404); return;
  }
  const ext = extname(fullPath).toLowerCase();
  const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
    '.step': 'application/octet-stream', '.glb': 'model/gltf-binary',
    '.kicad_sym': 'text/plain', '.kicad_mod': 'text/plain', '.html': 'text/html' };
  const mime = mimeMap[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  res.end(readFileSync(fullPath));
}

// ── HTTP Utilities ────────────────────────────────────────

function respond(res, status, contentType, body) {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

function json(res, data, status = 200) {
  respond(res, status, 'application/json', JSON.stringify(data));
}

// ── Router ────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const method = req.method;

  if (path === '/health') {
    json(res, { ok: true, service: 'alumium-wiki', port: PORT }); return;
  }

  // Static assets
  if (method === 'GET' && path.startsWith('/assets/')) {
    serveAsset(req, res, path.slice(8)); return;
  }

  // API routes
  if (path.startsWith('/api/')) {
    const apiPath = path.slice(4);

    if (method === 'GET' && apiPath === '/search') {
      await handleApiSearch(req, res); return;
    }
    if (method === 'GET' && apiPath === '/v1/pages') {
      await handleApiListPages(req, res); return;
    }
    if (method === 'GET' && apiPath.startsWith('/page/')) {
      const slug = apiPath.replace(/^\/page\/(?:[^/]+\/)?/, '');
      await handleApiGetPage(req, res, slug); return;
    }
    if (method === 'GET' && apiPath.match(/^\/v1\/pages\/[^/]+$/)) {
      const slug = apiPath.split('/')[3];
      await handleApiGetPage(req, res, slug); return;
    }
    if (method === 'POST' && apiPath === '/v1/pages') {
      const chunks = []; for await (const c of req) chunks.push(c);
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch {}
      await handleApiPublish(req, res, body); return;
    }
    if (method === 'POST' && apiPath.match(/^\/v1\/pages\/[^/]+$/)) {
      const slug = apiPath.split('/')[3];
      const chunks = []; for await (const c of req) chunks.push(c);
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch {}
      body.slug = slug;
      await handleApiPublish(req, res, body); return;
    }
    if (method === 'POST' && apiPath.match(/^\/v1\/pages\/[^/]+\/assets$/)) {
      const slug = apiPath.split('/')[3];
      await handleApiUploadAsset(req, res, slug); return;
    }
    if (method === 'POST' && apiPath.match(/^\/admin\/pages\/[^/]+\/validate$/)) {
      const slug = apiPath.split('/')[3];
      if (req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
        json(res, { error: 'Unauthorized' }, 401); return;
      }
      await handleApiValidate(req, res, slug); return;
    }
    if (method === 'POST' && apiPath.match(/^\/admin\/pages\/[^/]+\/reject$/)) {
      const slug = apiPath.split('/')[3];
      if (req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
        json(res, { error: 'Unauthorized' }, 401); return;
      }
      const chunks = []; for await (const c of req) chunks.push(c);
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch {}
      await handleApiReject(req, res, slug, body); return;
    }

    json(res, { error: 'Not found' }, 404); return;
  }

  // HTML routes
  if (method === 'GET' && path === '/') { handleLanding(req, res); return; }
  if (method === 'GET' && path === '/projects') { handleListPages(req, res, 'project'); return; }
  if (method === 'GET' && path === '/skills') { handleListPages(req, res, 'skill'); return; }
  if (method === 'GET' && path.match(/^\/projects\/[^/]+$/)) {
    handlePageDetail(req, res, 'project', path.slice(10)); return;
  }
  if (method === 'GET' && path.match(/^\/skills\/[^/]+$/)) {
    handlePageDetail(req, res, 'skill', path.slice(8)); return;
  }
  if (method === 'GET' && path === '/search') { handleSearch(req, res); return; }

  respond(res, 404, 'text/html', shell('Not Found',
    `<div class="container"><div class="empty">Page not found: <strong>${esc(path)}</strong></div></div>`
  ));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[wiki] Alumium Wiki running on http://0.0.0.0:${PORT}`);
});
