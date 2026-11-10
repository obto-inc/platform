# OBTO Plugin for Codex

Build, deploy, verify, and troubleshoot applications on the
[OBTO platform](https://app.obto.co) from Codex.

## Included

- OBTO MCP server connection over OAuth (run `codex mcp login obto`; no token required)
- Reliable public and native application build workflow
- Ordered deployment with the right write path: patch-in-place for edits, chunked upload and `from_url` deploy-by-reference for large new artifacts
- Line-level editing with grep-to-patch reads
- Media/binary upload into the file store: server-side URL fetch, the app's own upload page, and chunked integrity-gated staging (fallback) — returning a served viewer URL
- Review loop after every save: `obto_review_change` until no error findings, tests (or "tests not run"), and the done gate (`gateOk: true`)
- Done-means-done verification: validate, exercise every route, and visual-debug with `obto_capture_preview` (a preview URL is not proof)
- Durable OBTO memory guidance
- Per-tenant MCP extension: publish custom tools, resources, and prompts through the triad CRUD (`obto_create_mcp_tool` …)
- The app's own Postgres database: read-only queries (`obto_pg_query`) and reviewed schema changes (`obto_pg_check` → `obto_pg_propose` → `obto_pg_apply` after the owner's yes)
- Error-envelope, routing, database, host, timeout, and stale-catalog troubleshooting
- The platform boundary: every workflow stays inside MCP — never `kubectl`, pod recycles, shells, or a DNS console

## Setup

1. Add the marketplace and install the plugin (the `obto-inc/platform` repository root **is** the marketplace; this package lives at `plugins/obto-codex`):

   ```bash
   codex plugin marketplace add obto-inc/platform
   codex plugin add obto@obto
   ```

2. Authorize the connection with OAuth and complete the browser sign-in:

   ```bash
   codex mcp login obto
   ```

   No token or environment variable is required, and a first-time sign-in provisions your workspace automatically.

3. Restart Codex and begin a new thread.

Troubleshooting:

- **Connected but no tools?** Check the URL with `codex mcp list` / `claude mcp list`: it must be `https://app.obto.co/ms/mcp`. A hand-added entry named `obto` shadows the plugin's; run `codex mcp remove obto`, then `codex mcp login obto`.
- **Sign-in errors:** 401 → accept the OAuth prompt in the browser. 400 "PKCE is mandatory" → update the client (current Claude and Codex send S256 PKCE). "Failed to check authorization requirements" → the sign-in page hiding an upstream 400; retry from the client, not by reloading. `invalid_redirect_uri` on registration → that `client_name` has another callback; use a distinct `client_name`.

To pick up a later release, run `codex plugin marketplace upgrade` — a marketplace snapshot never refreshes itself. The installed plugin tracks the snapshot, so no separate plugin-update step is needed.

The agent calls `obto_whoami` first; the server is stateless (3.3.0+ contract), so
every app-scoped call carries `appName` + `domain` explicitly.
