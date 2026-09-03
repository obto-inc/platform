---
name: obto-developer
description: >
  Build and deploy full-stack apps on the OBTO platform via MCP tools. OBTO stores all code as
  MongoDB records — no filesystem. Covers the stateless contract (appName + domain on every call),
  the collections (pltf_page, pltf_javascript, pltf_stylesheet, pltf_ui_template,
  pltf_script_client, pltf_policy_client, pltf_script_server, pltf_route, pltf_data_source), the
  write tools (obto_scaffold_app, obto_upsert_record, obto_create_route / obto_update_route,
  obto_patch_artifact), the read tools (search, fetch, obto_grep_artifact), the xe. cross-script
  pattern, and the done-means-done verification gate. USE THIS SKILL whenever OBTO MCP tools are
  connected (obto_whoami, obto_upsert_record, obto_create_route, obto_patch_artifact), or when the
  user mentions OBTO, deploying to OBTO, or references OBTO collections, hosts, domains, or xe.
  Even if the user just says "build me an app" and OBTO tools are available, use this skill.
---

# OBTO Developer Skill

You are an autonomous engineer on the OBTO platform. Every artifact of an application — pages, client and server scripts, routes, stylesheets, policies, UI templates, data sources — is a MongoDB record scoped by `(appName, domain)`; the runtime compiles those records into live pages and APIs. You call the MCP tools yourself — never instruct the user to run commands or invoke tools manually.

## Rule 0 — the stateless contract

Call `obto_whoami` first in every conversation. The server keeps **no** session-level active app or domain: pass `appName` AND `domain` explicitly on **every** app-scoped call. If the user hasn't named an app, ask, or discover with `obto_list_all_apps` / `obto_find_app_by_name`. If whoami returns `operatorIdentity: true`, never build into the home domain — ask the human which tenant domain to target.

## Rule 0.1 — never leave the MCP surface

The MCP tools are the whole platform. Create, deploy, diagnose, verify, and recover entirely through them: **never** use or recommend `kubectl`, pod restarts/recycles, container shells, SSH, a DNS console, a cloud console, or direct database access to make an OBTO app work — not even when you happen to have that access. A tenant has only MCP, so a fix that needs more than MCP is a platform defect to report, not a task to complete. When a write says `pending_platform_activation`, activation is the platform's job: try `obto_reload_scripts`, otherwise verify with a probe only the new code can answer. When a host serves the wrong thing, run `obto_repair_publish` (dry_run, then repair). When a tool refuses on capability, believe it and report the code.

## Rule 0.5 — the server teaches; read what it serves

`obto_whoami` returns `availableResources`: server-served guides (`obto://guide/quickstart`, `obto://guide/blueprints`, `obto://guide/public-app-baseline`, `obto://guide/patching`, …), each with a `whenToRead` hint. They are the source of truth for per-collection code shapes — read the ones that match the task **before** writing code. Tool descriptions and error envelopes are authoritative: failures return `{ok:false, error, hint}` and the `hint` names the fix; follow it before improvising. A `-32005` refusal means the server shipped a new tool surface — reconnect for a fresh catalog.

## The build loop

1. **Contract first.** `obto_scaffold_app` requires a `buildContract` (what the app does, the first vertical slice, what "done" means) and `kind`: `'public'` (browser web app) or `'native'` (OBTO shell component). It writes a working, validation-clean skeleton and returns structured `nextSteps` — follow them.
2. **Deploy order:** `pltf_script_server` first, then routes (`obto_create_route` / `obto_update_route` — never `obto_upsert_record` for routes), then stylesheets/JS, then pages. Every app needs a page named `index` (serves at the app root).
3. **One vertical slice** end-to-end before expanding. Scope beyond the contract is a new slice the human approves.
4. **Verify after every write.** Read the artifact back (`fetch` by composite id `<collection>::<app>::<domain>::<name>`), and validate stored code with `obto_validate_script` **by reference** (omit `script`).
5. **Done means:** `obto_validate_app` clean; every API route returns the expected status + JSON **shape** via `obto_invoke_route`; `pltf_log` (read via `obto_db_query`) shows no runtime errors; where provisioned, `obto_capture_preview` shows a clean render, console, and network. A preview URL alone is **not** verification — and neither is HTTP 200: OBTO's own "Site Missing" / "domain was not found" shells are served with status 200, so verify IDENTITY (is *my* app answering?) and content type, not availability. An HTML 200 on a JSON API is a failure. Check the surface a real visitor uses (the canonical host), not only the preview or tenant ingress; `obto_invoke_route`'s `connectVia` / `canonicalAttempt` / `layerVerdict` tell you which surface actually answered, and fallback success is not canonical success.

## Rules that bite

- **Server scripts** use named CommonJS exports matching the record name (`module.exports.MyService = MyService`); scripts and routes resolve each other at runtime via `xe.<Name>` — bare `module.exports =` breaks the lookup.
- **Mongo access** in routes/server scripts is `ob.db` — and it is **NOT promise-native**. Only `find()` returns something awaitable (a cursor you chain `.project().toArray()` on). `findOne`, `create`, `update`, `updateMany`, `delete`, `getCount`, `findAndUpdate` all take a trailing callback and return `undefined`, so a bare `await` on them resolves to `undefined` — and `findOne`/`create` silently substitute a no-op callback, discarding the result with no error. PROMISIFY, never drop the callback: `await new Promise((resolve, reject) => ob.db.findOne(coll, q, {}, (err, r) => (err ? reject(err) : resolve(r))))`. A handler that never resolves is the classic 524 hang.
- **Native client scripts** (`pltf_script_client` / `pltf_policy_client`) end with a top-level `return ComponentName;` — that is the contract.
- **Browser-facing artifacts:** omit `host`; the app's canonical host auto-fills (a contradicting host is rejected with `host_mismatch`).
- **Data sources** (`pltf_data_source`): `script` = `JSON.stringify({collection, pipeline[, label]})` — the server unpacks it into the structured fields the runtime reads. Writes are policy-gated to platform admins.
- **Reading code:** `search(query, appName, domain)` to find artifacts, `fetch(id)` for whole small ones, `obto_grep_artifact` for line-numbered slices of large ones. **Editing:** `obto_patch_artifact` (line-addressed, with `anchorText`) — never re-upload a large file to change a few lines. **Large new sources:** stage with `obto_stage_chunk`, commit via `obto_upsert_record({uploadId, sha256})`.
- **Media files** (images, video, PDFs) go through `obto_upload_media` and come back as a served viewer URL — never through the artifact-deploy tools.

## The richer path

This file is the single-file bootstrap. The full curated skill set — build loop, deploys & large files, media upload, agent memory, per-tenant MCP extension (custom tools/resources/prompts), troubleshooting, and the platform boundary (what to do instead of reaching for infrastructure) — ships as the plugin in this repository under [`plugins/obto/skills/`](./plugins/obto/skills/). Claude Code / Cowork: `/plugin marketplace add obto-inc/platform` then `/plugin install obto@obto`. Codex: `plugins/obto-codex`. Any other skills-compatible harness: copy the skill folders directly.
