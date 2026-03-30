/**
 * Alumium Skill Store MCP Server — stdio transport
 *
 * Wraps the skill store HTTP API for Claude Code tool use.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const STORE_API = process.env.STORE_API
  || 'https://noah-service-alumium-skill-store-fwwrark8f72y.adom.cloud/proxy/8790';
const STORE_TOKEN = process.env.STORE_AUTH_TOKEN || 'alumium-store-dev-2025';

const server = new McpServer({ name: 'alumium-store', version: '0.1.0' });

async function storeAPI(method, path, body = null, { auth = false } = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (auth) opts.headers['Authorization'] = `Bearer ${STORE_TOKEN}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${STORE_API}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Store API error (${res.status}): ${text}`);
  }
  return res.json();
}

function ok(text) { return { content: [{ type: 'text', text }] }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

// ── store_search ──────────────────────────────────────────
server.tool(
  'store_search',
  `Search the Alumium Skill Store for skills and widgets.
Returns matching skills with names, descriptions, ratings, and install counts.
Use this to discover skills before installing or to check if a skill exists before publishing.`,
  {
    query: z.string().describe('Search term — skill name, type, or keyword'),
    limit: z.number().min(1).max(50).default(10).describe('Max results (default 10)'),
  },
  async ({ query, limit }) => {
    try {
      const result = await storeAPI('GET', `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      if (!result.results || result.results.length === 0) {
        return ok(`No skills found for "${query}".`);
      }
      const lines = result.results.map(s => {
        const stars = s.avg_rating ? `★${s.avg_rating} (${s.rating_count})` : 'no ratings';
        const badges = [s.adom_official && '[Official]', s.adom_recommended && '[Recommended]'].filter(Boolean).join(' ');
        return `• ${s.name} (${s.slug})\n  ${s.brief || s.description || ''}\n  ${stars} | installs: ${s.install_count || 0} ${badges}`;
      });
      return ok(`Found ${result.results.length} skill(s):\n\n${lines.join('\n\n')}`);
    } catch (e) { return err(`Search failed: ${e.message}`); }
  }
);

// ── store_get ─────────────────────────────────────────────
server.tool(
  'store_get',
  `Get full details for a skill by slug, including description, ratings, reviews, and SKILL.md source.
Use this before installing to verify the skill does what you need.`,
  {
    slug: z.string().describe('Skill slug (URL-safe identifier, e.g. "symbol-creator")'),
  },
  async ({ slug }) => {
    try {
      const result = await storeAPI('GET', `/api/skills/${slug}`);
      if (!result.skill) return ok(`Skill not found: ${slug}`);
      const s = result.skill;
      const lines = [
        `# ${s.name} (${s.slug})`,
        s.brief || s.description,
        ``,
        `Type: ${s.type} | Status: ${s.pub_status} | Installs: ${s.install_count || 0}`,
        s.avg_rating ? `Rating: ★${s.avg_rating} (${s.rating_count} reviews)` : 'No ratings yet',
        s.author_name ? `Author: ${s.author_name}` : '',
        ``,
        `## Description`,
        s.description,
      ];
      if (s.skill_source) {
        lines.push(``, `## SKILL.md Source`, '```', s.skill_source, '```');
      }
      if (result.reviews && result.reviews.length > 0) {
        lines.push(``, `## Reviews`);
        for (const r of result.reviews.slice(0, 5)) {
          lines.push(`★${r.rating} by ${r.user_id}: ${r.review || '(no text)'}`);
        }
      }
      return ok(lines.filter(l => l !== null).join('\n'));
    } catch (e) { return err(`Get skill failed: ${e.message}`); }
  }
);

// ── store_install ─────────────────────────────────────────
server.tool(
  'store_install',
  `Install a skill from the store to ~/.claude/skills/<slug>/SKILL.md.
Downloads the skill source and writes it to the user's Claude Code skills directory.
After installing, restart Claude Code (or reload skills) for the skill to be available.`,
  {
    slug: z.string().describe('Skill slug to install'),
  },
  async ({ slug }) => {
    try {
      const result = await storeAPI('GET', `/api/skills/${slug}`);
      if (!result.skill) return err(`Skill not found: ${slug}`);
      const s = result.skill;

      if (!s.skill_source) {
        return err(`Skill "${slug}" has no SKILL.md source to install.`);
      }

      // Write to ~/.claude/skills/<slug>/SKILL.md
      const { homedir } = await import('os');
      const { mkdirSync, writeFileSync } = await import('fs');
      const { join } = await import('path');
      const skillDir = join(homedir(), '.claude', 'skills', slug);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), s.skill_source, 'utf-8');

      // Track install
      await storeAPI('POST', `/api/skills/${slug}/install`, null);

      return ok(`Installed skill "${s.name}" to ~/.claude/skills/${slug}/SKILL.md\n\nRestart or reload Claude Code to use it.`);
    } catch (e) { return err(`Install failed: ${e.message}`); }
  }
);

// ── store_publish ─────────────────────────────────────────
server.tool(
  'store_publish',
  `Publish a skill to the Alumium Skill Store.
Creates or updates a skill entry with the given details and SKILL.md source.
New skills are submitted for review; existing skills are updated immediately.
Share your skill with the community by publishing it here.`,
  {
    slug: z.string().describe('URL-safe unique identifier (lowercase, hyphens ok, e.g. "my-tool")'),
    name: z.string().describe('Human-readable skill name'),
    description: z.string().describe('Full description of what the skill does and how to use it'),
    brief: z.string().optional().describe('Short one-line description (1-2 sentences)'),
    skill_source: z.string().optional().describe('Full SKILL.md content for the skill'),
    type: z.enum(['skill', 'widget']).default('skill').describe('Content type'),
    author_name: z.string().optional().describe('Your display name'),
    author_id: z.string().optional().describe('Your unique ID (e.g. GitHub username)'),
  },
  async ({ slug, name, description, brief, skill_source, type, author_name, author_id }) => {
    try {
      const result = await storeAPI('POST', '/api/skills', {
        slug, name, description, brief, skill_source, type, author_name, author_id,
      });
      const action = result.action === 'created' ? 'Published new' : 'Updated';
      return ok(`${action} skill "${name}" (${slug}).\nView: ${STORE_API}/skills/${slug}\n\nStatus: submitted (pending review).`);
    } catch (e) { return err(`Publish failed: ${e.message}`); }
  }
);

// ── store_rate ────────────────────────────────────────────
server.tool(
  'store_rate',
  `Rate a skill in the Alumium Skill Store (1-5 stars).
Optionally include a written review. Ratings are public and help others discover quality skills.`,
  {
    slug: z.string().describe('Skill slug to rate'),
    rating: z.number().min(1).max(5).describe('Star rating (1-5)'),
    review: z.string().optional().describe('Optional written review'),
    user_id: z.string().optional().describe('Your identifier (shown publicly with the review)'),
  },
  async ({ slug, rating, review, user_id }) => {
    try {
      await storeAPI('POST', `/api/skills/${slug}/rate`, { rating, review, user_id });
      return ok(`Rated "${slug}" ${rating}/5 stars.${review ? ` Review saved.` : ''}`);
    } catch (e) { return err(`Rate failed: ${e.message}`); }
  }
);

// ── store_list_bundles ────────────────────────────────────
server.tool(
  'store_list_bundles',
  `List all available skill bundles in the store.
Bundles are curated collections of skills for specific workflows.
Official Adom bundles are marked and cover common hardware/AI workflows.`,
  {},
  async () => {
    try {
      const result = await storeAPI('GET', '/api/bundles');
      if (!result.bundles || result.bundles.length === 0) return ok('No bundles available yet.');
      const lines = result.bundles.map(b => {
        const badge = b.adom_official ? '[Official] ' : '';
        return `• ${badge}${b.name} (${b.slug}) — ${b.skill_count || 0} skills\n  ${b.description || ''}`;
      });
      return ok(`${result.bundles.length} bundle(s):\n\n${lines.join('\n\n')}`);
    } catch (e) { return err(`List bundles failed: ${e.message}`); }
  }
);

// ── store_get_bundle ──────────────────────────────────────
server.tool(
  'store_get_bundle',
  `Get details for a skill bundle, including all skills it contains.`,
  {
    slug: z.string().describe('Bundle slug'),
  },
  async ({ slug }) => {
    try {
      const result = await storeAPI('GET', `/api/bundles/${slug}`);
      if (!result.bundle) return ok(`Bundle not found: ${slug}`);
      const { bundle, skills } = result;
      const skillList = (skills || []).map(s => `  • ${s.name} (${s.slug}): ${s.brief || s.description || ''}`).join('\n');
      return ok(`# ${bundle.name}\n${bundle.description || ''}\n\nSkills (${skills.length}):\n${skillList}`);
    } catch (e) { return err(`Get bundle failed: ${e.message}`); }
  }
);

// ── store_install_bundle ──────────────────────────────────
server.tool(
  'store_install_bundle',
  `Install all skills in a bundle to ~/.claude/skills/.
Each skill's SKILL.md is written to its own directory.
After installing, restart or reload Claude Code to use the new skills.`,
  {
    slug: z.string().describe('Bundle slug to install'),
  },
  async ({ slug }) => {
    try {
      const result = await storeAPI('GET', `/api/bundles/${slug}`);
      if (!result.bundle) return err(`Bundle not found: ${slug}`);
      const { bundle, skills } = result;

      const { homedir } = await import('os');
      const { mkdirSync, writeFileSync } = await import('fs');
      const { join } = await import('path');

      const installed = [];
      const skipped = [];

      for (const s of (skills || [])) {
        if (!s.skill_source) { skipped.push(s.slug); continue; }
        const skillDir = join(homedir(), '.claude', 'skills', s.slug);
        mkdirSync(skillDir, { recursive: true });
        writeFileSync(join(skillDir, 'SKILL.md'), s.skill_source, 'utf-8');
        await storeAPI('POST', `/api/skills/${s.slug}/install`, null);
        installed.push(s.slug);
      }

      const lines = [`Installed bundle "${bundle.name}" (${slug}).`];
      if (installed.length) lines.push(`Installed: ${installed.join(', ')}`);
      if (skipped.length) lines.push(`Skipped (no source): ${skipped.join(', ')}`);
      lines.push(`\nRestart or reload Claude Code to use the new skills.`);
      return ok(lines.join('\n'));
    } catch (e) { return err(`Install bundle failed: ${e.message}`); }
  }
);

// ── store_create_bundle ───────────────────────────────────
server.tool(
  'store_create_bundle',
  `Create or update a skill bundle in the store.
Bundles group related skills for easy discovery and one-click installation.
Specify the skill slugs to include in the bundle.`,
  {
    slug: z.string().describe('URL-safe bundle identifier'),
    name: z.string().describe('Bundle name'),
    description: z.string().optional().describe('Bundle description'),
    skill_slugs: z.array(z.string()).describe('List of skill slugs to include'),
  },
  async ({ slug, name, description, skill_slugs }) => {
    try {
      const result = await storeAPI('POST', '/api/bundles', { slug, name, description, skill_slugs });
      return ok(`Bundle "${name}" (${slug}) saved with ${skill_slugs.length} skill(s).\nView: ${STORE_API}/bundles/${slug}`);
    } catch (e) { return err(`Create bundle failed: ${e.message}`); }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[store-mcp] stdio server running');
