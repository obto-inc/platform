---
name: obto-mcp-extend
description: >
  This skill should be used when the user asks to "create a custom MCP tool
  on OBTO", "add a tool to my domain", "publish a guide/resource through the
  OBTO MCP server", "register an MCP prompt", "extend the OBTO MCP surface",
  or mentions obto_create_mcp_tool / dynamic tools. Covers the per-tenant
  MCP triad (tools, resources, prompts): schema and handler rules, the
  required annotations, Zod v4 traps, and catalog-freshness discipline.
version: 0.7.0
---

# Extending the OBTO MCP surface (per-tenant tools, resources, prompts)

The triad tools `obto_{create,update,delete,list}_mcp_{tool,resource,prompt}` register per-domain dynamic tools, markdown resources and prompt templates that the server serves beside its built-ins to every session in that domain. **The full contract is `obto://guide/mcp-tools`** (`obto_whoami` → `availableResources`): read it before the first create. Where it and a tool description disagree, follow the tool description.

Triad calls take `domain` (from `obto_whoami`), no `appName`. A session sees the artifacts of its own domain, `global` and its parent domains. **Creating or updating a tool or prompt is operator-only** (3.5.93): other callers get `super_user_required` unless the operator lists the tenant in the global property `co.obto.mcp.dynamic_tools.allow_non_superuser`.

## Dynamic tools (`obto_create_mcp_tool`)

- **Name**: `^[a-z][a-z0-9_]*$`, 3–50 chars, unique per domain.
- **`zodSchemaString`**: Zod v4, e.g. `z.object({q: z.string().describe("...")})`. Write `z.record(z.string(), v)` (two arguments). A schema that cannot serialize to JSON Schema (functions, transforms) falls back to `z.object({})` and every argument is stripped.
- **`handlerFunction`**: a **function expression**, e.g. `async (args) => ({ content: [{ type: 'text', text: '...' }] })`. Any other return value is wrapped as JSON text; a returned `{ok:false}` is flagged as an error. Never save an empty or stub handler — set `isActive: false` instead.
- **Sandbox**: 30 s, 1 MiB result, a blocklist over the whole source including comments (`require(`, `import(`, `eval(`, `Function(`, `process`, `__dirname`, `__filename`, `child_process`, `Buffer`); no `setTimeout`, `fetch`, `URL`. A failure returns `dynamic_tool_failed`. `sandboxMode: "strict"` (3.5.72) gives only stdlib + `obtoApi` (`obtoApi.data` on the tenant's exposed collections); the default `legacy` adds `ob` and `xe`. Prefer `strict` when the tool needs only tenant data.
- **Annotations**: `readOnlyHint`, `destructiveHint`, `openWorldHint` plus `annotationJustifications` (10+ chars each). Set them to what the tool CAN do.
- **MCP Apps view** (3.5.68): create a resource at `ui://<domain>/<view>.html` with `mimeType: "text/html;profile=mcp-app"`, then pass `ui: { resourceUri }` on the tool and check `uiResourceCheck`.
- Every call is metered; read it with `obto_usage`.

## Resources and prompts

Resources: markdown by default, at a URI unique in the domain (e.g. `obto://<team>/playbook`). Publish per-tenant doctrine here instead of re-pasting it. Prompts: the `handlerFunction` runs in the strict sandbox and returns `{ messages: [{ role, content: { type: 'text', text } }] }`; `argsSchema` is JSON-schema shaped.

## Tenant end users

Give them `https://app.obto.co/ms/mcp?scope=tenant` (`tenantScopedMcpUrl` in `obto_whoami`): only the tenant's own and parent-domain tools, resources and prompts, no OBTO developer tools. Each tool still enforces tenancy.

## Catalog freshness and the verify loop

A create/update/delete refreshes every live session that follows the domain and sends `tools/list_changed` (3.5.71). Claude Code can call the new tool in the same session; clients that cache the catalog at connect need a reconnect. A super-user who writes another tenant's tool follows that tenant automatically.

1. `obto_list_mcp_tools(domain)` — registered and active.
2. Call it once on its success path; check the envelope.
3. Call it once on a known failure path — the error must be explicit.
4. `obto_usage(domain)` — the call is metered.

An `ok: true` create proves the record write, not that the tool compiles, lists and answers.

## Updating and removing

`obto_update_mcp_tool` edits in place (`ui: null` removes a view); `obto_delete_mcp_tool` deactivates. The same pair exists for resources and prompts.
