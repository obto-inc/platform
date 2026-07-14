---
name: obto-troubleshooting
description: >
  This skill should be used when the user reports an OBTO error, asks "why
  did this OBTO call fail", mentions errors like collection_not_in_allowlist,
  must pass appName/domain, host_mismatch, scope_ownership_mismatch, stale
  tools, or wants to debug an OBTO app via logs. Covers the structured error
  envelope and the standard diagnosis paths.
version: 0.7.0
---

# OBTO Troubleshooting

## Read the envelope first

OBTO tools return structured errors: `{ok:false, error:<code>, hint:<what to do>}`. The `hint` is authoritative — follow it before improvising. An "error" string inside an `ok:true` payload is NOT a failure.

## Common errors and what they actually mean

**`-32602` missing `appName`/`domain`** — the stateless contract: every call carries both explicitly. Get `domain` from `obto_whoami`; ask the user which app.

**`cross_tenant_not_allowed`** — the call passed a `domain` other than the signed-in identity's own, and the identity is not a super-user. Only super-users (dev-domain identity) may address other tenants. Use the identity's own domain, or have an operator run the call.

**`unknown_domain`** (3.5.26) — a super-user call named a `domain` that is not an ACTIVE tenant in the `pltf_domain` registry. Almost always a typo'd slug: the envelope's `didYouMean` lists close matches, and whoami's `tenantDomains` carries the registry summary. Platform-code domains (`dev`, `global`, `mcp`, `core`, `edu`) are exempt. If the tenant was provisioned seconds ago, retry once — misses re-read the live registry.

**`collection_not_in_allowlist`** — `obto_db_query` only reads platform collections (`pltf_log`, `pltf_appmap`) plus collections the app opted into via `exposedCollections` on its **`application` record**. Fixes, in order: pick a collection from `obto_db_list_collections`; read business data through the app's own API routes via `obto_invoke_route` (often the more correct pattern); have the app owner add the opt-in with `obto_db_set_exposed_collections` (3.5.17+). Super-users (dev domain) bypass the allowlist automatically on 3.5.17+ (logged); on older servers they pass `allowUnexposed: true` explicitly.

**Query returns 0 rows you know exist** — the injected tenancy filter doesn't match how documents are scoped (e.g. docs lack an `app` or `domain` field). Run `obto_db_describe_collection` and check the collection's `tenancyFields`.

**`scope_ownership_mismatch` / ownership steering** — the call targeted an app/tenant the artifact doesn't belong to. Re-check `appName` + `domain`; don't retry blindly.

**`host_mismatch`** — browser-facing artifact host contradicts the app's canonical host. Omit `host` (it auto-fills) unless repairing records by `_id`.

**`-32005` session/version refusal** — the server shipped a new tool surface and evicted the stale session. This is by design: reconnect/re-init the client; the fresh catalog fixes it. If a connector keeps showing old parameter shapes or coerces types wrongly (e.g. a boolean arriving as `"true"`), the client's cached catalog is stale — reconnect the connector.

**`missing_build_contract`** (3.5.2) — `obto_scaffold_app` requires a `buildContract`: one paragraph with purpose, first vertical slice, and done criteria. The error's hint and example show the exact shape. If the human's request is too vague to write one, ask them — don't invent scope.

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
4. Reproduce via `obto_invoke_route` success-path calls.
5. `obto_capture_preview` (where the operator has provisioned headless Chromium via `co.obto.preview.chromium_path`) — drives a server-side browser to a preview/app URL and returns a stored screenshot URL plus the HTTP `status`, browser `console` entries, uncaught `pageErrors`, and `failedRequests`. This is how you catch *client-side* and network failures that `pltf_log` (server-side only) never shows, and how you SEE a broken render. Attach the `screenshotUrl` to a vision-capable model to inspect the UI. SSRF-restricted to authorized preview origins; read-only.

## A preview URL that "loads" is not proof

If a page renders but the data is wrong/empty, or someone says "the preview works" — don't trust the URL. A preview only proves the infra responded. Verify for real: `obto_validate_app` clean, every `/api` route exercised via `obto_invoke_route` returning the expected status + JSON shape (an HTML 200, a non-200, or a 524/timeout on an `/api/...` path is a failure, and a degraded-mode UI fallback is too), and `obto_capture_preview` to inspect the actual render plus its console/network. See `obto://guide/public-app-baseline`.

## When the server seems wrong

Confirm what's actually running before concluding anything: `obto_whoami` → `serverVersion` tells you whether a deploy reached the pod. Mismatched expectations are usually a stale client catalog, not a server regression.
