---
name: alumium
user-invocable: true
description: "Use for: managing skills (find, install, rate, publish, bundle), managing the project wiki (create/update/search project documentation), managing Alumium service containers, or any Alumium platform task. Triggers: 'install skill', 'find skill', 'publish skill', 'rate skill', 'create bundle', 'wiki', 'project page', 'document this project', 'share this skill', 'skill store', 'browse skills', 'install bundle', 'alumium containers', 'alumium status'."
---

# Alumium

Alumium is a lightweight, AI-first skill platform with two components:
- **Skill Store** (port 8790) — find, install, rate, and publish Claude Code skills and bundles
- **Wiki** (port 8791) — public project documentation, human-readable, AI-generated

## Architecture

Services run on dedicated **service containers** (SSH-only, `default-light` image), accessed from this main container via **SSH tunnels**:

```
Main container (noah-alumium-v25k8smsxsdi)
  ├── SSH tunnel localhost:8790 → skill-store container (noah-service-alumium-skill-store-fwwrark8f72y)
  ├── SSH tunnel localhost:8791 → wiki container (noah-service-alumium-wiki-86u9jsxwmrny)
  ├── Tunnel manager: ~/alumium/tunnels.sh (auto-reconnects every 30s)
  └── MCP servers (stdio) call http://127.0.0.1:8790 and :8791 via tunnels
```

The Adom proxy on this container exposes both services publicly:
- **Skill Store**: `https://noah-alumium-v25k8smsxsdi.adom.cloud/proxy/8790/`
- **Wiki**: `https://noah-alumium-v25k8smsxsdi.adom.cloud/proxy/8791/`

## Health Check — Run First If Something Fails

```bash
# Check both services are reachable via tunnels
curl -sf http://127.0.0.1:8790/health && echo " store OK" || echo " store DOWN"
curl -sf http://127.0.0.1:8791/health && echo " wiki OK" || echo " wiki DOWN"

# If DOWN: check tunnel manager
ps aux | grep tunnels.sh | grep -v grep

# If tunnel manager not running:
nohup bash ~/alumium/tunnels.sh >> /tmp/alumium-tunnels.log 2>&1 &

# If tunnel is up but service is down on remote container:
ssh -o StrictHostKeyChecking=no noah-service-alumium-skill-store-fwwrark8f72y@adom.cloud 'bash /home/adom/alumium/skill-store/start.sh'
ssh -o StrictHostKeyChecking=no noah-service-alumium-wiki-86u9jsxwmrny@adom.cloud 'bash /home/adom/alumium/wiki/start.sh'
```

## Capabilities

Match the user's request to a capability and follow the instructions.

| Capability | Triggers | Action |
|---|---|---|
| Search for skills | "find skill", "search for", "is there a skill for" | Use `store_search` MCP tool |
| Install a skill | "install skill", "add skill", "get skill" | Use `store_install` MCP tool |
| Install a bundle | "install bundle", "set up workflow" | Use `store_install_bundle` MCP tool |
| View skill details | "tell me about skill", "show skill" | Use `store_get` MCP tool |
| Publish a skill | "publish skill", "share skill", "upload skill" | Use `store_publish` MCP tool |
| Rate a skill | "rate skill", "review skill" | Use `store_rate` MCP tool |
| List bundles | "list bundles", "show bundles" | Use `store_list_bundles` MCP tool |
| Create a bundle | "create bundle", "group skills" | Use `store_create_bundle` MCP tool |
| Document a project | "create project page", "wiki page", "publish to wiki" | Use `wiki_publish` MCP tool |
| Search the wiki | "search wiki", "find project" | Use `wiki_search` MCP tool |
| Get a wiki page | "show wiki page", "read wiki page" | Use `wiki_get_page` MCP tool |
| List wiki pages | "list wiki pages", "show all projects" | Use `wiki_list_pages` MCP tool |
| Upload asset to wiki | "upload screenshot to wiki", "add image to wiki" | Use `wiki_upload_asset` MCP tool |
| Open Skill Store in workspace | "open skill store", "show skill store" | Use `adom-cli` — see Workspace section |
| Open Wiki in workspace | "open wiki", "show wiki" | Use `adom-cli` — see Workspace section |
| Check service status | "alumium status", "are services running" | Run health check commands above |
| Manage service containers | "alumium containers", "list containers" | Use `adom-cli` — see Container Management section |

## MCP Tool Reference

### Skill Store Tools

**`store_search`** — Search for skills
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | yes | Search term — skill name, type, or keyword |
| `limit` | number | no | Max results (default 10, max 50) |

**`store_get`** — Get full skill details including SKILL.md source
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | yes | Skill slug (e.g. "symbol-creator") |

**`store_install`** — Install a skill to `~/.claude/skills/<slug>/SKILL.md`
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | yes | Skill slug to install |

**`store_publish`** — Publish or update a skill
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | yes | URL-safe identifier (lowercase, hyphens) |
| `name` | string | yes | Human-readable skill name |
| `description` | string | yes | Full description of what the skill does |
| `brief` | string | no | Short 1-2 sentence summary |
| `skill_source` | string | no | Full SKILL.md content |
| `type` | "skill" or "widget" | no | Content type (default "skill") |
| `author_name` | string | no | Display name |
| `author_id` | string | no | Unique ID (e.g. GitHub username) |

**`store_rate`** — Rate a skill 1-5 stars
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | yes | Skill slug to rate |
| `rating` | number | yes | 1-5 stars |
| `review` | string | no | Written review text |
| `user_id` | string | no | Your identifier (shown publicly) |

**`store_list_bundles`** — List all bundles (no params)

**`store_get_bundle`** — Get bundle details
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | yes | Bundle slug |

**`store_install_bundle`** — Install all skills in a bundle
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | yes | Bundle slug to install |

**`store_create_bundle`** — Create or update a bundle
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | yes | URL-safe bundle identifier |
| `name` | string | yes | Bundle name |
| `description` | string | no | Bundle description |
| `skill_slugs` | string[] | yes | List of skill slugs to include |

### Wiki Tools

**`wiki_search`** — Search wiki pages
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | yes | Search term |
| `type` | "project" or "skill" | no | Filter by page type |
| `limit` | number | no | Max results (default 10, max 50) |

**`wiki_get_page`** — Get a wiki page by slug
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | yes | Page slug |

**`wiki_publish`** — Publish or update a wiki page
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | yes | URL-safe identifier |
| `type` | "project" or "skill" | no | Page type (default "project") |
| `title` | string | yes | Page title |
| `brief` | string | no | Short 1-2 sentence description |
| `content` | string | no | Full Markdown content |
| `author_name` | string | no | Author display name |
| `author_id` | string | no | Author unique ID |
| `linked_skills` | string | no | Comma-separated skill slugs (e.g. "symbol-creator,jlcpcb") |
| `version` | string | no | Explicit version string (auto-incremented if omitted) |

**`wiki_list_pages`** — List wiki pages
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | "project" or "skill" | no | Filter by page type |
| `status` | "submitted", "validated", or "rejected" | no | Filter by status |
| `limit` | number | no | Max results (default 20, max 100) |

**`wiki_upload_asset`** — Upload a file to a wiki page
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | yes | Wiki page slug to attach to |
| `asset_type` | enum | yes | One of: screenshot, hero_image, kicad_sym, kicad_mod, step, glb, pdf, other |
| `file_path` | string | yes | Absolute local path to the file |
| `caption` | string | no | Caption describing the asset |

## Publishing a Skill — Guide

1. Read the skill's SKILL.md source (if local file)
2. Ask for a slug if not obvious (lowercase, hyphens, e.g. `my-tool`)
3. Call `store_publish` with: slug, name, description, brief, skill_source, author_name
4. Report the store URL: `https://noah-alumium-v25k8smsxsdi.adom.cloud/proxy/8790/skills/<slug>`

## Creating a Wiki Page — Guide

1. Gather context: project name, what it does, how to use it, linked skills
2. Generate clean Markdown: overview, how it works, usage, skills used
3. Call `wiki_publish` with: slug, type ("project"), title, brief, content, linked_skills
4. Report the wiki URL: `https://noah-alumium-v25k8smsxsdi.adom.cloud/proxy/8791/projects/<slug>`

## Workspace Integration (adom-cli)

Open Alumium services as tabs in the Hydrogen editor workspace.

### Open Skill Store in workspace

```bash
# Get a leaf panel ID
LEAF_ID=$(adom-cli hydrogen workspace get 2>/dev/null | python3 -c "
import sys, json
def find_leaf(node):
    if node['type'] == 'leaf': return node['id']
    return find_leaf(node.get('first',{})) or find_leaf(node.get('second',{}))
print(find_leaf(json.load(sys.stdin)['root']))
")

# Add Web View tab and navigate to Skill Store
adom-cli hydrogen workspace add-tab \
  --panel-id "$LEAF_ID" \
  --panel-type "adom/a1b2c3d4-0031-4000-a000-000000000031" \
  --display-name "Skill Store" \
  --display-icon "mdi:store"

adom-cli hydrogen webview navigate \
  --panel-id "$LEAF_ID" \
  "https://noah-alumium-v25k8smsxsdi.adom.cloud/proxy/8790/"
```

### Open Wiki in workspace

```bash
adom-cli hydrogen workspace add-tab \
  --panel-id "$LEAF_ID" \
  --panel-type "adom/a1b2c3d4-0031-4000-a000-000000000031" \
  --display-name "Wiki" \
  --display-icon "mdi:book-open-variant"

adom-cli hydrogen webview navigate \
  --panel-id "$LEAF_ID" \
  "https://noah-alumium-v25k8smsxsdi.adom.cloud/proxy/8791/"
```

## Container Management (adom-cli)

Manage Alumium's service containers via `adom-cli`.

### List all Alumium containers

```bash
adom-cli carbon containers list-for-repo
```

### Check a specific service container

```bash
# Skill Store container
adom-cli carbon containers get fwwrark8f72y

# Wiki container
adom-cli carbon containers get 86u9jsxwmrny
```

### SSH into service containers

```bash
ssh noah-service-alumium-skill-store-fwwrark8f72y@adom.cloud
ssh noah-service-alumium-wiki-86u9jsxwmrny@adom.cloud
```

### Container UI

Container UI (port 8850) provides a web-based file manager for browsing service containers. The Skill Store and Wiki containers are pre-configured as connections.

```bash
# Start Container UI if not running
curl -sf http://127.0.0.1:8850/ > /dev/null || (cd ~/container-ui && nohup node server.js > /tmp/container-ui.log 2>&1 &)
```

### Service container slugs

| Service | Container Slug | SSH Username |
|---------|---------------|--------------|
| Skill Store | `fwwrark8f72y` | `noah-service-alumium-skill-store-fwwrark8f72y` |
| Wiki | `86u9jsxwmrny` | `noah-service-alumium-wiki-86u9jsxwmrny` |
| Main | `v25k8smsxsdi` | `noah-alumium-v25k8smsxsdi` |
