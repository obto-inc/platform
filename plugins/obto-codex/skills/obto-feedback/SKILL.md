---
name: obto-feedback
description: >
  This skill should be used whenever an agent works on an OBTO app that people
  review through DevZone — when the user mentions reviewers, feedback, "what
  did they circle", marked-up screenshots, or asks what needs fixing; when a
  tool result carries "[obto-feedback] N open reviewer feedback item(s)"; when
  the Agent Bridge thread `feedback-<app>` has new messages; and, quietly, at
  the start of any session that edits an app. It tells the agent how reviewer
  feedback reaches it (obto_list_feedback / obto_get_feedback, the injected
  digest, the bridge thread), how to read the annotated screenshot, and how a
  fix is closed out.
version: 0.1.0
---

# OBTO reviewer feedback — read it before you build

Reviewers mark up the live preview of an app inside DevZone (Mark up → draw a
box, arrow, pen stroke or label → note → Save). Each item is a record in
`ai_app_feedback` in the app's own domain with:

- `note` — what the reviewer wrote;
- `annotatedUrl` — a PUBLIC PNG of the page with the reviewer's marks burned in
  (attach it to a vision-capable model to see exactly what they mean);
- `snapshotUrl` — the clean page capture, `viewport` (desktop 1440×900 or mobile
  390×844, full page), `capturedUrl` (which page);
- `overlay.shapes` — the marks as vectors in the snapshot's pixel space;
- `status` — open → proposed → in_progress → fixed | closed | dismissed, with
  `history` and a linked `missionId` when a fix ran as a mission.

## How feedback reaches you (three channels, no one has to tell you)

1. **The tools.** `obto_list_feedback({appName, domain?, status?})` lists open
   items (`status:"all"` for everything); `obto_get_feedback({feedbackId, domain?})`
   returns one item with the overlay and history. Both are read-only and are
   scoped to your connection's tenant (super-users may pass `domain`).
2. **The nudge.** When an app has open feedback, the results of
   `obto_read_app_map`, `obto_fetch_app_graph` and `search` end with
   `[obto-feedback] N open reviewer feedback item(s)…`. Treat it as a prompt to
   call `obto_list_feedback` before changing anything.
3. **The bridge.** Every new item is posted to the Agent Bridge thread
   `feedback-<app>` (kind `question`, author = the reviewer). Agents that poll
   `bridge_inbox_peek` see it; `bridge_thread_read({threadId:"feedback-<app>"})`
   reads the backlog. Inside DevZone the platform also injects an open-feedback
   digest into every agent turn.

## The routine

- **At the start of work on an app:** call `obto_list_feedback` once. If items
  are open, say so in one line ("2 open reviewer items — want me to take
  fb_… first?"); do not nag, do not repeat it every turn.
- **When the user's request touches an item, or asks what reviewers want:**
  call `obto_get_feedback` FIRST, look at `annotatedUrl`, and locate the exact
  artifact/element the marks point at before editing (discover-before-fetch:
  `obto_read_app_map` / `obto_fetch_app_graph` / `search`, never a guessed id).
- **Fixing:** patch the app the normal way (obto-build-loop), verify with
  `obto_capture_preview` on the page the item names, and compare against the
  annotated screenshot. Then tell the user the item can be marked **fixed** from
  the DevZone Feedback drawer — the MCP tools are deliberately read-only, so
  status changes stay with the humans. In DevZone itself, "Fix it" stages a plan
  turn first and "Approve & run" runs the mission that flips the item to fixed.
- **Closed / dismissed items** are hidden from the default list; ask before
  reopening them. Never delete feedback records.

## Do not

- Guess what a reviewer meant when an annotated screenshot exists — read it.
- Modify `ai_app_feedback` rows directly, or write status through the DB.
- Announce feedback on every turn; once per session, then only when relevant.
