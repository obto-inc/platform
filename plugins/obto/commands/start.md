---
description: Start an OBTO session on a chosen cluster (app.obto.co or SOFOS) and set the working context
argument-hint: "[app|sofos] [what you're working on]"
---

Initiate an OBTO working session. Arguments: $ARGUMENTS

Two OBTO MCP servers are configured by this plugin — they are **separate clusters with separate data**; same-named records on the other cluster are DIFFERENT records:

- **`obto`** — `app.obto.co`. The default/platform cluster: general app building, dev-domain operations.
- **`obto-sofos`** — `ogpss.obto.co`. The SOFOS education cluster: schools, report cards, fees, attendance, marks. **All report-card work happens here.**

Steps:

1. **Resolve the cluster.** If the arguments name one (`app` / `sofos`), use it. If the arguments describe a task that clearly belongs to one cluster (report cards, fees, attendance, marks, school apps ⇒ `obto-sofos`), pick it and say so. Otherwise ask the user which cluster this session targets, with the two descriptions above.
2. **Call `obto_whoami` on the chosen server only.** Report back: identity, `identityDomain` (the identity's own tenant), the connection's default `domain`, `serverVersion`, and the available apps. If the call fails with an auth error, tell the user to approve the OAuth prompt for that server (each server authorizes separately, once).
3. **Resolve the WORKING domain, then state the context.** For super-users (whoami `crossTenantEnabled: true`, server 3.5.26+) the reported `domain` is only the connection vhost's default — NOT a boundary: any active tenant's domain may be passed per call, so one connection serves every school/tenant on the cluster. If the task names a tenant (e.g. a specific school), confirm its exact slug against whoami's `tenantDomains` and use THAT as `domain` for the whole task — a typo'd slug is refused with `unknown_domain` + `didYouMean`. If the tenant is ambiguous, ask the user. Regular users are pinned to their own domain (`cross_tenant_not_allowed`). Then state the working context in one line — cluster, working domain, and that every subsequent tool call carries `appName` + `domain` explicitly (the server is stateless; there is no active app).
4. **Load the matching skill before touching anything:** report-card work ⇒ the `obto-reportcard` skill (session addressing, reducer/component contracts, inheritance and SSR guardrails). Building/deploying ⇒ `obto-build-loop` / `obto-deploy`.
5. **Stay on the chosen cluster for the rest of the task.** If the task genuinely needs the other cluster, say so explicitly before switching — never silently mix them.
