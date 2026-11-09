---
name: obto-build-loop
description: >
  This skill should be used when the user asks to "build an app on OBTO",
  "create an OBTO app", "scaffold an app", "add a page/route/script to my
  OBTO app", or any task that creates or modifies OBTO application
  artifacts. Covers the stateless contract, the reliability-first build
  loop, the save-review-test-done loop, and the done-means-done smoke gate.
version: 0.10.0
---

# OBTO App Build Loop

## Before anything else

1. Call `obto_whoami` first in every new conversation and follow its `startHere.rules`. Read `domain` and `availableResources`.
2. The server is **stateless**: pass `appName` AND `domain` on **every** app-scoped call. Never assume a "current app" — if the user hasn't named one, ask, or find it with `obto_list_all_apps` / `obto_find_app_by_name`.
3. Read `obto://guide/quickstart` from the server's resources before the first deployment. The server-served guides are the source of truth — prefer them over assumptions. Scan the `availableResources` directory whoami returns and load the ones whose `whenToRead` fits the task — e.g. `obto://guide/blueprints` before writing code for a collection type, and `obto://guide/public-app-baseline` before claiming an app is done.

**Organize first.** One thread = one item; its train id is the work item id (e.g. WT-28) or the team's train number. Title the thread `<train id> <emoji> <short name>`: ⚪ queued, 🟡 in progress, 🟠 blocked (name the blocker), 🟢 done. Retitle when the state changes; with no rename tool, ask the person once. Finish or hand off the item, mark it 🟢, then take the next, one at a time. New work found mid-thread is its own item (`sdlc_create_item`), not a detour.

## The build loop

Work in this order; do not skip steps:

1. **Contract first.** Write the build contract: (1) what the app does, (2) the FIRST vertical slice, (3) what "done" means for it. Show it as a numbered plan and get the client's yes before any save, scaffold included; never invent scope. `obto_scaffold_app` requires it as `buildContract`.
2. **Scaffold.** Use `obto_scaffold_app` for new apps (creates record + working skeleton in one call), passing `buildContract` and `kind`: `'public'` for a browser web app (index page + App.tsx + App.css, ESM imports + relative `./` paths) or `'native'` for an OBTO shell component (ui_template + policy_client + script_client, window-global libs + `return ComponentName;`). The skeleton passes `obto_validate_app` immediately and writes each artifact to its correct collection. The response includes structured `nextSteps` — follow them in order.
3. **One vertical slice.** Ship a single end-to-end path (one page, one route, one script) and verify it works before expanding. Anything beyond the contract's slice is a NEW slice only after a yes — not a silent addition.
4. **Verify after every write.** After each `obto_upsert_record` / route change, read the artifact back (`fetch` by id `<collection>::<app>::<domain>::<name>`, or `obto_grep_artifact` for a slice of a large one) and confirm the content landed. Never claim a write succeeded without reading it back. For a code-bearing script, `obto_validate_script` also runs **by reference** — omit `script` and name the stored artifact — so you can validate exactly what the platform stored, not what you meant to send.
5. **Review, test, gate — after every save.** This is the same loop as `obto://guide/quickstart` Rule 5.
   - **Review** what you saved: `obto_review_change` with `targets` = every record you changed in this step. Fix every **error** finding, save, and review those records again. Repeat until there are no errors. Fix warnings, or suppress one with a comment `// obto-review-ignore <rule> -- <reason>` on or above the line (warn/info only; an error can never be suppressed).
   - **Test.** If `obto_run_tests` is in your tool list, run every plan and add a test for new behaviour (`obto_save_test`). Otherwise say "tests not run" (`obto_test_results` shows earlier runs). Never call untested verified.
   - **Gate.** `obto_review_change` mode `gate` must return `gateOk: true` before you say done or ask to go live. `obto_validate_app` shows the same verdict in `doneGate`. Going live (`obto_build_app`) needs the client's yes to that, and it refuses a failing gate (`done_gate_failed`).
   - Never rename or split a record to dodge a finding, suppress an error, or ask for a gate override. `gateOverride` is an operator tool with an audited reason, not part of the loop.
6. **Smoke gate before "done" — verify semantically, on the surface a real visitor uses.** A preview URL proves only that the preview infra responded, and **HTTP 200 proves nothing at all**: OBTO's own "Site Missing" / "domain was not found" shells are served with status 200, so a status-only check certifies broken apps as working. "Done" means all of:
   - The done gate passes: `obto_review_change` mode `gate` returns `gateOk: true` (step 5).
   - `obto_validate_app` returns no errors.
   - Every public API route called via `obto_invoke_route` returns the expected status, **content type, and JSON shape**. An HTML 200 on an `/api/...` route is a failure, never a response; so is a non-200, a 524/timeout, or a degraded-mode UI fallback.
   - The receipt says WHICH surface answered. `connectVia:'canonical'` means the real canonical host served it; a `tenant_ingress_semantic_fallback` (with `canonicalAttempt` + `layerVerdict`) means the canonical host served a platform shell and the tool fell back — that is a finding to report, not a pass. **Fallback success is not canonical success.**
   - For a published app, `obto_get_build_status` shows `publish.status: 'published'` with its per-surface `verify` evidence, and you have READ any `caveats` (a publish can be genuinely published and still carry a known platform degradation).
   - `pltf_log` (via `obto_db_query`) shows no runtime errors.
   - `obto_capture_preview` each page; read `visibleText` (sign-in or loading = not seen) and check `console` / `pageErrors` / `failedRequests`.
   - Best proof: one real user action end to end, read back through the app's API — with test data the client agreed to (preview data is real), then remove it.
   - Report the evidence: the gate verdict, the review ids or "no errors" per record, test run ids (or "tests not run"), and the smoke results above.

   If a check fails in a way that looks like infrastructure, do NOT reach for infrastructure — see the `obto-platform-boundary` skill. See also `obto://guide/public-app-baseline`.

## Artifact rules that bite

- Server scripts (`pltf_script_server`) need **named exports matching the record name** (`module.exports.MyService = MyService`, or `export const MyService` / `export default`). Bare `module.exports =` breaks `xe.*` lookup.
- **ESM + TypeScript are fine in server scripts AND routes.** The engine transpiles on save/compile (`import`/`export` → `require`/`module.exports`, types stripped): the stored `script` is the compiled output, `ts_source` keeps your original (edit it with `field:'ts_source'`, see `obto-deploy`). Two rules: (a) **npm imports resolve from the platform's `node_modules`**: check them with `obto_env_packages`; file a missing package with `sdlc_create_item`, never install it locally; (b) **reference another OBTO artifact as `xe.<record>`, never a relative path** — `import { helper } from './services/foo'` becomes `const { helper } = xe.foo` (or `@xe/foo`, which the compiler rewrites to `xe.foo`). Record names are the artifact names; a synced repo path like `services/vendor-bill.service` lands as record `services_vendor_bill_service` → `xe.services_vendor_bill_service`.
- In route/server code Mongo access is `ob.db`, which has **two surfaces with opposite rules**. (1) The **native driver** `ob.db.getConnection().collection(name).findOne/insertOne/updateOne(...)` returns Promises: `await` it and **never pass a callback** (the driver ignores it, and the request hangs until a 524). `ob.db.collection(...)` is not a function. (2) The **engine wrapper** `ob.db.findOne/create/update/...` is **NOT promise-native**. Only `find()` returns something awaitable (a cursor → `.project().toArray()`). `findOne`/`create`/`update`/`updateMany`/`delete`/`getCount`/`findAndUpdate` take a trailing callback and return `undefined`; a bare `await` on them resolves to `undefined`, and `findOne`/`create` silently substitute a no-op callback so the result vanishes with no error. **Promisify — do not drop the callback:** `await new Promise((resolve, reject) => ob.db.findOne(coll, q, {}, (err, r) => (err ? reject(err) : resolve(r))))`. `update`/`updateMany` take six arguments `(coll, query, update, options, commonOptions, callback)`. A handler whose promise never settles is the classic 524 / `timeout_no_response`. `obto_review_change` fails a bare `await` on the wrapper as an error (`ob_db_bare_await`).
- Pages: a page named `index` serves at the app root; every app needs one.
- Omit `host` on browser-facing artifacts when the app already has them — the canonical host auto-fills, and a mismatched host is rejected with `host_mismatch`.
- Routes are managed by `obto_create_route` / `obto_update_route`, never by `obto_upsert_record`.
- Native client scripts (`pltf_script_client` / `pltf_policy_client`) end with a top-level `return ComponentName;` — that is the contract, and the upsert gate accepts it. The gate also syntax-checks on save, so keep JSX balanced in every intermediate write, not just the final one.
- Data sources (`pltf_data_source`): write via `obto_upsert_record` with `script` = `JSON.stringify({collection, pipeline[, label]})`; `{{var}}` placeholders resolve at run time. Writes are OBTO-admin only: for anyone else a permission refusal is expected — file the change with `sdlc_create_item`. To edit one in place, replace raw line 1 with the complete new compact JSON — fetch/grep show a pretty-printed view whose line numbers don't map to the stored bytes, and the server refuses any patch that leaves the JSON invalid.
- Properties (`obto_get_property` / `obto_set_property`) are the platform's env-var equivalent: dotted keys of at least two segments (e.g. `co.<vendor>.<area>.<key>`), domain-scoped, and never a home for plaintext secrets.

## Importing an existing Node/Express backend

When a repo is brought in (e.g. via the `githubintegration` sync), a standard Express backend lands as `pltf_script_server` records — controllers, routers, validation, services, middleware — but **OBTO never mounts an Express `Router`.** The `*_routes` files exist as scripts, so their endpoints are unreachable until translated. Translate each route file's endpoints into `pltf_route` records, **one per endpoint**:

- `router.METHOD('/x', authMw, validation, controller.handler)` → a `pltf_route` (`router:'api'`, `path` = the router's mount base + `/x`, e.g. `v1/vendor-bills/:id` → live at `/api/v1/vendor-bills/:id`) whose body: runs the middleware chain inline (promisify each `(req,res,next)` middleware; run express-validator chains with `for (const rule of chain) await rule.run(req)` then `validationResult(req)`), then the controller body. Shape: `module.exports.<routeName> = () => async (req,res) => { … }`.
- Follow the code rules above: keep npm `import`s as-is (check them with `obto_env_packages`), rewrite internal imports to `xe.<record>`.
- Register specific paths (`/lines`, `/by-bill-id/:x`) before bare `:param` routes so they aren't shadowed.
- The **service layer** (`xe.services_*`) assumes the repo's schema. If the app has its own Postgres (`obto_pg_query` answers), keep it on that database through `ob.pg`; the live schema, not the repo's ORM models, is the reference (`obto-database`). Otherwise a port to `ob.db` is a separate migration: scope it with the human.

## Reading existing code — pick the right read for the job

Four reads, each with a distinct purpose — don't reach for a heavier one than you need:

- `search(query, appName, domain)` — find WHICH artifact (semantic search across the app's corpus). Returns ids.
- `fetch(id)` — read a WHOLE artifact. Right for small/medium files; avoid on large modules — it can flood your context.
- `obto_grep_artifact(appName, domain, artifactName, artifactType, pattern|startLine+endLine)` — read a SLICE of one artifact: matching lines (with context) or a line range, each formatted `N| text`. This is the read-side complement to `obto_patch_artifact` — use it to locate an edit site in a large file WITHOUT pulling the whole thing. The line number + line text feed straight into the patch as `startLine` + `anchorText`.
- `obto_patch_artifact` — the WRITE for an in-place edit (line-number based, not string-match).

The standard edit loop on a large artifact is: `grep_artifact` to find the lines → `obto_patch_artifact` to change them. Neither step ever moves the whole file. Read `obto://guide/patching` before editing.

## Large artifacts

If a source file is too big for one tool call, use the chunked-upload path; for a new source too large to emit as chunks at all, use deploy-by-reference (`obto_stage_chunk({action:'from_url'})`). See the `obto-deploy` skill. To EDIT an existing artifact, patch it in place (`obto_patch_artifact`) rather than re-uploading — even when it is large. One platform caveat: a boot-loaded server module (`pltf_script_server`, `pltf_policy_server`) is stored instantly but activates asynchronously — the receipt says `pending_platform_activation` — whereas a normal app artifact is live per request. Activation is the platform's responsibility: use `obto_reload_scripts` where the runtime supports it, otherwise verify with a probe only the new code can answer. Never instruct anyone to restart or recycle anything (see the `obto-platform-boundary` skill).

## Media files

Media the app serves to end users (images, video, PDFs): see `obto-upload`. Never deploy media with the artifact tools.
