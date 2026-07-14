---
name: obto-deploy
description: >
  This skill should be used when the user asks to "deploy to OBTO",
  "upload a large file/module to OBTO", "ship this artifact", "push this
  script to the platform", or when any single artifact source is too large
  for one tool call. Covers deployment order, choosing the write path
  (patch vs. upsert vs. chunked vs. deploy-by-reference), the chunked-upload
  and from_url paths with sha256 verification, and post-deploy verification.
version: 0.7.0
---

# OBTO Deploys and Large Files

## Choose the write path FIRST

Before deploying, decide which path fits — picking wrong is the most common deploy failure. The deciding question is whether the bytes already live in OBTO (an *edit*) or are entering fresh (a *new* artifact):

1. **Editing or deleting part of an existing artifact → `obto_patch_artifact`.** Line-addressed, surgical, and it NEVER reproduces the whole file. This sidesteps byte-exactness entirely, so it is the right tool for almost all changes to existing code — including large files (a 305KB platform module change is still just a few changed lines). On a large file, use `obto_grep_artifact` to find the exact lines without pulling the whole file (it returns `N| text` blocks); for a small file `fetch(id)` is fine. Then patch with an `anchorText` guard. A deletion is just `newContent: ""`. The chunked / base64 / from_url paths below are ONLY for bytes entering the platform fresh — never reach for them to make an edit.
2. **A new artifact small enough for one call → `obto_upsert_record({script})`** directly.
3. **A new artifact too large for one call, that you can reproduce as text → the chunked path** (below). Reliable up to ~9KB per emitted chunk — see the emission ceiling.
4. **A new artifact too large to reproduce as chunks at all (≈300KB+), or already reachable at an https URL → `obto_stage_chunk({action:'from_url'})`** (deploy-by-reference, below). The server fetches the bytes; the agent never emits them.

Reproducing a whole large file just to change a few lines is the trap. If the change is an edit, patch it.

**Exception — compile-on-save clusters (app.obto.co, 2026-07+):** a successful `pltf_script_server` save stores the Babel OUTPUT in `script` and preserves the submitted source in the record's `ts_source` field. Two consequences. (1) Every save renumbers the whole file — re-grep before the next patch and never reuse pre-save line numbers (insert mode has no anchor check and lands blind). (2) Line patches edit the COMPILED text and drift it from `ts_source`. For module-scale changes, update the SOURCE instead (local mirror, or read `ts_source` via `obto_db_query`) and re-deploy the full file via `from_url` + `expectedSha256` — the save recompiles and re-syncs both fields. On clusters without this engine (SOFOS as of 2026-07), `script` is still the source and line patches remain the primary edit path. Note the full-file path runs the export-shape gate: before server 3.5.26 the bare-export scan false-fires if the source merely mentions `module.exports = X` inside a string (3.5.26 line-anchors it).

## Deployment order

1. Backend first (`pltf_script_server`), then routes, then browser-facing artifacts (pages, JS, CSS).
2. Every write carries explicit `appName` + `domain` (stateless contract).
3. Verify after write: fetch the artifact back and compare before moving on. For code-bearing artifacts, also run `obto_validate_script` **by reference** (omit `script`, name the stored artifact) so the validation covers what actually landed. (Known benign false-fire: an ESM-bearing `pltf_script_server` module fails by-reference at line 1.)
4. Exercise one success-path call per new/changed route or tool before calling the deploy done.

## Large artifacts — the chunked path

When a source is too big for a single `obto_upsert_record` call (multi-10KB modules), never truncate or split the artifact itself. Use the staged upload:

1. **Begin**: `obto_stage_chunk({action:'begin', domain})` → returns `uploadId` (buffer is tenant-scoped, expires in 1h, max 4MB total). For sources with many non-ASCII / multi-byte characters, pass `transferEncoding:'base64'` here — see below.
2. **Append in order**: `obto_stage_chunk({action:'append', uploadId, seq, chunk, domain})` with `seq` 0,1,2,… and chunks ≤48KB each. Chunks join verbatim with no separator. Re-sending the last identical chunk is a safe retry.
3. **Verify integrity**: compute the sha256 of the full source locally (`sha256sum <file>` in your shell), then `obto_stage_chunk({action:'status', uploadId, domain})` and compare the assembled `sha256`. **Do not commit on a mismatch** — abort and re-stage.
4. **Commit**: `obto_upsert_record({uploadId, sha256, collection_name, name, appName, domain})` — omit `script`; the staged buffer becomes the source. Every normal upsert guard (ownership, collision, host) still applies.
5. **Fetch back** the committed artifact and spot-check the content.

Use `action:'abort'` to discard a buffer early.

### Multi-byte sources: use base64

A `utf8` chunk is the literal text the client emits, and an agent/LLM harness **cannot reliably reproduce byte-exact UTF-8** for a source dense with multi-byte characters (accents, CJK, emoji, box-drawing). The sha256 gate then rejects every attempt — correctly, but you're stuck. The fix: begin with `transferEncoding:'base64'`, run `base64 <file>` in your shell, and send that ASCII output as the chunks (embedded newlines are fine). base64 round-trips through any tokenizer exactly, the server decodes to the real bytes, and `status.sha256` is reported over the DECODED source so it still matches `sha256sum <file>`. Do all the byte handling (read, base64, sha256, slice) in the shell — the raw file never needs to enter your context. If the change is an edit to an existing file, this whole problem disappears: use `obto_patch_artifact` instead.

### The emission ceiling (why from_url exists)

Emitting chunks gets unreliable at scale: an agent harness silently drops characters on large chunks (observed — 241 chars lost on a 32KB chunk, 8 lost on an 8KB chunk; the sha256 gate caught both, so nothing corrupt shipped, but every commit attempt failed the gate). **Keep emitted chunks around 9KB** — an 18KB source goes cleanly as 2×9KB. Above roughly that ceiling, base64 does NOT rescue you: the failure is in emission, not encoding. Switch to from_url.

### Deploy-by-reference: from_url

For a brand-new artifact too large to reproduce as chunks at all (e.g. a 300KB+ platform module), don't emit anything. Host the exact source at an `https://` URL the server can reach, then:

1. `obto_stage_chunk({action:'from_url', url, expectedSha256, domain})` — the server fetches the bytes itself (https-only, 4MB cap, 30s timeout, optionally restricted by the `co.obto.mcp.fetch_allowlist` property), decodes them into the same staged buffer, and returns an `uploadId`. `expectedSha256` (hex `sha256sum <file>`) is your integrity guarantee — the server rejects with `sha256_mismatch` if the URL served different bytes.
2. **Commit** exactly like the chunked path: `obto_upsert_record({uploadId, sha256, collection_name, name, appName, domain})`, omitting `script`.
3. **Fetch back** and spot-check.

Because the bytes never pass through the agent, there is no emission ceiling — this is the path for the largest sources. It is still a *new-bytes* path: for an edit to something already in OBTO, patch in place instead.

## After a deploy that changes tool schemas

If a deploy adds, removes, or reshapes MCP tools, connected clients may hold a stale catalog. The server evicts stale sessions via a version-mismatch refusal (`-32005`) which forces a clean re-init — if a client shows old schemas or mis-typed parameters, **reconnect the connector** rather than retrying calls.

## Failure modes

- `tool_timeout` → the call hit the server's 30-second wall-clock ceiling (a structured refusal, by design — it exists so you never see an opaque client-side `-32001`). Retry once; if it recurs, shrink the operation (smaller chunks, narrower query, fewer records) instead of hammering the same call.
- Oversized inline payload rejected → single-call `script` payloads are size-capped (~5MB); anything near that belongs on the chunked path anyway.
- Top-level `return X;` rejected in `pltf_script_client` / `pltf_policy_client` → the server predates 3.5.19 (which fixed the gate to accept the contract-required return-wrapped form). Check `obto_whoami.serverVersion` before fighting the validator.
- `sha256_mismatch` on commit → the assembled buffer differs from your source; re-stage from scratch.
- `host_mismatch` → you passed a host contradicting the app's canonical host; omit `host` and retry.
- `name_collision` → you passed an `_id` but a DIFFERENT record already exists at that (name, app, domain). The `existingId` in the error is the loader-canonical record — commit without `_id` (updates the canonical one) rather than forcing yours. Duplicate records for one artifact mean the platform may be serving stale code; flag them to a human for cleanup.
- Out-of-order `seq` → append is strictly ordered; `seq` must equal the count of chunks already appended.
- Buffer expired (1h) → begin again.
- `invalid_base64` / `invalid_encoding` → you began with `transferEncoding:'base64'` but sent a chunk that isn't valid base64 (or began utf8 and sent base64). Re-run `base64 <file>` in the shell and send that output verbatim — never hand-assemble base64.
- Repeated `sha256_mismatch` on a multi-byte source → stop retrying utf8; either switch to `transferEncoding:'base64'`, or — if the source is large — to from_url. Re-emitting the same un-reproducible bytes will keep failing the gate.
- from_url rejected (URL not allowlisted / fetch failed / too large / timed out) → the URL must be `https`, reachable by the **server**, within the 4MB cap and 30s timeout, and permitted by `co.obto.mcp.fetch_allowlist` if that property is set. A `sha256_mismatch` on from_url means the URL served different bytes than `expectedSha256` — fix the hosted file; don't drop the check.
