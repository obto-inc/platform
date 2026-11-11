---
name: obto-troubleshooting
description: >
  This skill should be used when the user reports an OBTO error, asks "why
  did this OBTO call fail", mentions errors like collection_not_in_allowlist,
  must pass appName/domain, host_mismatch, scope_ownership_mismatch, stale
  tools, tools missing after an OBTO update, a connector with no tools, or
  debugs an OBTO app via logs. Covers the error envelope, the
  after-update check, and diagnosis paths.
metadata:
  version: 0.9.1
---

# OBTO Troubleshooting

## Read the envelope first

OBTO tools return structured errors: `{ok:false, error:<code>, hint:<what to do>}`. The `hint` is authoritative — follow it before improvising. An "error" string inside an `ok:true` payload is NOT a failure.

## After an OBTO update

When OBTO announces a release, a tool is missing or behaves the old way, or the server seems wrong, call `obto_whoami` and read `sessionVersion`, `podVersion` and `sessionStale`:

- `sessionStale: true` — this connection was opened before the server was updated. New tools are absent from your tool list, and existing tools may still run their old code while answering `ok`.
- `sessionStale: false`, but a tool named in the release note is missing from your tool list — the client cached the old list.
- `sessionStale: null` — the server could not tell; judge by the tool list.

In each case tell the user in one line: reconnect the OBTO server (Grok Bot: Settings > Plugins > OBTO > Authenticate; Cursor: Customize > MCP, toggle OBTO off and on), then start a **new** chat or thread, because an open chat keeps the tool list it started with. Do not retry the missing tool or imitate it with other tools; after the reconnect, `obto_whoami` in the new chat should show `sessionStale: false` and the new tools.

## A connector with no tools

When the user names a connector and it has no tools, stop and say exactly: "the <name> connector has no tools: check its URL in the plugin's MCP settings; it must end in /ms/mcp". Never continue on another connector: each may be a different cluster. A hand-added MCP entry with the same URL can shadow the plugin's own entry; remove the hand-added one, then authenticate the plugin's server again.

## Common errors and what they actually mean

**`-32602` missing `appName`/`domain`** — the stateless contract: every call carries both explicitly. Get `domain` from `obto_whoami`; ask the user which app.

**`cross_tenant_not_allowed`** — the call passed a `domain` other than the signed-in identity's own, and the identity is not a super-user. Only super-users (dev-domain identity) may address other tenants. Use the identity's own domain, or have an operator run the call.

**`unknown_domain`** (3.5.26) — a super-user call named a `domain` that is not an ACTIVE tenant in the `pltf_domain` registry. Almost always a typo'd slug: the envelope's `didYouMean` lists close matches, and whoami's `tenantDomains` carries the registry summary. Platform-code domains (`dev`, `global`, `mcp`, `core`, `edu`) are exempt. If the tenant was provisioned seconds ago, retry once — misses re-read the live registry.

**`collection_not_in_allowlist`** — `obto_db_query` only reads platform collections (`pltf_log`, `pltf_appmap`) plus collections the app opted into via `exposedCollections` on its **`application` record**. Fixes, in order: pick a collection from `obto_db_list_collections`; read business data through the app's own API routes, checked with `obto_capture_preview` (often the more correct pattern); ask the app owner or the OBTO team to add the collection to the app's `exposedCollections`.

**Query returns 0 rows you know exist** — the injected tenancy filter doesn't match how documents are scoped (e.g. docs lack an `app` or `domain` field). Run `obto_db_describe_collection` and check the collection's `tenancyFields`.

**`scope_ownership_mismatch` / ownership steering** — the call targeted an app/tenant the artifact doesn't belong to. Re-check `appName` + `domain`; don't retry blindly.

**`host_mismatch`** — browser-facing artifact host contradicts the app's canonical host. Omit `host` (it auto-fills) unless repairing records by `_id`.

**`-32005` session/version refusal** — older servers only; since 3.5.89 a session opened before a release is rebuilt instead. Reconnect the connector. Old parameter shapes or wrong types (e.g. a boolean arriving as `"true"`) mean the client cached an old catalog — run the after-update check above.

**`missing_build_contract`** (3.5.2) — `obto_scaffold_app` requires a `buildContract`: one paragraph with purpose, first vertical slice, and done criteria. The error's hint and example show the exact shape. If the human's request is too vague to write one, ask them — don't invent scope.

**`done_gate_failed`** — `obto_build_app` refused the build because the done gate failed and the platform (or this tenant) runs the gate in enforce mode. The message names each failing record and rule (`rule:line`). Run `obto_review_change` on those records, fix every error finding, save, and check `obto_review_change` mode `gate` until it returns `gateOk: true`; then build again. Do not rename the record, and do not ask for an override.

**`forbidden_domain`** (from `obto_review_change`) — the review or gate named an app outside your own tenant. Pass your own `domain`: every identity reviews its own tenant's apps, and only the platform operator (identity domain `dev`) may review another tenant. A tenant owner's `super` role does not change this.

**A review finding you believe is wrong** — fix the code if you can. A warn/info finding may be suppressed with `// obto-review-ignore <rule> -- <reason>` on or above the line; an error cannot. If an error finding is a false positive, report it with the rule id and line (`obto-feedback`) and leave the record failing. Never dodge the gate.

**Operator-domain refusal** (3.5.2) — scaffolding into a platform-operations domain (e.g. `dev`) is refused by default. Ask the human for the target tenant domain; only intentional platform utilities use `confirmOperatorDomain: true` (super-user only, logged).

**`name_collision`** — an upsert with `_id` hit a different existing record at the same (name, app, domain). Commit without `_id` to update the loader-canonical record (`existingId` in the error); report duplicates for cleanup — they can shadow deploys.

**`forbidden_operator`** — `$where`, `$function`, `$accumulator`, `$lookup`, `$graphLookup`, `$out`, `$merge` are blocked in queries by design. Rewrite with plain find filters.

**`tool_timeout`** — the call hit the server's 30-second wall-clock ceiling. This structured refusal is by design (it pre-empts the opaque client-side `-32001`). Retry once; if it recurs, shrink the operation — smaller chunks, narrower query, fewer records — rather than repeating the same call.

**`payment_required`** — a billed tool hit a plan limit. The envelope echoes both `requestedDomain` and `billingDomain` (billing rolls up to the operator domain), so read both before concluding which tenant's plan fired; the operator/`dev` tenant is exempt.

**Permission refusal writing `pltf_data_source`** — data-source upserts (3.5.21+) pass through an admin-only pre-write policy. "You don't have permission" means the signed-in identity lacks the admin role — it is not a tool bug; the fix is identity, not retries. Also: the `script` must be `JSON.stringify({collection, pipeline[, label]})`, which the server unpacks into structured fields.

**Patching a data source fails with "must remain valid JSON"** — `fetch`/`obto_grep_artifact` display data-source JSON pretty-printed, but `obto_patch_artifact` (3.5.22+) addresses the RAW stored script, often one compact line — the display line numbers don't map to the stored bytes. The server refuses any patch whose result isn't valid `{collection, pipeline[, label]}` JSON (that refusal is protecting the record). The reliable edit: replace raw line 1 with the complete new compact JSON in one patch — or just re-upsert.

**Top-level `return X;` rejected in `pltf_script_client` / `pltf_policy_client`** — the server predates 3.5.19; the return-wrapped form is the contract and newer gates accept it. Check `obto_whoami.serverVersion`.

**`obto_validate_script` by-reference fails at line 1 on a server module** — known false-fire: by-reference validation parses `pltf_script_server` as a script, so ESM syntax in the module trips it. Treat that single signature as benign; any other syntax error is real.

**A `pltf_script_server` artifact "looks compiled" — comments gone, arrays on one line, `async params =>` style, line count differs from the source you know** — that IS the stored form, not corruption: server scripts are authored as ESM/TypeScript and the engine compiles on save; `script` holds the compiled output while `ts_source` keeps the original source (standard platform design). `obto_grep_artifact`/`obto_patch_artifact` address the compiled text, so line numbers from before a save are dead — re-grep immediately after ANY save and never reuse earlier numbers (an insert at a stale line number lands blind; insert mode has no anchor check). For module-scale edits, work on the source (`ts_source` via `obto_db_query`, or a local mirror) and re-deploy the full file via `obto_stage_chunk({action:'from_url'})` + sha256 — the save recompiles and re-syncs both fields.

**`dynamic_tool_failed` / a domain tool missing from the catalog** — per-tenant dynamic tools run vm-sandboxed inside a timeout + structured-envelope wrapper; a failure returns this envelope rather than crashing the session. A tool that never appears usually failed to compile at session init — the classic cause is an empty or stub `handlerFunction` on the `mcp_tools` record. Fix or delete the record (or set it inactive); don't leave dead tools error-logging every session.

## Deploy / upload failures (obto_stage_chunk → obto_upsert_record)

**`sha256_mismatch` that won't go away on a multi-byte source** — you're emitting utf8 chunks for a source dense with non-ASCII characters, which an agent can't reproduce byte-exact. Don't keep retrying: begin again with `transferEncoding:'base64'` and emit `base64 <file>` output, or — if the source is large — use `action:'from_url'`. The gate is correct; the emission is the problem.

**`invalid_base64` / `invalid_encoding`** — encoding mismatch between `begin` and the chunks (base64 buffer fed raw text, or vice-versa). Re-run `base64 <file>` in the shell and send that verbatim; never hand-assemble base64.

**Big source, every chunk attempt fails** — there's a practical emission ceiling (~9KB/chunk; agents silently drop characters above it). For ≈300KB+ artifacts, stop chunking and use `obto_stage_chunk({action:'from_url'})` so the server fetches the bytes. from_url rejections mean the URL isn't `https`, isn't reachable by the server, exceeds the 4MB cap / 30s timeout, or isn't in `co.obto.mcp.fetch_allowlist`.

**Editing, not creating?** None of the above should arise — `obto_patch_artifact` never reproduces the file, so byte-exactness and size limits don't apply. If you're fighting the upload path for an edit, you picked the wrong tool.

## Debugging an app at runtime

1. `obto_db_query` on `pltf_log` (always readable, domain-scoped, max 50 rows) — runtime errors and stack traces for the app's artifact categories.
2. `obto_get_app_logs` for a scan across all artifact categories.
3. `obto_fetch_app_graph` / `pltf_appmap` for dependency structure.
4. Reproduce with `obto_capture_preview` on the success path: the page that calls the route, then the route URL itself.
5. `obto_capture_preview` (where the operator has provisioned headless Chromium via `co.obto.preview.chromium_path`) — drives a server-side browser to a preview/app URL and returns a stored screenshot URL plus the HTTP `status`, browser `console` entries, uncaught `pageErrors`, and `failedRequests`. This is how you catch *client-side* and network failures that `pltf_log` (server-side only) never shows, and how you SEE a broken render. SSRF-restricted to authorized preview origins; read-only.

## The canonical host serves the wrong thing (shells, wrong app, HTML on an API)

A 200 that carries `<title>Site Missing!</title>`, "This domain was not found!!", or "This web address was not found!!" is a **platform shell**, not your app — and it is served with status 200, so anything checking status alone will call it healthy.

- Tell the layers apart with `obto_capture_preview` on the canonical URL: read `status`, the final captured URL and `failedRequests`, then `obto_get_app_logs`. A platform shell or another app's page on the canonical host is platform host routing; a 404 on a route that `obto_fetch_app_graph` lists is route registration; an error in the app's own log is app code.
- `obto_repair_publish({appName, domain, mode:'dry_run'})` walks the entire serving chain (host binding → site row/flags → DNS → root-document identity → bundle asset → API JSON on both surfaces) and returns `{check, before, action}` evidence; `mode:'repair'` applies the safe data-layer fixes idempotently and reports before/after. Run it before theorizing.
- If root serves your app but a bundle asset 404s, the built dist did not materialise — rebuild with `obto_build_app` (check the asset's STATUS, never body length).
- A caveat like `canonical_api_platform_routing_gap` on a publish means the platform, not your app, is degraded: the app is fine, the caveat names what a browser cannot yet reach. Relay it; there is no app-side fix.

## Code saved but the app still runs the old version

Read the write receipt's `codePropagation` — it is a fact about the artifact type, not a guess:
`read_per_request` (live now) · `syncs_live` (propagating; a probe may briefly hit an older copy) · `pending_platform_activation` (stored, activating asynchronously) · `requires_site_rebuild` (site-served host — the built bundle is what browsers get, so `obto_build_app` is the only propagation).

For `pending_platform_activation`: try `obto_reload_scripts`; otherwise **verify instead of intervening** — call something only the new version can answer (a new method → old module throws `x is not a function`; a new response field) through the app's own route, read with `obto_capture_preview`. Two traps: a job that reports `done` may have run the OLD code, and one runtime can serve new code while another serves old for many minutes — sample repeatedly before trusting a post-write smoke. If activation never happens, that is a platform incident to report by error code — never something you resolve with infrastructure access (see `obto-platform-boundary`).

## A preview URL that "loads" is not proof

If a page renders but the data is wrong/empty, or someone says "the preview works" — don't trust the URL. A preview only proves the infra responded, and a working preview or tenant-ingress call does NOT prove the canonical host works. Verify for real: `obto_validate_app` clean; every `/api` route exercised through `obto_capture_preview` returning the expected status and JSON body on the CANONICAL surface (an HTML 200, a non-200, or a 524/timeout is a failure, and a degraded-mode UI fallback is too); identity confirmed (is *my* app answering, not a shell or another app's build?); and `obto_capture_preview` to inspect the actual render plus its console/network. Best proof: one real user action performed and confirmed persisted. See `obto://guide/public-app-baseline`.

## Never diagnose past the platform boundary

If a diagnosis ends at "restart it", "recycle the pods", "check the cluster", "kubectl", "ssh in", or "fix the DNS record" — stop. That is outside the tenant surface and outside your remit even if you have the access. Report the structured error code and what you observed; the `obto-platform-boundary` skill has the symptom-to-MCP-action map and the defect-report shape.
