---
name: obto-upload
description: >
  This skill should be used when the user asks to upload a LOCAL binary/media file
  (image, video, PDF, or other asset) into OBTO and get back a served/CDN URL —
  "upload this image to OBTO", "host this file on OBTO", "get a served URL for this asset",
  "obto_request_upload_url", "obto_upload_media", "obto_stage_chunk". Covers server-side URL
  fetch, the app's own upload page, and the chunked integrity-gated fallback. This is for
  MEDIA/BINARY into the file store (served via a viewer URL) — for deploying artifact SOURCE (scripts/modules) into collections, use obto-deploy.
version: 0.5.0
---

# Uploading local media/binary into OBTO

OBTO stores media/binary in a file worker and serves it at
`https://{domain}.obto.co/ms/filereader.bto?n=<fileName>` (video via `videoplayer.bto`).
This is a different subsystem from artifact-source deploys (`obto-deploy`): here the goal is to
get *file bytes* into the store and receive a served viewer URL back.

**The hard rule: never inline file bytes into a tool-call argument.** The agent→tool channel
truncates and corrupts large or dense values. Any path that pushes the bytes through a `chunk` / `base64` tool arg is
unreliable on its own. Move the bytes by a side channel and pass only a small reference.

## Decision order

1. **Bytes already at an https URL OBTO can reach** → `obto_upload_media({ url, filename, domain })`.
   The server fetches it directly. Done.
2. **Local file** → ask the user for an https link to it (then step 1), or to upload it through the
   app's own upload page.
3. **Neither is possible** → chunked staging through MCP (below): no grant, no credential.

`obto_request_upload_url` returns a one-time signed link for a person or the app to use. Never use it
yourself from the user's machine, and never put it in a command.

## Fallback: chunked staging with per-chunk integrity (`obto_stage_chunk`)

1. `obto_stage_chunk({ action:"begin", domain, transferEncoding:"base64" })` → `uploadId`.
2. In the shell, `base64` the file and split into **≤ ~1KB** chunks. For each chunk: compute its
   sha256 (shell), then `obto_stage_chunk({ action:"append", domain, uploadId, seq, chunk,
   chunkSha256 })`. On a hash mismatch the server **rejects the chunk without storing or advancing
   the seq** — re-send the same `seq` until it lands byte-exact. (This defeats the agent's
   unreliable emission at the source instead of as a downstream commit failure.)
3. `obto_stage_chunk({ action:"status", domain, uploadId })` → verify the assembled `sha256`
   matches `sha256sum <file>`.
4. **Commit:** `obto_upload_media({ uploadId, filename, domain })` → served URL.

Reliable but slow (many small chunks, occasional retries).

## Rules and gotchas

- **Filename** drives the MIME type and which viewer serves it (`filereader.bto` vs
  `videoplayer.bto`) — always include the real extension.
