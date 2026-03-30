/**
 * Alumium Skill Store
 *
 * Central hub for discovering, rating, and installing Claude Code skills.
 * Supports skill bundles, Adom-recommended badges, and community ratings.
 *
 * Port: 8790 (configurable via STORE_PORT)
 * DB:   ./store.sqlite3 (configurable via STORE_DB_PATH)
 */

import { createServer } from 'http';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.STORE_PORT || '8790', 10);
const DB_PATH = process.env.STORE_DB_PATH || join(__dirname, 'store.sqlite3');
const AUTH_TOKEN = process.env.STORE_AUTH_TOKEN || 'alumium-store-dev-2025';

// ── Database ──────────────────────────────────────────────

let db;
function openDatabase() {
  if (!existsSync(DB_PATH)) {
    console.error(`[store] Database not found at ${DB_PATH}`);
    console.error(`[store] Run: node setup-db.js`);
    process.exit(1);
  }
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('cache_size = -16000');
  console.log(`[store] Database loaded: ${DB_PATH}`);
}
openDatabase();

// ── Theme ─────────────────────────────────────────────────

const T = {
  bg: '#0d1117',
  surface: '#161b22',
  surface2: '#21262d',
  border: '#30363d',
  primary: '#7c3aed',
  primaryHover: '#6d28d9',
  text: '#e6edf3',
  muted: '#8b949e',
  success: '#3fb950',
  warning: '#d29922',
  error: '#f85149',
  adomRec: '#7c3aed',
  adomOfficial: '#0ea5e9',
};

// ── HTML Helpers ──────────────────────────────────────────

function shell(title, body, { searchQuery = '' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Alumium Skill Store</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${T.bg}; color: ${T.text}; font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.6; }
  a { color: ${T.primary}; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .nav { background: ${T.surface}; border-bottom: 1px solid ${T.border}; padding: 0 24px; display: flex; align-items: center; gap: 24px; height: 56px; }
  .nav-brand { font-weight: 700; font-size: 18px; color: ${T.text}; display: flex; align-items: center; gap: 8px; }
  .nav-brand span { color: ${T.primary}; }
  .nav-links { display: flex; gap: 20px; margin-left: 16px; }
  .nav-links a { color: ${T.muted}; font-size: 14px; }
  .nav-links a:hover { color: ${T.text}; }
  .nav-search { margin-left: auto; display: flex; gap: 8px; }
  .nav-search input { background: ${T.surface2}; border: 1px solid ${T.border}; border-radius: 6px; padding: 6px 12px; color: ${T.text}; font-size: 14px; width: 240px; outline: none; }
  .nav-search input:focus { border-color: ${T.primary}; }
  .nav-search button { background: ${T.primary}; border: none; border-radius: 6px; padding: 6px 14px; color: #fff; font-size: 14px; cursor: pointer; }
  .container { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
  .page-title { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
  .page-sub { color: ${T.muted}; margin-bottom: 32px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
  .card { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 10px; padding: 20px; display: flex; flex-direction: column; gap: 10px; transition: border-color 0.15s; }
  .card:hover { border-color: ${T.primary}; }
  .card-title { font-weight: 600; font-size: 16px; }
  .card-brief { color: ${T.muted}; font-size: 14px; line-height: 1.5; flex: 1; }
  .card-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .badge-adom-rec { background: ${T.adomRec}22; color: ${T.adomRec}; border: 1px solid ${T.adomRec}44; }
  .badge-official { background: ${T.adomOfficial}22; color: ${T.adomOfficial}; border: 1px solid ${T.adomOfficial}44; }
  .badge-bundle { background: ${T.success}22; color: ${T.success}; border: 1px solid ${T.success}44; }
  .stars { color: ${T.warning}; font-size: 14px; }
  .rating-count { color: ${T.muted}; font-size: 13px; }
  .btn { display: inline-block; padding: 7px 16px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; }
  .btn-primary { background: ${T.primary}; color: #fff; }
  .btn-primary:hover { background: ${T.primaryHover}; text-decoration: none; }
  .btn-outline { background: transparent; color: ${T.text}; border: 1px solid ${T.border}; }
  .btn-outline:hover { border-color: ${T.primary}; color: ${T.primary}; text-decoration: none; }
  .section-title { font-size: 20px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 12px; }
  .section-title a { font-size: 13px; color: ${T.primary}; font-weight: 400; }
  .section { margin-bottom: 48px; }
  .tag { font-size: 12px; color: ${T.muted}; background: ${T.surface2}; padding: 2px 8px; border-radius: 4px; }
  .empty { color: ${T.muted}; text-align: center; padding: 48px; }
  .detail-header { margin-bottom: 32px; }
  .detail-title { font-size: 32px; font-weight: 700; margin-bottom: 8px; }
  .detail-brief { color: ${T.muted}; font-size: 16px; margin-bottom: 16px; }
  .detail-content { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 10px; padding: 24px; margin-bottom: 24px; }
  .detail-content pre { background: ${T.surface2}; border: 1px solid ${T.border}; border-radius: 6px; padding: 16px; overflow-x: auto; font-size: 13px; white-space: pre-wrap; }
  .star-row { display: flex; gap: 4px; margin: 8px 0; }
  .star-btn { background: none; border: none; font-size: 24px; cursor: pointer; color: ${T.border}; }
  .star-btn.active { color: ${T.warning}; }
  .reviews { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
  .review { background: ${T.surface2}; border-radius: 6px; padding: 12px 16px; }
  .review-author { font-size: 13px; color: ${T.muted}; margin-bottom: 4px; }
  .review-text { font-size: 14px; }
  .breadcrumb { font-size: 14px; color: ${T.muted}; margin-bottom: 16px; }
  .breadcrumb a { color: ${T.muted}; }
  .breadcrumb a:hover { color: ${T.text}; }
  .install-box { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 10px; padding: 20px; margin-bottom: 24px; }
  .install-box h3 { font-size: 16px; margin-bottom: 12px; }
  .install-cmd { background: ${T.surface2}; border: 1px solid ${T.border}; border-radius: 6px; padding: 10px 14px; font-family: monospace; font-size: 13px; color: ${T.success}; margin-bottom: 12px; }
  .skill-source { background: ${T.surface2}; border: 1px solid ${T.border}; border-radius: 6px; padding: 16px; font-family: monospace; font-size: 12px; white-space: pre-wrap; max-height: 400px; overflow-y: auto; }
  .two-col { display: grid; grid-template-columns: 1fr 320px; gap: 24px; }
  .sidebar { display: flex; flex-direction: column; gap: 16px; }
  .sidebar-box { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 10px; padding: 16px; }
  .sidebar-box h4 { font-size: 14px; font-weight: 600; color: ${T.muted}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
  .stat-row { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; border-bottom: 1px solid ${T.border}; }
  .stat-row:last-child { border-bottom: none; }
  .stat-val { font-weight: 600; }
</style>
</head>
<body>
<nav class="nav">
  <a href="/" class="nav-brand">◆ <span>alumium</span> skills</a>
  <div class="nav-links">
    <a href="/skills">Skills</a>
    <a href="/bundles">Bundles</a>
  </div>
  <form class="nav-search" action="/search" method="get">
    <input type="text" name="q" placeholder="Search skills..." value="${searchQuery}">
    <button type="submit">Search</button>
  </form>
</nav>
${body}
</body>
</html>`;
}

function starsHtml(avg, count) {
  const full = Math.round(avg);
  const stars = '★'.repeat(full) + '☆'.repeat(5 - full);
  return `<span class="stars">${stars}</span> <span class="rating-count">(${count})</span>`;
}

function skillCard(skill) {
  const avgRating = skill.avg_rating || 0;
  const ratingCount = skill.rating_count || 0;
  const badges = [];
  if (skill.adom_official) badges.push(`<span class="badge badge-official">Adom Official</span>`);
  if (skill.adom_recommended) badges.push(`<span class="badge badge-adom-rec">Recommended</span>`);
  return `
<a href="/skills/${skill.slug}" style="text-decoration:none; color:inherit;">
  <div class="card">
    <div class="card-title">${esc(skill.name)}</div>
    <div class="card-brief">${esc(skill.brief || skill.description || '')}</div>
    <div class="card-meta">
      ${ratingCount > 0 ? starsHtml(avgRating, ratingCount) : '<span class="rating-count">No ratings yet</span>'}
      ${badges.join('')}
      <span class="tag">${esc(skill.type || 'skill')}</span>
    </div>
  </div>
</a>`;
}

function bundleCard(bundle) {
  return `
<a href="/bundles/${bundle.slug}" style="text-decoration:none; color:inherit;">
  <div class="card">
    <div class="card-meta"><span class="badge badge-bundle">Bundle</span>${bundle.adom_official ? '<span class="badge badge-official">Adom Official</span>' : ''}</div>
    <div class="card-title">${esc(bundle.name)}</div>
    <div class="card-brief">${esc(bundle.description || '')}</div>
    <div class="card-meta" style="color:${T.muted};font-size:13px;">${bundle.skill_count || 0} skills</div>
  </div>
</a>`;
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Query Helpers ─────────────────────────────────────────

function getSkillsWithRatings(filter = '', params = [], limit = 50) {
  return db.prepare(`
    SELECT s.*,
      ROUND(AVG(r.rating), 1) as avg_rating,
      COUNT(r.id) as rating_count
    FROM skills s
    LEFT JOIN ratings r ON r.skill_id = s.id
    WHERE s.pub_status = 'validated' ${filter ? 'AND ' + filter : ''}
    GROUP BY s.id
    ORDER BY s.adom_official DESC, s.adom_recommended DESC, COUNT(r.id) DESC, s.created_at DESC
    LIMIT ?
  `).all(...params, limit);
}

function getBundlesWithCount(filter = '', params = []) {
  return db.prepare(`
    SELECT b.*,
      COUNT(bs.skill_id) as skill_count
    FROM bundles b
    LEFT JOIN bundle_skills bs ON bs.bundle_id = b.id
    WHERE 1=1 ${filter ? 'AND ' + filter : ''}
    GROUP BY b.id
    ORDER BY b.adom_official DESC, b.created_at DESC
  `).all(...params);
}

// ── Route Handlers ────────────────────────────────────────

function handleLanding(req, res) {
  const featured = getBundlesWithCount('b.adom_official = 1').slice(0, 3);
  const allBundles = featured.length ? featured : getBundlesWithCount().slice(0, 3);
  const official = getSkillsWithRatings('s.adom_official = 1', [], 6);
  const popular = getSkillsWithRatings('s.adom_official = 0', [], 8);

  const bundleSection = allBundles.length ? `
<div class="section">
  <div class="section-title">Featured Bundles <a href="/bundles">View all →</a></div>
  <div class="grid">${allBundles.map(bundleCard).join('')}</div>
</div>` : '';

  const officialSection = official.length ? `
<div class="section">
  <div class="section-title">Adom Official Skills</div>
  <div class="grid">${official.map(skillCard).join('')}</div>
</div>` : '';

  const popularSection = popular.length ? `
<div class="section">
  <div class="section-title">Community Skills <a href="/skills">View all →</a></div>
  <div class="grid">${popular.map(skillCard).join('')}</div>
</div>` : '';

  const empty = !allBundles.length && !official.length && !popular.length
    ? `<div class="empty">No skills yet. <a href="/skills">Browse</a> or publish your first skill via the MCP tool <code>store_publish</code>.</div>`
    : '';

  const body = `<div class="container">
    <div style="text-align:center; padding: 48px 0 40px;">
      <div style="font-size:40px; font-weight:800; margin-bottom:8px;">◆ Alumium Skill Store</div>
      <div style="color:${T.muted}; font-size:18px;">Find, install, and share Claude Code skills &amp; widgets</div>
    </div>
    ${bundleSection}${officialSection}${popularSection}${empty}
  </div>`;

  respond(res, 200, 'text/html', shell('Home', body));
}

function handleSkillsList(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const type = url.searchParams.get('type') || '';
  const skills = type
    ? getSkillsWithRatings('s.type = ?', [type], 100)
    : getSkillsWithRatings('', [], 100);

  const body = `<div class="container">
    <div class="page-title">All Skills</div>
    <div class="page-sub">${skills.length} skill${skills.length !== 1 ? 's' : ''} available</div>
    ${skills.length
      ? `<div class="grid">${skills.map(skillCard).join('')}</div>`
      : `<div class="empty">No skills published yet. Use the <code>store_publish</code> MCP tool to add the first one.</div>`
    }
  </div>`;

  respond(res, 200, 'text/html', shell('Skills', body));
}

function handleSkillDetail(req, res, slug) {
  const skill = db.prepare(`
    SELECT s.*,
      ROUND(AVG(r.rating), 1) as avg_rating,
      COUNT(r.id) as rating_count
    FROM skills s
    LEFT JOIN ratings r ON r.skill_id = s.id
    WHERE s.slug = ?
    GROUP BY s.id
  `).get(slug);

  if (!skill) {
    respond(res, 404, 'text/html', shell('Not Found', `<div class="container"><div class="empty">Skill not found: <strong>${esc(slug)}</strong></div></div>`));
    return;
  }

  const reviews = db.prepare(`
    SELECT * FROM ratings WHERE skill_id = ? AND review IS NOT NULL ORDER BY created_at DESC LIMIT 20
  `).all(skill.id);

  const badges = [];
  if (skill.adom_official) badges.push(`<span class="badge badge-official">Adom Official</span>`);
  if (skill.adom_recommended) badges.push(`<span class="badge badge-adom-rec">Adom Recommended</span>`);
  badges.push(`<span class="tag">${esc(skill.type || 'skill')}</span>`);

  const avgRating = skill.avg_rating || 0;
  const ratingCount = skill.rating_count || 0;

  const reviewsHtml = reviews.length ? `
<div class="reviews">
  ${reviews.map(r => `
    <div class="review">
      <div class="review-author">${starsHtml(r.rating, 1).replace(' (1)', '')} — ${esc(r.user_id)}</div>
      <div class="review-text">${esc(r.review)}</div>
    </div>
  `).join('')}
</div>` : `<div style="color:${T.muted}; font-size:14px; padding: 12px 0;">No reviews yet.</div>`;

  const skillSourceHtml = skill.skill_source ? `
<div class="detail-content">
  <div style="font-size:14px; font-weight:600; margin-bottom:12px;">SKILL.md Source</div>
  <div class="skill-source">${esc(skill.skill_source)}</div>
</div>` : '';

  const body = `<div class="container">
    <div class="breadcrumb"><a href="/">Home</a> › <a href="/skills">Skills</a> › ${esc(skill.name)}</div>
    <div class="two-col">
      <div>
        <div class="detail-header">
          <div class="detail-title">${esc(skill.name)}</div>
          <div class="detail-brief">${esc(skill.brief || skill.description || '')}</div>
          <div class="card-meta">${badges.join('')} ${ratingCount > 0 ? starsHtml(avgRating, ratingCount) : ''}</div>
        </div>
        <div class="detail-content">
          <div style="white-space:pre-wrap; font-size:14px;">${esc(skill.description || '')}</div>
        </div>
        ${skillSourceHtml}
        <div class="detail-content">
          <div style="font-size:16px; font-weight:600; margin-bottom:12px;">Reviews (${ratingCount})</div>
          ${reviewsHtml}
        </div>
      </div>
      <div class="sidebar">
        <div class="install-box">
          <h3>Install this skill</h3>
          <div style="font-size:13px; color:${T.muted}; margin-bottom:12px;">Ask Claude Code to install it:</div>
          <div class="install-cmd">install skill ${esc(slug)}</div>
          <div style="font-size:12px; color:${T.muted};">Or use the MCP tool: <code>store_install("${esc(slug)}")</code></div>
        </div>
        <div class="sidebar-box">
          <h4>Info</h4>
          <div class="stat-row"><span>Author</span><span class="stat-val">${esc(skill.author_name || 'Community')}</span></div>
          <div class="stat-row"><span>Type</span><span class="stat-val">${esc(skill.type || 'skill')}</span></div>
          <div class="stat-row"><span>Installs</span><span class="stat-val">${skill.install_count || 0}</span></div>
          <div class="stat-row"><span>Status</span><span class="stat-val">${esc(skill.pub_status)}</span></div>
        </div>
        <div class="sidebar-box">
          <h4>Rate this skill</h4>
          <div style="font-size:13px; color:${T.muted}; margin-bottom:8px;">Use the MCP tool:</div>
          <div style="font-family:monospace; font-size:12px; color:${T.success};">store_rate("${esc(slug)}", 5)</div>
        </div>
      </div>
    </div>
  </div>`;

  respond(res, 200, 'text/html', shell(skill.name, body));
}

function handleBundlesList(req, res) {
  const bundles = getBundlesWithCount();

  const body = `<div class="container">
    <div class="page-title">Skill Bundles</div>
    <div class="page-sub">Pre-packaged collections of skills for common workflows</div>
    ${bundles.length
      ? `<div class="grid">${bundles.map(bundleCard).join('')}</div>`
      : `<div class="empty">No bundles yet. Create one with the <code>store_create_bundle</code> MCP tool.</div>`
    }
  </div>`;

  respond(res, 200, 'text/html', shell('Bundles', body));
}

function handleBundleDetail(req, res, slug) {
  const bundle = db.prepare('SELECT * FROM bundles WHERE slug = ?').get(slug);
  if (!bundle) {
    respond(res, 404, 'text/html', shell('Not Found', `<div class="container"><div class="empty">Bundle not found: <strong>${esc(slug)}</strong></div></div>`));
    return;
  }

  const skills = db.prepare(`
    SELECT s.*,
      ROUND(AVG(r.rating), 1) as avg_rating,
      COUNT(r.id) as rating_count
    FROM bundle_skills bs
    JOIN skills s ON s.id = bs.skill_id
    LEFT JOIN ratings r ON r.skill_id = s.id
    WHERE bs.bundle_id = ?
    GROUP BY s.id
    ORDER BY bs.sort_order
  `).all(bundle.id);

  const officialBadge = bundle.adom_official
    ? `<span class="badge badge-official">Adom Official</span>`
    : '';

  const body = `<div class="container">
    <div class="breadcrumb"><a href="/">Home</a> › <a href="/bundles">Bundles</a> › ${esc(bundle.name)}</div>
    <div class="detail-header">
      <div class="card-meta" style="margin-bottom:8px;"><span class="badge badge-bundle">Bundle</span>${officialBadge}</div>
      <div class="detail-title">${esc(bundle.name)}</div>
      <div class="detail-brief">${esc(bundle.description || '')}</div>
    </div>
    <div class="install-box">
      <h3>Install this bundle (${skills.length} skills)</h3>
      <div style="font-size:13px; color:${T.muted}; margin-bottom:12px;">Ask Claude Code to install all skills in this bundle:</div>
      <div class="install-cmd">install bundle ${esc(slug)}</div>
      <div style="font-size:12px; color:${T.muted};">Or use the MCP tool: <code>store_install_bundle("${esc(slug)}")</code></div>
    </div>
    <div class="section-title">Skills in this bundle</div>
    ${skills.length
      ? `<div class="grid">${skills.map(skillCard).join('')}</div>`
      : `<div class="empty">This bundle has no skills yet.</div>`
    }
  </div>`;

  respond(res, 200, 'text/html', shell(bundle.name, body));
}

function handleSearch(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const q = url.searchParams.get('q') || '';

  if (!q.trim()) {
    handleSkillsList(req, res);
    return;
  }

  const results = db.prepare(`
    SELECT s.*,
      ROUND(AVG(r.rating), 1) as avg_rating,
      COUNT(r.id) as rating_count
    FROM skills s
    LEFT JOIN ratings r ON r.skill_id = s.id
    WHERE s.pub_status = 'validated'
      AND (s.name LIKE ? OR s.description LIKE ? OR s.brief LIKE ? OR s.slug LIKE ?)
    GROUP BY s.id
    ORDER BY s.adom_official DESC, s.adom_recommended DESC, COUNT(r.id) DESC
    LIMIT 50
  `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);

  const body = `<div class="container">
    <div class="page-title">Search: "${esc(q)}"</div>
    <div class="page-sub">${results.length} result${results.length !== 1 ? 's' : ''}</div>
    ${results.length
      ? `<div class="grid">${results.map(skillCard).join('')}</div>`
      : `<div class="empty">No skills found for "<strong>${esc(q)}</strong>".</div>`
    }
  </div>`;

  respond(res, 200, 'text/html', shell(`Search: ${q}`, body, { searchQuery: q }));
}

// ── API Handlers ──────────────────────────────────────────

async function handleApiSearch(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const q = url.searchParams.get('q') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

  const results = db.prepare(`
    SELECT s.*,
      ROUND(AVG(r.rating), 1) as avg_rating,
      COUNT(r.id) as rating_count
    FROM skills s
    LEFT JOIN ratings r ON r.skill_id = s.id
    WHERE s.pub_status = 'validated'
      AND (s.name LIKE ? OR s.description LIKE ? OR s.brief LIKE ? OR s.slug LIKE ?)
    GROUP BY s.id
    ORDER BY s.adom_official DESC, s.adom_recommended DESC, COUNT(r.id) DESC
    LIMIT ?
  `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit);

  json(res, { results, total: results.length });
}

async function handleApiGetSkill(req, res, slug) {
  const skill = db.prepare(`
    SELECT s.*,
      ROUND(AVG(r.rating), 1) as avg_rating,
      COUNT(r.id) as rating_count
    FROM skills s
    LEFT JOIN ratings r ON r.skill_id = s.id
    WHERE s.slug = ?
    GROUP BY s.id
  `).get(slug);

  if (!skill) {
    json(res, { error: 'Skill not found' }, 404);
    return;
  }

  const reviews = db.prepare('SELECT * FROM ratings WHERE skill_id = ? ORDER BY created_at DESC LIMIT 20').all(skill.id);
  json(res, { skill, reviews });
}

async function handleApiPublish(req, res, body) {
  const { slug, name, description, brief, skill_source, type, author_name, author_id, adom_recommended, adom_official } = body;

  if (!slug || !name || !description) {
    json(res, { error: 'slug, name, and description are required' }, 400);
    return;
  }

  const existing = db.prepare('SELECT id FROM skills WHERE slug = ?').get(slug);
  if (existing) {
    db.prepare(`
      UPDATE skills SET name=?, description=?, brief=?, skill_source=?, type=?,
        author_name=?, author_id=?, updated_at=datetime('now')
      WHERE slug=?
    `).run(name, description, brief || null, skill_source || null, type || 'skill',
      author_name || null, author_id || null, slug);
    json(res, { ok: true, action: 'updated', slug });
  } else {
    // Require auth for new submissions (adom_official/adom_recommended flags)
    const isPrivileged = req.headers.authorization === `Bearer ${AUTH_TOKEN}`;
    db.prepare(`
      INSERT INTO skills (slug, name, description, brief, skill_source, type, author_name, author_id,
        adom_recommended, adom_official, pub_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')
    `).run(slug, name, description, brief || null, skill_source || null, type || 'skill',
      author_name || null, author_id || null,
      isPrivileged && adom_recommended ? 1 : 0,
      isPrivileged && adom_official ? 1 : 0);
    json(res, { ok: true, action: 'created', slug });
  }
}

async function handleApiRate(req, res, slug, body) {
  const { rating, review, user_id } = body;

  if (!rating || rating < 1 || rating > 5) {
    json(res, { error: 'rating must be 1-5' }, 400);
    return;
  }

  const skill = db.prepare('SELECT id FROM skills WHERE slug = ?').get(slug);
  if (!skill) {
    json(res, { error: 'Skill not found' }, 404);
    return;
  }

  const uid = user_id || 'anonymous';
  db.prepare(`
    INSERT OR REPLACE INTO ratings (skill_id, user_id, rating, review, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(skill.id, uid, rating, review || null);

  json(res, { ok: true });
}

async function handleApiListBundles(req, res) {
  const bundles = getBundlesWithCount();
  json(res, { bundles });
}

async function handleApiGetBundle(req, res, slug) {
  const bundle = db.prepare('SELECT * FROM bundles WHERE slug = ?').get(slug);
  if (!bundle) {
    json(res, { error: 'Bundle not found' }, 404);
    return;
  }
  const skills = db.prepare(`
    SELECT s.* FROM bundle_skills bs
    JOIN skills s ON s.id = bs.skill_id
    WHERE bs.bundle_id = ?
    ORDER BY bs.sort_order
  `).all(bundle.id);
  json(res, { bundle, skills });
}

async function handleApiCreateBundle(req, res, body) {
  const { slug, name, description, skill_slugs, adom_official } = body;
  if (!slug || !name) {
    json(res, { error: 'slug and name are required' }, 400);
    return;
  }
  const isPrivileged = req.headers.authorization === `Bearer ${AUTH_TOKEN}`;
  const existing = db.prepare('SELECT id FROM bundles WHERE slug = ?').get(slug);
  let bundleId;
  if (existing) {
    db.prepare('UPDATE bundles SET name=?, description=? WHERE slug=?').run(name, description || null, slug);
    bundleId = existing.id;
    db.prepare('DELETE FROM bundle_skills WHERE bundle_id = ?').run(bundleId);
  } else {
    const result = db.prepare(`
      INSERT INTO bundles (slug, name, description, adom_official) VALUES (?, ?, ?, ?)
    `).run(slug, name, description || null, isPrivileged && adom_official ? 1 : 0);
    bundleId = result.lastInsertRowid;
  }
  if (Array.isArray(skill_slugs)) {
    const insertSkill = db.prepare(`
      INSERT OR IGNORE INTO bundle_skills (bundle_id, skill_id, sort_order)
      SELECT ?, id, ? FROM skills WHERE slug = ?
    `);
    for (let i = 0; i < skill_slugs.length; i++) {
      insertSkill.run(bundleId, i, skill_slugs[i]);
    }
  }
  json(res, { ok: true, slug });
}

async function handleApiValidate(req, res, slug) {
  db.prepare(`UPDATE skills SET pub_status = 'validated', updated_at = datetime('now') WHERE slug = ?`).run(slug);
  json(res, { ok: true });
}

async function handleApiIncrementInstall(req, res, slug) {
  db.prepare('UPDATE skills SET install_count = install_count + 1 WHERE slug = ?').run(slug);
  json(res, { ok: true });
}

// ── HTTP Utilities ────────────────────────────────────────

function respond(res, status, contentType, body) {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

function json(res, data, status = 200) {
  respond(res, status, 'application/json', JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ── Router ────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const method = req.method;

  // Health check
  if (path === '/health') {
    json(res, { ok: true, service: 'alumium-skill-store', port: PORT });
    return;
  }

  // API routes
  if (path.startsWith('/api/')) {
    const apiPath = path.slice(4);

    if (method === 'GET' && apiPath === '/search') {
      await handleApiSearch(req, res); return;
    }
    if (method === 'GET' && apiPath === '/bundles') {
      await handleApiListBundles(req, res); return;
    }
    if (method === 'GET' && apiPath.startsWith('/bundles/')) {
      const slug = apiPath.slice(9);
      await handleApiGetBundle(req, res, slug); return;
    }
    if (method === 'GET' && apiPath.startsWith('/skills/')) {
      const slug = apiPath.slice(8);
      await handleApiGetSkill(req, res, slug); return;
    }
    if (method === 'POST' && apiPath === '/skills') {
      const body = await readBody(req);
      await handleApiPublish(req, res, body); return;
    }
    if (method === 'POST' && apiPath.match(/^\/skills\/[^/]+\/rate$/)) {
      const slug = apiPath.split('/')[2];
      const body = await readBody(req);
      await handleApiRate(req, res, slug, body); return;
    }
    if (method === 'POST' && apiPath.match(/^\/skills\/[^/]+\/install$/)) {
      const slug = apiPath.split('/')[2];
      await handleApiIncrementInstall(req, res, slug); return;
    }
    if (method === 'POST' && apiPath === '/bundles') {
      const body = await readBody(req);
      await handleApiCreateBundle(req, res, body); return;
    }
    if (method === 'POST' && apiPath.match(/^\/admin\/skills\/[^/]+\/validate$/)) {
      const slug = apiPath.split('/')[3];
      if (req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
        json(res, { error: 'Unauthorized' }, 401); return;
      }
      await handleApiValidate(req, res, slug); return;
    }

    json(res, { error: 'Not found' }, 404);
    return;
  }

  // HTML routes
  if (method === 'GET' && path === '/') {
    handleLanding(req, res); return;
  }
  if (method === 'GET' && path === '/skills') {
    handleSkillsList(req, res); return;
  }
  if (method === 'GET' && path.startsWith('/skills/')) {
    handleSkillDetail(req, res, path.slice(8)); return;
  }
  if (method === 'GET' && path === '/bundles') {
    handleBundlesList(req, res); return;
  }
  if (method === 'GET' && path.startsWith('/bundles/')) {
    handleBundleDetail(req, res, path.slice(9)); return;
  }
  if (method === 'GET' && path === '/search') {
    handleSearch(req, res); return;
  }

  respond(res, 404, 'text/html', shell('Not Found', `<div class="container"><div class="empty">Page not found: <strong>${esc(path)}</strong></div></div>`));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[store] Alumium Skill Store running on http://0.0.0.0:${PORT}`);
});
