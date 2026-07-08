---
name: obto-memory
description: >
  This skill should be used when the user asks to "remember something about
  this app", "recall what we know", "keep context across conversations",
  mentions OBTO memory/Hindsight, or when an agent needs durable context on
  the OBTO platform. Covers obto_remember / obto_recall scoping modes and
  the discipline for using them effectively.
version: 0.5.0
---

# OBTO Memory Discipline (obto_remember / obto_recall)

Memories are backed by Hindsight (vector-embedded) and survive session resets and pod reboots. Used well, they remove the "agent forgets everything between conversations" blocker for autonomous work.

## Recall before work

Call `obto_recall` **before** making decisions or starting work on anything you may have notes about — app architecture, known quirks, prior decisions. It is fail-soft: if the store is unavailable it returns `{ok:true, returned:0}` rather than blocking.

## Two scoping modes — pick one per call

**App-scoped** (default for interactive/frontier-model agents): pass `appName` + `domain`. Memory is long-lived, scoped to (user, app, domain). Use for durable knowledge ABOUT an app: architecture, conventions, gotchas, preferences.

**Conversation-scoped** (for API-built small-model agents): pass `conversationId` (a UUID you generate, stable for the conversation). Memory becomes the conversation's external working memory — write active app/domain and recent decisions at the start of each turn, read them back to drive tool calls. This is the platform's answer to maintaining context under the stateless contract (see `obto://guide/quickstart` Rule 0.5).

## Write discipline

- Supply a stable `key` for facts that should be **updated in place** — same (key, scope) overwrites. Omit `key` only for append-style notes.
- Write facts worth re-reading: decisions and why, non-obvious constraints, verified procedures. Do not store transient state (use `obto_set_property` for config keys), secrets, or anything needing strong consistency.
- Keep entries self-contained — recall is similarity-based, so an entry should make sense without surrounding context. Convert relative dates to absolute.
- Verify the returned `mode` / `projectKey` matches the scope you intended.

## Effective autonomous pattern

1. Turn start: `obto_recall(query=<task topic>, appName, domain)`.
2. Do the work.
3. Turn end: `obto_remember` anything a future session would need — keyed, scoped, dated.
