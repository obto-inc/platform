---
description: Start an OBTO session — verify identity, resolve the working domain, and set the working context
argument-hint: "[what you're working on]"
---

Initiate an OBTO working session. Arguments: $ARGUMENTS

This plugin configures one OBTO MCP server — **`obto`** (`app.obto.co`), the OBTO platform cluster.

Steps:

1. **Call `obto_whoami` and follow its `startHere.rules` in order.** Name only the user's apps, in plain words. On an auth error, tell the user to accept the Google sign-in prompt in their browser (a first sign-in sets up their workspace).

   **No tools on the `obto` connector** — stop and say exactly: "the obto connector has no tools: check its URL with `codex mcp list` / `claude mcp list`; it must end in /ms/mcp". Never continue on another connector.

   **After an OBTO update** — if whoami's `sessionStale` is `true`, or a tool a release note names is missing, follow "After an OBTO update" in `obto-troubleshooting`. Do not work around the missing tools.
   **Organize first.** One thread = one item; its train id is the work item id (e.g. WT-28) or the team's train number. Title the thread `<train id> <emoji> <short name>`: ⚪ queued, 🟡 in progress, 🟠 blocked (name the blocker), 🟢 done. Retitle when the state changes; with no rename tool, ask the person once. Finish or hand off the item, mark it 🟢, then take the next, one at a time. New work found mid-thread is its own item (`sdlc_create_item`), not a detour.
2. **Read the app's decision page first.** If the MCP resource list has `obto://<domain>/decisions`, read it before planning: on app-specific choices it wins over these skills.
3. **Pass `appName` + `domain` on every call** (the server is stateless); don't narrate it. Super-users: confirm a named tenant's slug in `tenantDomains` first.
4. **Load the matching skill before touching anything:** building/deploying ⇒ `obto-build-loop` / `obto-deploy`; local media or large files ⇒ `obto-upload`; reviewer feedback ⇒ `obto-feedback`; remembering/recalling context ⇒ `obto-memory`; reading or changing the app's own Postgres database ⇒ `obto-database`; anything failing ⇒ `obto-troubleshooting`. If a fix ever seems to need infrastructure — a pod recycle, `kubectl`, a shell, a DNS console — load `obto-platform-boundary` instead: that boundary is not crossed, and what MCP cannot fix is reported as a platform defect.
