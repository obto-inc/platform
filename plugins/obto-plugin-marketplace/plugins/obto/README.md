# OBTO Plugin for Claude

Build, deploy, and operate apps on the [OBTO platform](https://app.obto.co) from Claude.

## What's included

**MCP server connection** — connects Claude to the OBTO MCP server at `https://app.obto.co/ms/mcp` (full tool surface: app scaffolding, artifact deploys, line-level patching + slice reads, routes, DB introspection, logs, memory, search/fetch, media uploads, visual-debug screenshots, per-tenant MCP tool/resource/prompt publishing, and payment links).

**Skills**

| Skill | What it teaches Claude |
|---|---|
| `obto-build-loop` | The reliability-first app build workflow: stateless contract, scaffold (public/native) → vertical slice → smoke gate (incl. `obto_capture_preview` visual check, preview-is-not-verification), grep→patch edits, verify-after-write |
| `obto-deploy` | Choosing the write path (patch-in-place for edits vs. upsert vs. chunked upload vs. `from_url` deploy-by-reference), deployment order, sha256 verification, and post-deploy checks |
| `obto-upload` | Getting a local media/binary file into the file store and back as a served URL: signed-URL direct upload (`obto_request_upload_url`, primary), chunked integrity-gated staging (fallback), server-side URL fetch, and the domain/body rules |
| `obto-memory` | Using `obto_remember`/`obto_recall` (Hindsight) effectively — scoping modes, keys, recall-before-work |
| `obto-mcp-extend` | Publishing per-tenant MCP tools, resources, and prompts through the triad CRUD (`obto_create_mcp_tool` …) — handler and schema rules, required annotations, Zod v4 traps, and catalog-freshness discipline |
| `obto-troubleshooting` | Structured error envelopes, the common error codes, log-based and visual (`obto_capture_preview`) debugging, and why a preview URL isn't proof |

## Setup

1. Install the plugin.
2. Start a new conversation. The first time Claude connects to the OBTO MCP server, you'll be prompted to sign in and authorize access via OAuth in your browser — approve it once and the connection is remembered. No API token or environment variable is required.

   Authentication is handled by OAuth against your OBTO account; all tenancy and permission enforcement happens server-side against that identity — the plugin grants no access your account doesn't already have.

3. Claude will call `obto_whoami` first and take it from there.

## Usage

Just describe what you want: "build a todo app on OBTO", "deploy this module to my app", "why is obto_db_query refusing my collection?", "remember that this app uses the X convention". The matching skill loads automatically.

## Notes

- The server is stateless (3.3.0+ contract): every call carries `appName` + `domain` explicitly. The skills handle this.
- If tool schemas ever look stale after a platform release, disconnect/reconnect the MCP server — the server force-refreshes stale clients by design.
