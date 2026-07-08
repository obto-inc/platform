# OBTO Plugin Marketplace

Official Claude and Codex plugins for the [OBTO platform](https://app.obto.co).

## Install in Codex

Add this repository as a local marketplace:

```bash
codex plugin marketplace add "/absolute/path/to/obto-plugin-marketplace"
```

Then open the Codex plugin directory, select the **OBTO** marketplace, and install **OBTO**.
The Codex package lives at `codex/plugins/obto`; the Claude package remains at
`plugins/obto`.
Authorize the connection with OAuth before restarting Codex (no token required):

```bash
codex mcp login obto
```

## Install in Claude

In Claude Code (or Cowork plugin settings):

```
/plugin marketplace add <your-github-org>/obto-plugin-marketplace
/plugin install obto@obto-marketplace
```

On first connect, you'll be prompted to authorize access via OAuth in your browser — approve it once. No token is required.

## Plugins

| Plugin | Description |
|---|---|
| [obto](plugins/obto/) | OBTO MCP server connection + skills: app build loop, deploys & large files, media upload, agent memory, per-tenant MCP extension, troubleshooting |

## Publishing changes

Bump the version in both `plugins/obto/.claude-plugin/plugin.json` and
`codex/plugins/obto/.codex-plugin/plugin.json`, then publish the updated marketplace.
