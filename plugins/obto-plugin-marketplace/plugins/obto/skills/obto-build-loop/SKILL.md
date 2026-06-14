---
name: obto-build-loop
description: >
  This skill should be used when the user asks to "build an app on OBTO",
  "create an OBTO app", "scaffold an app", "add a page/route/script to my
  OBTO app", or any task that creates or modifies OBTO application
  artifacts. Covers the stateless contract, the reliability-first build
  loop, and the done-means-done smoke gate.
version: 0.4.0
---

# OBTO App Build Loop

## Before anything else

1. Call `obto_whoami` first in every new conversation. Read the user's `domain`, super-user status, `operatorIdentity` flag, and `availableResources` from the response.
2. The server is **stateless (3.3.0+ contract)**: there is no session-level active app. Pass `appName` AND `domain` explicitly on **every** app-scoped tool call. Never assume a "current app" — if the user hasn't named one, ask, or discover with `obto_list_all_apps` / `obto_find_app_by_name`. (`obto_set_active_app` / `obto_reset_domain` / `obto_create_app` are RETIRED — do not call them.)
3. **Operator identities (3.5.2):** if whoami returns `operatorIdentity: true`, the home domain is the platform-operations domain — do NOT build user apps there. Ask the human which tenant domain to target. `obto_scaffold_app` refuses operator domains without an explicit `confirmOperatorDomain: true` (super-user only, logged).
4. Read `obto://guide/quickstart` from the server's resources before the first deployment. The server-served guides are the source of truth — prefer them over assumptions.

## The build loop

Work in this order; do not skip steps:

1. **Contract first.** Write a one-paragraph build contract: (1) what the app does, (2) the FIRST vertical slice to ship, (3) what "done" means for that slice. Confirm with the user if scope is unclear — never invent scope. As of 3.5.2 this is the `buildContract` parameter `obto_scaffold_app` requires (missing → `missing_build_contract` refusal with a teaching hint); it is stored on the application record.
2. **Scaffold.** Use `obto_scaffold_app` for new apps (creates record + working skeleton in one call), passing `buildContract`. The response includes structured `nextSteps` — follow them in order.
3. **One vertical slice.** Ship a single end-to-end path (one page, one route, one script) and verify it works before expanding. Anything beyond the contract's slice is a NEW slice the human approves — not a silent addition.
4. **Verify after every write.** After each `obto_upsert_record` / route change, fetch the artifact back (`fetch` with id `<collection>::<app>::<domain>::<name>`) and confirm the content landed. Never claim a write succeeded without reading it back.
5. **Smoke gate before "done".** Validate with `obto_validate_app`, generate a preview, check `pltf_log` for runtime errors via `obto_db_query`, and exercise the success path of every route you created.

## Artifact rules that bite

- Server scripts (`pltf_script_server`) need **named CommonJS exports matching the record name** (`module.exports.MyService = MyService`). Bare `module.exports =` breaks `xe.*` lookup.
- In route/server code use `ob.db` with promise-style `await` — callback wrappers hang and return 524.
- Pages: a page named `index` serves at the app root; every app needs one.
- Omit `host` on browser-facing artifacts when the app already has them — the canonical host auto-fills, and a mismatched host is rejected with `host_mismatch`.
- Routes are managed by `obto_create_route` / `obto_update_route`, never by `obto_upsert_record`.

## Reading existing code

Use `search(query, appName, domain)` → `fetch(id)` as the canonical read surface. Read `obto://guide/patching` before editing existing artifacts — `obto_patch_artifact` is line-number based, not string-match based.

## Large artifacts

If a source file is too big for one tool call, use the chunked-upload path; for a new source too large to emit as chunks at all, use deploy-by-reference (`obto_stage_chunk({action:'from_url'})`). See the `obto-deploy` skill. To EDIT an existing artifact, patch it in place (`obto_patch_artifact`) rather than re-uploading — even when it is large. One platform caveat: patching a server module that is loaded into `xe` at boot takes effect only after a pod reboot, whereas a normal app artifact patches live.
