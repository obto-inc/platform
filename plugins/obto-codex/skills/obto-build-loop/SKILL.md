---
name: obto-build-loop
description: >
  This skill should be used when the user asks to "build an app on OBTO",
  "create an OBTO app", "scaffold an app", "add a page/route/script to my
  OBTO app", or any task that creates or modifies OBTO application
  artifacts. Covers the stateless contract, the reliability-first build
  loop, and the done-means-done smoke gate.
version: 0.8.0
---

# OBTO App Build Loop

## Before anything else

1. Call `obto_whoami` first in every new conversation. Read the user's `domain`, super-user status, `operatorIdentity` flag, and `availableResources` from the response.
2. The server is **stateless (3.3.0+ contract)**: there is no session-level active app. Pass `appName` AND `domain` explicitly on **every** app-scoped tool call. Never assume a "current app" — if the user hasn't named one, ask, or discover with `obto_list_all_apps` / `obto_find_app_by_name`. (`obto_set_active_app` / `obto_reset_domain` / `obto_create_app` are RETIRED — do not call them.)
3. **Operator identities (3.5.2):** if whoami returns `operatorIdentity: true`, the home domain is the platform-operations domain — do NOT build user apps there. Ask the human which tenant domain to target. `obto_scaffold_app` refuses operator domains without an explicit `confirmOperatorDomain: true` (super-user only, logged).
4. **Cross-tenant addressing (3.5.26):** whoami's `domain` is only the connection vhost's default. Super-users (`crossTenantEnabled: true`) may pass ANY active tenant's domain per call — whoami also returns `identityDomain` (the identity's own tenant) and a `tenantDomains` registry summary (count + slugs) for discovery. Confirm a named tenant's slug against `tenantDomains` before writing; an unknown slug is refused with `unknown_domain` + `didYouMean` (typo guard). Regular users are pinned to their own domain (`cross_tenant_not_allowed`).
5. Read `obto://guide/quickstart` from the server's resources before the first deployment. The server-served guides are the source of truth — prefer them over assumptions. Scan the `availableResources` directory whoami returns and load the ones whose `whenToRead` fits the task — e.g. `obto://guide/blueprints` before writing code for a collection type, and `obto://guide/public-app-baseline` before claiming an app is done.

## The build loop

Work in this order; do not skip steps:

1. **Contract first.** Write a one-paragraph build contract: (1) what the app does, (2) the FIRST vertical slice to ship, (3) what "done" means for that slice. Confirm with the user if scope is unclear — never invent scope. As of 3.5.2 this is the `buildContract` parameter `obto_scaffold_app` requires (missing → `missing_build_contract` refusal with a teaching hint); it is stored on the application record.
2. **Scaffold.** Use `obto_scaffold_app` for new apps (creates record + working skeleton in one call), passing `buildContract` and `kind`: `'public'` for a browser web app (index page + App.tsx + App.css, ESM imports + relative `./` paths) or `'native'` for an OBTO shell component (ui_template + policy_client + script_client, window-global libs + `return ComponentName;`). The skeleton passes `obto_validate_app` immediately and writes each artifact to its correct collection. The response includes structured `nextSteps` — follow them in order.
3. **One vertical slice.** Ship a single end-to-end path (one page, one route, one script) and verify it works before expanding. Anything beyond the contract's slice is a NEW slice the human approves — not a silent addition.
4. **Verify after every write.** After each `obto_upsert_record` / route change, read the artifact back (`fetch` by id `<collection>::<app>::<domain>::<name>`, or `obto_grep_artifact` for a slice of a large one) and confirm the content landed. Never claim a write succeeded without reading it back. For a code-bearing script, `obto_validate_script` also runs **by reference** — omit `script` and name the stored artifact — so you can validate exactly what the platform stored, not what you meant to send. (Known false-fire: a `pltf_script_server` module containing ESM syntax fails by-reference validation at line 1; that one signature is benign.)
5. **Smoke gate before "done" — a preview URL is NOT verification.** `obto_generate_preview` returning a URL only proves the preview infra responded, not that the app works. "Done" means all of: `obto_validate_app` returns no errors; every public API route called via `obto_invoke_route` (or `curl --max-time 30`) returns the expected status + JSON shape — an HTML 200, a non-200, or a 524/timeout on an `/api/...` route is a failure, and a degraded-mode UI fallback is also a failure signal; `pltf_log` (via `obto_db_query`) shows no runtime errors; and, where the operator has provisioned headless Chromium, `obto_capture_preview` confirms the UI actually renders and its `console` / `pageErrors` / `failedRequests` are clean. See `obto://guide/public-app-baseline`.

## Artifact rules that bite

- Server scripts (`pltf_script_server`) need **named exports matching the record name** (`module.exports.MyService = MyService`, or `export const MyService` / `export default`). Bare `module.exports =` breaks `xe.*` lookup.
- **ESM + TypeScript are fine in server scripts AND routes.** The engine transpiles on save/compile (`import`/`export` → `require`/`module.exports`, types stripped): the stored `script` is the compiled output, `ts_source` keeps your original. So you may write `import { z } from 'zod'` and `interface`/type annotations directly. Two rules: (a) **npm imports resolve from the platform's `node_modules`** — a package OBTO doesn't ship must be added to the platform first (it is NOT auto-installed per app); (b) **reference another OBTO artifact as `xe.<record>`, never a relative path** — `import { helper } from './services/foo'` becomes `const { helper } = xe.foo` (or `@xe/foo`, which the compiler rewrites to `xe.foo`). Record names are the artifact names; a synced repo path like `services/vendor-bill.service` lands as record `services_vendor_bill_service` → `xe.services_vendor_bill_service`.
- In route/server code use `ob.db` with promise-style `await` — callback wrappers hang and return 524.
- Pages: a page named `index` serves at the app root; every app needs one.
- Omit `host` on browser-facing artifacts when the app already has them — the canonical host auto-fills, and a mismatched host is rejected with `host_mismatch`.
- Routes are managed by `obto_create_route` / `obto_update_route`, never by `obto_upsert_record`.
- Native client scripts (`pltf_script_client` / `pltf_policy_client`) end with a top-level `return ComponentName;` — that is the contract, and the upsert gate accepts it on server 3.5.19+. The gate also syntax-checks on save, so keep JSX balanced in every intermediate write, not just the final one.
- Data sources (`pltf_data_source`, server 3.5.21+): write via `obto_upsert_record` with `script` = `JSON.stringify({collection, pipeline[, label]})` — the server unpacks that JSON into the structured fields the runtime aggregation reads; `{{var}}` placeholders resolve at run time. Writes are policy-gated to admin identities: a permission refusal means the signed-in user lacks the admin role, not that the tool is broken. To edit one in place (3.5.22+), replace raw line 1 with the complete new compact JSON — fetch/grep show a pretty-printed view whose line numbers don't map to the stored bytes, and the server refuses any patch that leaves the JSON invalid.
- Properties (`obto_get_property` / `obto_set_property`) are the platform's env-var equivalent: dotted keys of at least two segments (e.g. `co.<vendor>.<area>.<key>`), domain-scoped, and never a home for plaintext secrets.

## Importing an existing Node/Express backend

When a repo is brought in (e.g. via the `githubintegration` sync), a standard Express backend lands as `pltf_script_server` records — controllers, routers, validation, services, middleware — but **OBTO never mounts an Express `Router`.** The `*_routes` files exist as scripts, so their endpoints are unreachable until translated. Translate each route file's endpoints into `pltf_route` records, **one per endpoint**:

- `router.METHOD('/x', authMw, validation, controller.handler)` → a `pltf_route` (`router:'api'`, `path` = the router's mount base + `/x`, e.g. `v1/vendor-bills/:id` → live at `/api/v1/vendor-bills/:id`) whose body: runs the middleware chain inline (promisify each `(req,res,next)` middleware; run express-validator chains with `for (const rule of chain) await rule.run(req)` then `validationResult(req)`), then the controller body. Shape: `module.exports.<routeName> = () => async (req,res) => { … }`.
- Follow the code rules above: keep npm `import`s as-is (add missing packages to the platform), rewrite internal imports to `xe.<record>`.
- Register specific paths (`/lines`, `/by-bill-id/:x`) before bare `:param` routes so they aren't shadowed.
- The controllers' **service layer** (`xe.services_*`) carries its own data models assuming the repo's schema — porting those to `ob.db` is a separate, larger migration than the route translation. Scope it explicitly with the human.

## Reading existing code — pick the right read for the job

Four reads, each with a distinct purpose — don't reach for a heavier one than you need:

- `search(query, appName, domain)` — find WHICH artifact (semantic search across the app's corpus). Returns ids.
- `fetch(id)` — read a WHOLE artifact. Right for small/medium files; avoid on large modules — it can flood your context.
- `obto_grep_artifact(appName, domain, artifactName, artifactType, pattern|startLine+endLine)` — read a SLICE of one artifact: matching lines (with context) or a line range, each formatted `N| text`. This is the read-side complement to `obto_patch_artifact` — use it to locate an edit site in a large file WITHOUT pulling the whole thing. The line number + line text feed straight into the patch as `startLine` + `anchorText`.
- `obto_patch_artifact` — the WRITE for an in-place edit (line-number based, not string-match).

The standard edit loop on a large artifact is: `grep_artifact` to find the lines → `obto_patch_artifact` to change them. Neither step ever moves the whole file. Read `obto://guide/patching` before editing.

## Large artifacts

If a source file is too big for one tool call, use the chunked-upload path; for a new source too large to emit as chunks at all, use deploy-by-reference (`obto_stage_chunk({action:'from_url'})`). See the `obto-deploy` skill. To EDIT an existing artifact, patch it in place (`obto_patch_artifact`) rather than re-uploading — even when it is large. One platform caveat: patching a server module that is loaded into `xe` at boot takes effect only after a pod reboot, whereas a normal app artifact patches live.

## Media files (images, video, PDFs) → `obto_upload_media`

For MEDIA the app serves to end users — not source code — use `obto_upload_media`. It uploads the file to the platform's file store and returns a stable viewer URL (image/PDF → `/ms/filereader.bto`, video → `/ms/videoplayer.bto`). Supply the bytes one of three ways: `url` (server fetches it — best for already-online media, any size), `uploadId` (stage workspace bytes via `obto_stage_chunk` in base64 mode, then pass the id), or `base64` (small inline). Always pass `filename` (its extension sets the MIME type and viewer). Do NOT use the artifact-deploy tools (`obto_stage_chunk` → `obto_upsert_record`) for media — those create `pltf_*` records; `obto_upload_media` targets the media store. They're separate destinations, not interchangeable.
