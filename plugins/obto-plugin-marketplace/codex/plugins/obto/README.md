# OBTO Plugin for Codex

Build, deploy, verify, and troubleshoot applications on the
[OBTO platform](https://app.obto.co) from Codex.

## Included

- OBTO MCP server connection using the `OBTO_TOKEN` environment variable
- Reliable public and native application build workflow
- Ordered deployment with the right write path: patch-in-place for edits, chunked upload and `from_url` deploy-by-reference for large new artifacts
- Durable OBTO memory guidance
- Activation, routing, database, host, and stale-binding troubleshooting

## Setup

1. Add the repository as a Codex marketplace.
2. Install the **OBTO** plugin.
3. Set `OBTO_TOKEN` to your OBTO JWT in the environment that launches Codex.
4. Restart Codex and begin a new thread.

The agent calls `obto_whoami` first and follows the activation gate before using
app-scoped tools.
