# OBTO Plugin for Claude

Build, deploy, and operate apps on the [OBTO platform](https://app.obto.co) from Claude.

## What's included

**MCP server connection** — connects Claude to the OBTO MCP server at `https://app.obto.co/ms/mcp` (full tool surface: app scaffolding, artifact deploys, routes, DB introspection, logs, memory, search/fetch).

**Skills**

| Skill | What it teaches Claude |
|---|---|
| `obto-build-loop` | The reliability-first app build workflow: stateless contract, scaffold → vertical slice → smoke gate, verify-after-write |
| `obto-deploy` | Choosing the write path (patch-in-place for edits vs. upsert vs. chunked upload vs. `from_url` deploy-by-reference), deployment order, sha256 verification, and post-deploy checks |
| `obto-memory` | Using `obto_remember`/`obto_recall` (Hindsight) effectively — scoping modes, keys, recall-before-work |
| `obto-troubleshooting` | Structured error envelopes, the common error codes, log-based debugging |

## Setup

1. Install the plugin.
2. Set your OBTO API token as an environment variable:

```bash
export OBTO_TOKEN="<your OBTO JWT>"
```

Get a token from your OBTO account (app.obto.co). All tenancy and permission enforcement happens server-side against this identity — the plugin grants no access your account doesn't already have.

3. Start a new conversation. Claude will call `obto_whoami` first and take it from there.

## Usage

Just describe what you want: "build a todo app on OBTO", "deploy this module to my app", "why is obto_db_query refusing my collection?", "remember that this app uses the X convention". The matching skill loads automatically.

## Notes

- The server is stateless (3.3.0+ contract): every call carries `appName` + `domain` explicitly. The skills handle this.
- If tool schemas ever look stale after a platform release, disconnect/reconnect the MCP server — the server force-refreshes stale clients by design.
