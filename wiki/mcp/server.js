/**
 * Alumium Wiki MCP Server — stdio transport
 *
 * Wraps the wiki HTTP API for Claude Code tool use.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const WIKI_API = process.env.WIKI_API
  || 'https://noah-service-alumium-wiki-86u9jsxwmrny.adom.cloud/proxy/8791';
const WIKI_TOKEN = process.env.WIKI_AUTH_TOKEN || 'alumium-wiki-dev-2025';

const server = new McpServer({ name: 'alumium-wiki', version: '0.1.0' });

async function wikiAPI(method, path, body = null, { auth = false } = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (auth) opts.headers['Authorization'] = `Bearer ${WIKI_TOKEN}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${WIKI_API}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Wiki API error (${res.status}): ${text}`);
  }
  return res.json();
}

function ok(text) { return { content: [{ type: 'text', text }] }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

// ── wiki_search ───────────────────────────────────────────
server.tool(
  'wiki_search',
  `Search the Alumium Wiki for project pages and skill documentation.
Returns matching pages with titles, briefs, and links.`,
  {
    query: z.string().describe('Search term — project name, skill name, or keyword'),
    type: z.enum(['project', 'skill']).optional().describe('Filter by page type'),
    limit: z.number().min(1).max(50).default(10).describe('Max results (default 10)'),
  },
  async ({ query, type, limit }) => {
    try {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      if (type) params.set('type', type);
      const result = await wikiAPI('GET', `/api/search?${params}`);
      if (!result.results || result.results.length === 0) {
        return ok(`No wiki pages found for "${query}".`);
      }
      const lines = result.results.map(p =>
        `• [${p.type}] ${p.title} (${p.slug})\n  ${p.brief || ''}\n  URL: /${p.type}s/${p.slug}`
      );
      return ok(`Found ${result.results.length} page(s):\n\n${lines.join('\n\n')}`);
    } catch (e) { return err(`Search failed: ${e.message}`); }
  }
);

// ── wiki_get_page ─────────────────────────────────────────
server.tool(
  'wiki_get_page',
  `Get a specific wiki page by slug. Returns full content, metadata, linked skills, and assets.`,
  {
    slug: z.string().describe('Page slug (URL-safe identifier, e.g. "my-robot-project")'),
  },
  async ({ slug }) => {
    try {
      const result = await wikiAPI('GET', `/api/v1/pages/${slug}`);
      if (!result.page) return ok(`Wiki page not found: ${slug}`);
      const p = result.page;
      const lines = [
        `# ${p.title}`,
        `Type: ${p.type} | Status: ${p.pub_status} | Version: ${p.pub_version}`,
        p.brief ? `\n${p.brief}` : '',
        p.author_name ? `\nAuthor: ${p.author_name}` : '',
        p.linked_skills ? `\nLinked skills: ${p.linked_skills}` : '',
        `\n## Content`,
        p.content || '(no content)',
      ];
      if (result.assets && result.assets.length > 0) {
        lines.push(`\n## Assets (${result.assets.length})`);
        for (const a of result.assets) {
          lines.push(`• ${a.filename} (${a.asset_type})${a.caption ? ` — ${a.caption}` : ''}`);
        }
      }
      return ok(lines.filter(l => l !== null).join('\n'));
    } catch (e) { return err(`Get page failed: ${e.message}`); }
  }
);

// ── wiki_publish ──────────────────────────────────────────
server.tool(
  'wiki_publish',
  `Publish or update a project or skill wiki page.
Creates a public-facing documentation page for the given project or skill.
New pages are marked as "submitted" pending review; updates bump the version.
Use this to generate a wiki page for any project you're working on.`,
  {
    slug: z.string().describe('URL-safe unique identifier (e.g. "my-robot-arm-project")'),
    type: z.enum(['project', 'skill']).default('project').describe('Page type'),
    title: z.string().describe('Human-readable page title'),
    brief: z.string().optional().describe('Short 1-2 sentence description'),
    content: z.string().optional().describe('Full page content in Markdown'),
    author_name: z.string().optional().describe('Author display name'),
    author_id: z.string().optional().describe('Author unique ID (e.g. GitHub username)'),
    linked_skills: z.string().optional().describe('Comma-separated skill slugs used in this project (e.g. "symbol-creator,jlcpcb")'),
    version: z.string().optional().describe('Explicit version string (e.g. "1.2.0"). Auto-incremented if omitted.'),
  },
  async ({ slug, type, title, brief, content, author_name, author_id, linked_skills, version }) => {
    try {
      const result = await wikiAPI('POST', '/api/v1/pages', {
        slug, type, title, brief, content, author_name, author_id, linked_skills, version,
      }, { auth: true });
      const action = result.action === 'created' ? 'Published new' : 'Updated';
      return ok(`${action} wiki page "${title}" (${slug}) v${result.version}.\nView: ${WIKI_API}/${type}s/${slug}\nStatus: ${result.action === 'created' ? 'submitted (pending review)' : 'updated'}.`);
    } catch (e) { return err(`Publish failed: ${e.message}`); }
  }
);

// ── wiki_list_pages ───────────────────────────────────────
server.tool(
  'wiki_list_pages',
  `List wiki pages with optional filters for type and publication status.`,
  {
    type: z.enum(['project', 'skill']).optional().describe('Filter by page type'),
    status: z.enum(['submitted', 'validated', 'rejected']).optional().describe('Filter by status'),
    limit: z.number().min(1).max(100).default(20).describe('Max results (default 20)'),
  },
  async ({ type, status, limit }) => {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      const result = await wikiAPI('GET', `/api/v1/pages?${params}`);
      if (!result.pages || result.pages.length === 0) return ok('No pages found.');
      const lines = result.pages.map(p => {
        const s = p.pub_status === 'validated' ? '[OK]' : p.pub_status === 'rejected' ? '[REJECTED]' : '[PENDING]';
        return `${s} [${p.type}] ${p.title} (${p.slug}) v${p.pub_version || '1.0.0'}`;
      });
      return ok(`${result.pages.length} page(s):\n\n${lines.join('\n')}`);
    } catch (e) { return err(`List failed: ${e.message}`); }
  }
);

// ── wiki_upload_asset ─────────────────────────────────────
server.tool(
  'wiki_upload_asset',
  `Upload a file asset (image, screenshot, design file) to a wiki page.
Supported asset types: screenshot, hero_image, kicad_sym, kicad_mod, step, glb, pdf, other.
Assets are shown in the page's asset gallery.`,
  {
    slug: z.string().describe('Wiki page slug to attach the asset to'),
    asset_type: z.enum(['screenshot', 'hero_image', 'kicad_sym', 'kicad_mod', 'step', 'glb', 'pdf', 'other'])
      .describe('Type of asset'),
    file_path: z.string().describe('Absolute local path to the file'),
    caption: z.string().optional().describe('Caption describing the asset'),
  },
  async ({ slug, asset_type, file_path: localPath, caption }) => {
    try {
      const { existsSync, readFileSync } = await import('fs');
      const { basename } = await import('path');
      if (!existsSync(localPath)) return err(`File not found: ${localPath}`);
      const fileData = readFileSync(localPath);
      const filename = basename(localPath);
      const CRLF = '\r\n';
      const boundary = `----AlumiumUpload${Date.now()}`;
      const parts = [];
      parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="asset_type"${CRLF}${CRLF}${asset_type}${CRLF}`));
      if (caption) parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="caption"${CRLF}${CRLF}${caption}${CRLF}`));
      parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: application/octet-stream${CRLF}${CRLF}`));
      parts.push(fileData);
      parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));
      const body = Buffer.concat(parts);
      const res = await fetch(`${WIKI_API}/api/v1/pages/${slug}/assets`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Authorization': `Bearer ${WIKI_TOKEN}`,
        },
        body,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
      const data = await res.json();
      return ok(`Uploaded ${filename} (${asset_type}) to page "${slug}".\nPath: ${data.asset?.file_path || 'unknown'}`);
    } catch (e) { return err(`Upload failed: ${e.message}`); }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[wiki-mcp] stdio server running');
