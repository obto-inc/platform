---
name: obto-reportcard
description: >
  This skill should be used when the user asks to work on report cards on
  OBTO/SOFOS — read, debug, edit, or create report-card components or
  grade-pipeline reducers (reportcard_component, reportcard_reducer), fix a
  report-card print/PDF issue, change grade computation, or set up a new
  session's report cards. Covers the cluster choice (SOFOS, not the default
  app cluster), session addressing, the reducer pipeline contract, SSR
  safety, edu-base vs school-override inheritance, and the write guardrails.
version: 0.8.0
---

# OBTO Report Cards (SOFOS)

## Cluster first — this work does NOT happen on the default server

Report-card code lives on the **SOFOS cluster**. Use the **`obto-sofos`** MCP server (`ogpss.obto.co/ms/mcp`) for every report-card call; the default `obto` server (`app.obto.co`) has none of this data, and same-named records on it are DIFFERENT records. Call `obto_whoami` on `obto-sofos` before anything else. Its `domain` is only the CONNECTION's default school (the vhost the server connects through, e.g. `ogpss`) — a super-user (`crossTenantEnabled: true`, server 3.5.26+) works on ANY school from this one connection by passing that school's slug as `domain` on every call. When the user names a school, confirm the exact slug against whoami's `tenantDomains` before touching anything; an unknown slug is refused with `unknown_domain` + `didYouMean`. The shared base domain is **`edu`** (a write there reaches every school), and the owning app is **`sofos-reportcard`**. Never mix the two servers in one task.

## The machine

A report card is a two-stage machine, all DB records, no filesystem code:

1. **Grade pipeline** — `reportcard_reducer` records, each one stage, run **sorted by numeric `order`** (e.g. `initcoordinates` 50 → `convertmarkstograde` 200 → `overiderank` 233), orchestrated by `xe.RCInitStructure` / `xe.RCDataServiceV2`. Transforms raw marks + grade config (the `groupconfig` collection, written by the Grade Manager app) into a per-student dataset carried in the `_this` accumulator.
2. **React renderer** — `reportcard_component` records, rendered **twice from the same source**: in the browser, AND server-side (`ReactDOMServer.renderToString` → HTML → PDF) by the `getclassreportcards` route for printing.

## Addressing: session is part of the key

Every record is keyed by **(app, domain, name, session)**. Names repeat across academic years — `RCHeader` may exist in 9 sessions — so a name alone NEVER identifies a record. The live session is the property `co.obto.edu.current.session` (read it with `obto_get_property`). Pass `session` on every grep/fetch/validate/write; use `obto_db_query` when you genuinely need a cross-session view. **Wrong session = invisible edit**: the change never runs this year, or silently runs next year.

## Inheritance: edu base ⊕ school override

School domains inherit the shared `edu` base along the domain chain; same name → the school's record wins. **The biggest footgun on the platform:** if a name exists only in `edu`, editing "the school's report card" by that name edits the base **used by every school**. To change one school, create a school-domain record of that name (a safe override) — only edit the `edu` record when you truly mean all schools. The write tools warn on exactly this; treat the warning as a decision point, not noise.

## Reducer contract (`reportcard_reducer`)

```js
return function({ _this, processedStudents }, callBack, logger) {
  // read/mutate the context, then hand it forward:
  callBack(null, { _this, processedStudents });
};
```

- A `return function` body — no `module.exports`, no ESM, no JSX.
- **Every code path calls `callBack`** — success AND catch. A stage that returns without calling it **hangs the whole pipeline**. This is the #1 failure mode.
- `order` numeric and present — a missing/non-numeric order silently drops the stage and grades compute without it, with no error anywhere. Changing an order re-sequences the pipeline: check the neighboring stages first.
- Stages couple through `_this` (`Data`, `subjects`, `className`, `reportType`, `viewRcCondition`, `getGrade()`, …) — don't rename/remove a key without checking downstream stages.

## Component contract (`reportcard_component`)

```js
let { Fragment } = React;
let ScholasticData = ({ mycoordinate, viewRcCondition, term }) => {
  const RCHelper = ob.M.RCHelper;   // sibling ref, compile-rewritten per session
  return ( /* JSX */ );
};
return ScholasticData;
```

- `React` global + JSX, ends with `return <Name>;` — no imports/exports. Class components are fine too.
- `ob.M.<Name>` compiles to `xe.RC[domain][session].<Name>` — a dangling reference resolves to `undefined` and crashes at render. Verify the target exists in that domain+session before using it.
- **SSR-safe on the render path.** A `window`/`document`/`localStorage` reference doesn't fail in the browser — it fails **weeks later on print day** when PDFs generate. Live components do use browser APIs, but only behind runtime guards (`toprint`/backend branches, `typeof window !== "undefined"`). The write tools WARN on browser APIs because static analysis can't prove a guard — for each warning, prove the guard or fix the code.

## Writing — the guardrails will push back; work with them

1. **Validate before writing:** `obto_validate_script` with the collection and `session`. It enforces the reducer shape + callback discipline and emits the SSR/end-shape warnings for components.
2. `obto_upsert_record` / `obto_patch_artifact` **require `session`** for these collections — a refusal `session_required` echoes the current session to use. New reducers **require numeric `order`** (`order_required`). Set `active` deliberately.
3. Warnings (SSR, end-shape, inheritance target) are not blocks — resolve each one deliberately and say why you proceeded.
4. These records are CRLF — don't let tooling silently rewrite line endings; prefer line-level patches over whole-file rewrites.
5. **After any write, fetch back and verify.** `ok:true` ≠ renders. For components the real test is the SSR/PDF path, not the browser. For reducers, re-check the pipeline sequence (the app graph's `pipeline` edges show stage order).
