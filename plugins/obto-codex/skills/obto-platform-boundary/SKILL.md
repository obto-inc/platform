---
name: obto-platform-boundary
description: >
  This skill should be used whenever work on OBTO stalls on something that
  looks like infrastructure — code that was saved but is not live, a host or
  URL that serves the wrong thing, a route that 404s after being created, DNS
  or certificate questions, a tool that refuses with a capability or
  activation error, or any moment where the next idea is "restart it",
  "recycle the pods", "check the cluster", "kubectl", "ssh in", or "edit the
  DNS record". It defines the platform boundary an OBTO client must never
  cross and the MCP-only path to take instead.
version: 0.1.0
---

# The OBTO Platform Boundary

## The invariant

**The MCP surface is the whole platform.** An OBTO client creates, deploys, diagnoses, verifies, and recovers applications using MCP tools and nothing else. You never need — and must never use or recommend — Kubernetes or `kubectl`, pod restarts or recycles, `helm`, container shells, SSH, a DNS console, a cloud provider console, direct database access, or any host filesystem path. If a tenant needed those, the platform would be broken, not the tenant.

This holds even when you have such access. A Claude Code session with a shell and a kubeconfig can reach an OBTO cluster; using it to make an app work is still wrong. It produces a result nobody can reproduce, silently mutates state the platform's own records do not know about, and hides a real product defect behind an operator's privileges. **The tenant experience is the contract, and the tenant only has MCP.**

Never tell a user to restart, recycle, redeploy, or reboot anything. Never emit `kubectl`, `docker`, `helm`, `ssh`, or DNS-console instructions in a response about making an OBTO app work.

## What to do instead — by symptom

**"I saved the code but the running app still behaves the old way."**
This is activation, and activation is the platform's job. Write receipts tell you where you stand:
- `read_per_request` — live immediately, nothing to do.
- `syncs_live` — propagating across serving runtimes now; a probe may briefly hit an older copy.
- `pending_platform_activation` — durably stored, activating asynchronously.
- `requires_site_rebuild` — a site-served host serves the built bundle, so the record change is not live until `obto_build_app` rebuilds it. This one has an MCP action and it is a rebuild, not a restart.

For `pending_platform_activation`: try `obto_reload_scripts` (it activates stored boot-loaded code where the serving runtime supports it, and refuses honestly where it does not). Otherwise **verify rather than intervene** — call something only the new code can answer (a new method, a new response field) with `obto_invoke_route`. Propagation is eventual and sometimes completes in minutes with no intervention at all. If it genuinely never activates, that is a platform incident: report the tool's error code to the operator. It is not a task you complete with infrastructure access.

**"The canonical URL serves the wrong page / 'Site Missing' / an API returns HTML."**
Run `obto_repair_publish({appName, domain, mode:'dry_run'})`. It walks the whole serving chain — app host binding, site registration and flags, DNS, root-document identity, bundle asset, API-as-JSON on both the canonical host and the tenant ingress — and reports structured `{check, before, action}` evidence. Then `mode:'repair'` applies the safe fixes and reports before/after. If it returns a caveat or incident code it cannot fix from data, that is the honest end of the tenant path: relay the code to the operator. Do not go hunting for the ingress yourself.

**"A route 404s right after I created it."**
Registration is not instant (expect ~1–2 minutes on multi-runtime clusters, and cross-runtime updates can take 20–60s or longer). Wait and re-invoke. A 404 in that window is lag, not a failed write — and never a reason to restart anything. Beware the inverse trap: an immediate post-update smoke can hit a runtime still serving the OLD handler and report success. Verify more than once before trusting it.

**"DNS / the certificate / the host record looks wrong."**
The publish path owns DNS: `obto_build_app` ensures the record and fails loudly when it cannot, and `obto_repair_publish` re-ensures it idempotently. Never open a DNS console for an OBTO host.

**"A tool refuses with a capability or activation error."**
Believe it and stop. Those refusals are deliberate: they exist so a caller is never told to do something outside MCP. Report the code, pick the MCP alternative the envelope names, or tell the human what the operator needs to do — in platform terms ("the serving runtime does not yet carry this capability"), never in infrastructure instructions.

## Verification is semantic, not a status code

The reason boundary violations get invented is usually a bad verification result: something reported healthy, the app plainly was not, and the next move looked like infrastructure. So verify like a stranger, not like a tool:

- **HTTP 200 proves nothing.** OBTO's own "domain was not found" / "Site Missing" shells are served with status 200. A verifier that checks status alone certifies broken apps as working.
- **Check identity, not availability** — is this MY app answering? A public app's page references its own hashed bundle under `/sites/<host>/assets/…`; a platform shell, a login page, another app's page, or a stale build cannot.
- **An HTML 200 on a JSON API is a failure**, never a response. Require the content type and the expected shape.
- **Probe the surface a real visitor uses.** A working preview URL and a working tenant-ingress call do not prove the canonical host works — that gap is exactly how a structurally-dead canonical API survived every green test.
- **Sample more than once.** Multi-runtime clusters converge asynchronously; one lucky probe is not proof.
- `obto_invoke_route` does this for you: it classifies platform shells, fails over to tenant ingress on a semantic failure, and reports `canonicalAttempt` / `connectVia` / `layerVerdict` so you can tell app-code failure from route registration from platform host routing. **Fallback success is not canonical-host success** — read which one you got before declaring done.
- `obto_get_build_status` carries the publish verdict, its per-surface `verify` evidence, and any `caveats`. Read the caveats; a publish can be genuinely published AND carry a known platform degradation.

## How to report a platform defect

When the MCP path is exhausted and something is genuinely wrong beneath it, that is a product finding — write it as one:

1. What you called and what came back (tool, params, structured error code or caveat).
2. What you expected, and the specific semantic check that failed.
3. The surfaces you compared (canonical host vs tenant ingress vs preview), because the difference between them localizes the layer.
4. Blast radius, if visible: does this affect one app or every app of this shape?
5. Stop there. Recommend no infrastructure remedy — the operator owns that decision, and an operator-only workaround applied by a client is how a real defect stays hidden.

That report is worth more than a working app that only works because someone reached around the platform.
