---
name: alumium
user-invocable: true
description: "Use for: managing skills (find, install, rate, publish, bundle), managing the project wiki (create/update/search project documentation), or any Alumium platform task. Triggers: 'install skill', 'find skill', 'publish skill', 'rate skill', 'create bundle', 'wiki', 'project page', 'document this project', 'share this skill', 'skill store', 'browse skills', 'install bundle'."
---

# Alumium

Alumium is a lightweight, AI-first skill platform with two components:
- **Skill Store** — find, install, rate, and publish Claude Code skills and bundles
- **Wiki** — public project documentation, human-readable, AI-generated

## How to use

Match the user's request to a capability below and follow the instructions directly (no sub-guide needed).

## Capabilities

| Capability | Triggers | Action |
|---|---|---|
| Search for skills | "find skill", "search for", "is there a skill for", "what skills exist" | Use `store_search` MCP tool |
| Install a skill | "install skill", "add skill", "get skill" | Use `store_install` MCP tool |
| Install a bundle | "install bundle", "install all skills for", "set up workflow" | Use `store_install_bundle` MCP tool |
| View skill details | "tell me about skill", "what does X skill do", "show skill" | Use `store_get` MCP tool |
| Publish a skill | "publish skill", "share skill", "upload skill", "contribute skill" | Use `store_publish` MCP tool — include slug, name, description, skill_source (SKILL.md content) |
| Rate a skill | "rate skill", "review skill", "give feedback on skill" | Use `store_rate` MCP tool |
| List bundles | "list bundles", "what bundles are there", "show bundles" | Use `store_list_bundles` MCP tool |
| Create a bundle | "create bundle", "make bundle", "group skills" | Use `store_create_bundle` MCP tool |
| Document a project | "create project page", "document this project", "make wiki page", "publish to wiki" | Use `wiki_publish` MCP tool — generate clean Markdown from the project context |
| Search the wiki | "search wiki", "find project", "look up in wiki" | Use `wiki_search` MCP tool |
| Get a wiki page | "get wiki page", "show project docs", "read wiki page" | Use `wiki_get_page` MCP tool |
| List wiki pages | "list wiki pages", "show all projects", "what's on the wiki" | Use `wiki_list_pages` MCP tool |
| Upload asset to wiki | "upload screenshot to wiki", "add image to project page", "attach file to wiki" | Use `wiki_upload_asset` MCP tool |

## Publishing a skill — guide

When the user asks to publish a skill:
1. Read the skill's SKILL.md source (if it's a local file)
2. Ask for a slug if not obvious (lowercase, hyphens, e.g. `my-tool`)
3. Call `store_publish` with:
   - `slug`: URL-safe identifier
   - `name`: human-readable name
   - `description`: what the skill does, how to use it, what triggers it
   - `brief`: 1-2 sentence summary
   - `skill_source`: full SKILL.md content
   - `author_name`: the user's name (ask if needed)
4. Report the store URL for the published skill

## Creating a project wiki page — guide

When the user asks to document a project:
1. Gather context: project name, what it does, how to use it, what skills it relies on
2. Generate clean Markdown content covering: overview, how it works, usage, skills used
3. Call `wiki_publish` with:
   - `slug`: project-name-hyphenated
   - `type`: "project"
   - `title`: project name
   - `brief`: 1-2 sentence summary
   - `content`: the Markdown content you generated
   - `linked_skills`: comma-separated skill slugs if any
4. Report the wiki URL

## Service URLs

- Skill Store: https://noah-service-alumium-skill-store-fwwrark8f72y.adom.cloud/proxy/8790
- Wiki: https://noah-service-alumium-wiki-86u9jsxwmrny.adom.cloud/proxy/8791
