---
name: obto-troubleshooting
description: >
  This skill should be used when the user reports an OBTO error, asks "why
  did this OBTO call fail", mentions errors like collection_not_in_allowlist,
  must pass appName/domain, host_mismatch, scope_ownership_mismatch, stale
  tools, or wants to debug an OBTO app via logs. Covers the structured error
  envelope and the standard diagnosis paths.
version: 0.4.0
---

# OBTO Troubleshooting

## Read the envelope first

OBTO tools return structured errors: `{ok:false, error:<code>, hint:<what to do>}`. The `hint` is authoritative — follow it before improvising. An "error" string inside an `ok:true` payload is NOT a failure.

## Common errors and what they actually mean

**`-32602` missing `appName`/`domain`** — the stateless contract: every call carries both explicitly. Get `domain` from `obto_whoami`; ask the user which app.

**`collection_not_in_allowlist`** — `obto_db_query` only reads platform collections (`pltf_log`, `pltf_appmap`) plus collections the app opted into via `exposedCollections` on its **`application` record**. Fixes, in order: pick a collection from `obto_db_list_collections`; read business data through the app's own API routes via `obto_invoke_route` (often the more correct pattern); ask an admin to add the opt-in; super-users (dev domain) may pass `allowUnexposed: true` for an explicit, logged, domain-pinned bypass.

**Query returns 0 rows you know exist** — the injected tenancy filter doesn't match how documents are scoped (e.g. docs lack an `app` or `domain` field). Run `obto_db_describe_collection` and check the collection's `tenancyFields`.

**`scope_ownership_mismatch` / ownership steering** — the call targeted an app/tenant the artifact doesn't belong to. Re-check `appName` + `domain`; don't retry blindly.

**`host_mismatch`** — browser-facing artifact host contradicts the app's canonical host. Omit `host` (it auto-fills) unless repairing records by `_id`.

**`-32005` session/version refusal** — the server shipped a new tool surface and evicted the stale session. This is by design: reconnect/re-init the client; the fresh catalog fixes it. If a connector keeps showing old parameter shapes or coerces types wrongly (e.g. a boolean arriving as `"true"`), the client's cached catalog is stale — reconnect the connector.

**`missing_build_contract`** (3.5.2) — `obto_scaffold_app` requires a `buildContract`: one paragraph with purpose, first vertical slice, and done criteria. The error's hint and example show the exact shape. If the human's request is too vague to write one, ask them — don't invent scope.

**Operator-domain refusal** (3.5.2) — scaffolding into a platform-operations domain (e.g. `dev`) is refused by default. Ask the human for the target tenant domain; only intentional platform utilities use `confirmOperatorDomain: true` (super-user only, logged).

**`name_collision`** — an upsert with `_id` hit a different existing record at the same (name, app, domain). Commit without `_id` to update the loader-canonical record (`existingId` in the error); report duplicates for cleanup — they can shadow deploys.

**`forbidden_operator`** — `$where`, `$function`, `$accumulator`, `$lookup`, `$graphLookup`, `$out`, `$merge` are blocked in queries by design. Rewrite with plain find filters.

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

## When the server seems wrong

Confirm what's actually running before concluding anything: `obto_whoami` → `serverVersion` tells you whether a deploy reached the pod. Mismatched expectations are usually a stale client catalog, not a server regression.
