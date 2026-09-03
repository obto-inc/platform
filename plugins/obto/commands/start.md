---
description: Start an OBTO session — verify identity, resolve the working domain, and set the working context
argument-hint: "[what you're working on]"
---

Initiate an OBTO working session. Arguments: $ARGUMENTS

This plugin configures one OBTO MCP server — **`obto`** (`app.obto.co`), the OBTO platform cluster.

Steps:

1. **Call `obto_whoami`.** Report back: identity, `identityDomain` (the identity's own tenant), the connection's default `domain`, `serverVersion`, and the available apps. If the call fails with an auth error, tell the user to approve the OAuth prompt for the server in their browser — Google sign-in; a first-time sign-in provisions their workspace automatically; authorize once and it's remembered.

   **First-connect triage** — if sign-in doesn't complete, match the symptom before retrying blindly:
   - **401 / any auth error on a tool call** — the connection isn't authorized yet. Approve the OAuth prompt in the browser; that is the whole fix.
   - **400 saying PKCE is mandatory** — the client must send `code_challenge` with `code_challenge_method=S256`. Every current Claude and Codex build does, so this points at an outdated or hand-rolled client, not at the user's account.
   - **"Failed to check authorization requirements" on the sign-in page** — the login page flattening an upstream 400, usually the PKCE rule above or a `redirect_uri` that was never registered. Retry the connection **from the client**, not by reloading that page.
   - **`invalid_redirect_uri` on registration** — that `client_name` is already registered with a different remote callback. Register under a distinct `client_name`, or ask the operator to clear the stale registration.
2. **Resolve the WORKING domain, then state the context.** For super-users (whoami `crossTenantEnabled: true`, server 3.5.26+) the reported `domain` is only the connection vhost's default — NOT a boundary: any active tenant's domain may be passed per call, so one connection serves every tenant on the cluster. If the task names a tenant, confirm its exact slug against whoami's `tenantDomains` and use THAT as `domain` for the whole task — a typo'd slug is refused with `unknown_domain` + `didYouMean`. If the tenant is ambiguous, ask the user. Regular users are pinned to their own domain (`cross_tenant_not_allowed`). Then state the working context in one line — the working domain, and that every subsequent tool call carries `appName` + `domain` explicitly (the server is stateless; there is no active app).
3. **Load the matching skill before touching anything:** building/deploying ⇒ `obto-build-loop` / `obto-deploy`; local media or large files ⇒ `obto-upload`; publishing per-tenant MCP tools/resources/prompts ⇒ `obto-mcp-extend`; remembering/recalling context ⇒ `obto-memory`; anything failing ⇒ `obto-troubleshooting`. If a fix ever seems to need infrastructure — a pod recycle, `kubectl`, a shell, a DNS console — load `obto-platform-boundary` instead: that boundary is not crossed, and what MCP cannot fix is reported as a platform defect.
