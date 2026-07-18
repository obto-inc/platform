---
description: Start an OBTO session — verify identity, resolve the working domain, and set the working context
argument-hint: "[what you're working on]"
---

Initiate an OBTO working session. Arguments: $ARGUMENTS

This plugin configures one OBTO MCP server — **`obto`** (`app.obto.co`), the OBTO platform cluster.

Steps:

1. **Call `obto_whoami`.** Report back: identity, `identityDomain` (the identity's own tenant), the connection's default `domain`, `serverVersion`, and the available apps. If the call fails with an auth error, tell the user to approve the OAuth prompt for the server in their browser — Google sign-in; a first-time sign-in provisions their workspace automatically; authorize once and it's remembered.
2. **Resolve the WORKING domain, then state the context.** For super-users (whoami `crossTenantEnabled: true`, server 3.5.26+) the reported `domain` is only the connection vhost's default — NOT a boundary: any active tenant's domain may be passed per call, so one connection serves every tenant on the cluster. If the task names a tenant, confirm its exact slug against whoami's `tenantDomains` and use THAT as `domain` for the whole task — a typo'd slug is refused with `unknown_domain` + `didYouMean`. If the tenant is ambiguous, ask the user. Regular users are pinned to their own domain (`cross_tenant_not_allowed`). Then state the working context in one line — the working domain, and that every subsequent tool call carries `appName` + `domain` explicitly (the server is stateless; there is no active app).
3. **Load the matching skill before touching anything:** building/deploying ⇒ `obto-build-loop` / `obto-deploy`; local media or large files ⇒ `obto-upload`; publishing per-tenant MCP tools/resources/prompts ⇒ `obto-mcp-extend`; remembering/recalling context ⇒ `obto-memory`; anything failing ⇒ `obto-troubleshooting`.
