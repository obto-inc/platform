---
name: obto-mcp-extend
description: >
  This skill should be used when the user asks to "create a custom MCP tool
  on OBTO", "add a tool to my domain", "publish a guide/resource through the
  OBTO MCP server", "register an MCP prompt", "extend the OBTO MCP surface",
  or mentions obto_create_mcp_tool / dynamic tools. Covers the per-tenant
  MCP triad (tools, resources, prompts): schema and handler rules, the
  required annotations, Zod v4 traps, and catalog-freshness discipline.
version: 0.6.0
---

# Extending the OBTO MCP surface (per-tenant tools, resources, prompts)

The OBTO MCP server is itself extensible from inside a session: the triad CRUD tools — `obto_{create,update,delete,list}_mcp_{tool,resource,prompt}` — register per-domain dynamic tools, markdown resources, and prompt templates that the server then serves alongside its built-ins to every session in that domain. This is how a tenant grows its own MCP surface without touching server code.

All triad calls are **domain-scoped**: they require `domain` (from `obto_whoami`) but no `appName`. Regular users target their own domain; super-users may target any tenant. Exposure follows domain inclusion — an artifact registered at domain X is visible to sessions whose domain resolves to X (or to `global`/a parent).

## Dynamic tools (`obto_create_mcp_tool`)

- **Name**: lowercase, underscores only (`^[a-z][a-z0-9_]*$`, ≤50 chars), unique per domain. It becomes available to all sessions in the domain.
- **`zodSchemaString`**: the input schema as a Zod v4 string, e.g. `z.object({query: z.string()})`. **Zod v4 trap:** `z.record(valueSchema)` with one argument crashes tool listing for the whole domain — always write the two-argument form, `z.record(z.string(), valueSchema)`.
- **`handlerFunction`**: a JavaScript **function expression**, not a bare statement body — write it `async` so you can `await`:
  `async (args) => { const rows = await ...; return { content: [{ type: 'text', text: JSON.stringify(rows) }] }; }`
  `args` is the validated input. The handler compiles in a vm sandbox and runs wrapped in a timeout + structured envelope (`dynamic_tool_failed`), so a broken handler fails loudly per-call instead of taking the session down.
- **Never save an empty or stub handler.** A record whose `handlerFunction` is blank fails to compile at every session init — a dead tool that error-logs forever. If a tool isn't ready, set `isActive: false` or delete it.
- **Annotations are required and reviewed**: `readOnlyHint`, `destructiveHint`, `openWorldHint` (booleans, `idempotentHint` optional) plus `annotationJustifications` — a short written justification for each. Set them truthfully; they drive client-side confirmation behavior.

## Resources (`obto_create_mcp_resource`)

Domain-scoped reference material (markdown by default) served at a URI you choose (e.g. `obto://<team>/playbook`), unique within the domain. Publish per-tenant doctrine here — conventions, runbooks, contracts — instead of re-pasting it into every conversation; any connected agent can pull it on demand. Join array-of-lines sources with `\n` before publishing.

## Prompts (`obto_create_mcp_prompt`)

The `handlerFunction` (same vm sandbox as dynamic tools) must return an MCP `GetPromptResult`: `{ messages: [{ role, content: { type: 'text', text } }] }`. `argsSchema` is a JSON-schema-shaped object: `{ type: 'object', properties: {...}, required: [...] }`.

## Catalog freshness — the discipline that bites

Creating a tool pushes `tools/list_changed`, but most clients cache the tool catalog at connect time, so **a tool you just created is typically NOT callable in the same session that created it**. The verify loop:

1. `obto_list_mcp_tools(domain)` — confirm the tool is registered and active.
2. Reconnect the connector (or start a fresh session) so the client pulls the new catalog.
3. Call the tool once on its success path and check the envelope.

Don't declare a dynamic tool done on the strength of an `ok: true` create response — that proves the record write, not that the tool compiles, lists, and answers.

## Updating and removing

`obto_update_mcp_tool` edits an existing definition in place (same name + domain); `obto_delete_mcp_tool` removes it. The same pair exists for resources and prompts. After any schema reshape, the reconnect rule above applies again — a client holding the old shape will send mis-typed arguments until it refreshes.
