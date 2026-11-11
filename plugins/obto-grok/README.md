# OBTO plugin for Grok Bot and Cursor

Build, deploy, verify and troubleshoot full-stack applications on the
[OBTO platform](https://www.obto.co/) from Grok Bot or Cursor.

## What is in the plugin

- **MCP server** `obto`: `https://app.obto.co/ms/mcp` (Streamable HTTP, OAuth 2.0 authorization code with PKCE and dynamic client registration). No token, header or environment variable is needed.
- **Seven skills**
  - `obto-build-loop`: build contract, scaffold, one slice, review, validate, rendered-page check
  - `obto-deploy`: deployment order and the right write path for each artifact
  - `obto-upload`: media upload with a served URL
  - `obto-memory`: durable context across conversations
  - `obto-feedback`: reviewer feedback with annotated screenshots
  - `obto-troubleshooting`: error envelope, stale tool lists, logs
  - `obto-platform-boundary`: everything stays inside MCP; no shells, clusters or DNS consoles

## Install

- **Grok Bot**: Settings > Plugins > Marketplace, search `OBTO`, select **Add**. On the plugin page, under **Accounts**, select **Authenticate** and finish the sign-in in the browser.
- **Cursor**: Customize > Plugins, search `OBTO`, select **Install**. Open the `obto` MCP server and select **Connect** to sign in.
- **Local test**: copy this folder to `~/.cursor/plugins/local/obto`, then run **Developer: Reload Window**.

A first sign-in creates a free workspace. Sign in with email and password or with Google.

## First prompts

1. `Connect to OBTO, tell me which workspace is active, and list my apps. Do not change anything.`
2. `Build a full-stack app on OBTO and verify it end to end.`
3. `Diagnose this OBTO error using validation and logs.`

The agent calls `obto_whoami` first. The server is stateless, so every app-scoped call names the app and the workspace explicitly.

## Configuration

None. The plugin declares no variables and stores no secrets.

## Support

- Contact: https://www.obto.co/site/ob/contact
- Privacy: https://www.obto.co/site/ob/privacy
- Terms: https://www.obto.co/site/ob/terms

## License

Apache-2.0. See the repository `LICENSE`.
