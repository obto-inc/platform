---
name: obto-troubleshooting
description: >
  This skill should be used when the user reports an OBTO error, asks "why
  did this OBTO call fail", mentions errors like collection_not_in_allowlist,
  must pass appName/domain, host_mismatch, scope_ownership_mismatch, stale
  tools, tools missing after an OBTO update, a connector with no tools, or
  debugs an OBTO app via logs. Covers the error envelope, the
  after-update check, and diagnosis paths.
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

In each case tell the user in one line: reconnect the OBTO connector (Claude app: Settings > Connectors; Claude Code: `/mcp` > Reconnect; Codex: restart Codex), then start a **new** chat or thread, because an open chat keeps the tool list it started with. Do not retry the missing tool or imitate it with other tools; after the reconnect, `obto_whoami` in the new chat should show `sessionStale: false` and the new tools.

## A connector with no tools

When the user names a connector and it has no tools, stop and say exactly: "the <name> connector has no tools: check its URL with `codex mcp list` / `claude mcp list`; it must end in /ms/mcp". Never continue on another connector: each may be a different cluster. A hand-added entry with a plugin's name shadows the plugin's own entry; the fix is `codex mcp remove <name>`, then `codex mcp login <name>`.

## Common errors and what they actually mean

**`-32602` missing `appName`/`domain`** — the stateless contract: every call carries both explicitly. Get `domain` from `obto_whoami`; ask the user which app.

**`cross_tenant_not_allowed`** — the call passed a `domain` other than the signed-in identity's own, and the identity is not a super-user. Only super-users (dev-domain identity) may address other tenants. Use your own domain; work on another tenant is filed with `sdlc_create_item`.

**`unknown_domain`** — a typo'd tenant slug; read `didYouMean`.

**`collection_not_in_allowlist`** — `obto_db_query` reads only `pltf_log`, `pltf_appmap` and the collections the app exposes. Pick one from `obto_db_list_collections`, or read business data through the app's own routes (`obto_invoke_route`). To expose another collection, file it with `sdlc_create_item`.

**Query returns 0 rows you know exist** — the injected tenancy filter doesn't match how documents are scoped (e.g. docs lack an `app` or `domain` field). Run `obto_db_describe_collection` and check the collection's `tenancyFields`.

**`scope_ownership_mismatch` / ownership steering** — the call targeted an app/tenant the artifact doesn't belong to. Re-check `appName` + `domain`; don't retry blindly.

**`host_mismatch`** — browser-facing artifact host contradicts the app's canonical host. Omit `host` (it auto-fills) unless repairing records by `_id`.

**`missing_build_contract`** — `obto_scaffold_app` requires a `buildContract`: one paragraph with purpose, first vertical slice, and done criteria. The error's hint and example show the exact shape. If the human's request is too vague to write one, ask them — don't invent scope.

**`done_gate_failed`** — `obto_build_app` refused the build because the done gate failed and the platform (or this tenant) runs the gate in enforce mode. The message names each failing record and rule (`rule:line`). Run `obto_review_change` on those records, fix every error finding, save, and check `obto_review_change` mode `gate` until it returns `gateOk: true`; then build again, after the client's yes to go live. Do not rename the record, and do not ask for an override.

**`forbidden_domain`** (from `obto_review_change`) — the review or gate named an app outside your own tenant. Pass your own `domain`.

**A review finding you believe is wrong** — fix the code if you can. A warn/info finding may be suppressed with `// obto-review-ignore <rule> -- <reason>` on or above the line; an error cannot. If an error finding is a false positive, file it with the rule id and line (`sdlc_create_item`) and leave the record failing. Never dodge the gate.

**`name_collision`** — an upsert with `_id` hit a different existing record at the same (name, app, domain). Commit without `_id` to update the loader-canonical record (`existingId` in the error); file duplicates with `sdlc_create_item` — they can shadow deploys.

**`forbidden_operator`** — `$where`, `$function`, `$accumulator`, `$lookup`, `$graphLookup`, `$out`, `$merge` are blocked in queries by design. Rewrite with plain find filters.

**`tool_timeout`** — the call hit the server's 30-second wall-clock ceiling. This structured refusal is by design (it pre-empts the opaque client-side `-32001`). Retry once; if it recurs, shrink the operation — smaller chunks, narrower query, fewer records — rather than repeating the same call.

**`payment_required`** — the plan's limit was hit. Tell the client in plain words; paying needs their yes.

**Permission refusal writing `pltf_data_source`** — data-source writes are OBTO-admin only. Expected, not a bug: file the change with `sdlc_create_item`. JSON edits: see `obto-build-loop`.

**A `pltf_script_server` record "looks compiled"** — it was compiled from TypeScript; edit `ts_source` (see `obto-deploy`).

**`dynamic_tool_failed`** — a domain's own tool failed in its sandbox; file it with `sdlc_create_item`.

**Upload or staging errors** (`sha256_mismatch`, `invalid_base64`, from_url rejections) — see `obto-deploy` › Failure modes. For an edit, use `obto_patch_artifact`: none of these arise.

## Debugging an app at runtime

1. `obto_db_query` on `pltf_log` (always readable, domain-scoped, max 50 rows) — runtime errors and stack traces for the app's artifact categories.
2. `obto_get_app_logs` for a scan across all artifact categories.
3. `obto_fetch_app_graph` / `pltf_appmap` for dependency structure.
4. Reproduce via `obto_invoke_route` success-path calls.
5. `obto_capture_preview` — the actual render plus `console`, `pageErrors` and `failedRequests`: the client-side failures `pltf_log` never shows.

## Wrong page, old code, a 404 route, or a preview that only "loads"

See `obto-platform-boundary` (shells, activation, routes, defect reports) and the smoke gate in `obto-build-loop`. Never diagnose past the platform boundary: no restart, pods, `kubectl`, ssh or DNS console.
