<p align="center">
  <img src="https://www.obto.co/resource/img/v2/logo/white-256.png" alt="OBTO" width="80" />
</p>

<h1 align="center">OBTO — The Glass Box AI Platform</h1>

<p align="center">
  <strong>The first MCP-native platform where AI agents deploy production applications.</strong><br/>
  Describe what you want. The AI builds it and deploys it. You get a live URL.
</p>

<p align="center">
  <a href="https://www.obto.co">Website</a> · <a href="https://docs.obto.co">Docs</a> · <a href="https://www.obto.co/site/ob/terms">Terms</a> · <a href="https://www.obto.co/site/ob/privacy">Privacy</a>
</p>

---

## What is OBTO?

OBTO is a full-stack deployment platform built for the age of AI agents. Connect it to **Claude**, **GPT**, **Codex**, or any MCP-compatible model. Describe what you want in plain language. The AI writes the code, provisions the database, and deploys your application to a live URL — all in the same conversation.

No code editor. No terminal. No hosting setup. Full-stack. Not a wrapper over Vercel and Supabase — real backend, real infrastructure, one platform.

OBTO has been running in production since 2019.

---

## Quick Start

### 1. Sign Up
Go to [obto.co](https://www.obto.co) and click **Sign in**. Authenticate with Google. Your OBTO instance is created automatically.

### 2. Copy Your MCP Endpoint
After signing in, you'll see your personal MCP server URL on the landing page. Copy it.

### 3. Get the OBTO Skill
Download [`SKILL.md`](./SKILL.md) from this repository. This file tells the AI how to use OBTO's deployment tools. Place it where your AI client can read it:

| Client | Where to put `SKILL.md` |
|--------|------------------------|
| **Claude Desktop** | Add to your project's knowledge or attach as a file |
| **Cursor** | Place in your workspace root or `.cursor/skills/` |
| **VS Code (Copilot)** | Place in your workspace root |
| **AntiGravity** | Place in your workspace's `.agent/skills/` directory |

### 4. Connect to Your AI Client
Add your MCP server URL to your AI client's MCP configuration:

**Claude Desktop** — Go to Settings → MCP Servers → Add your OBTO endpoint URL. Claude will redirect you to authenticate via OAuth. Approve it.

**Claude Web** — In a project, add the MCP server URL. Authorize when prompted.

**Cursor / VS Code** — Add the MCP server configuration to your settings.

### 5. Build
Type what you want. The AI handles the rest.

```
"Build me a landing page for my coffee shop with a menu, gallery, and contact form."
```

Your app will be live at `yourapp.obto.co`.

---

## What Does the Skill File Do?

The [`SKILL.md`](./SKILL.md) file is a set of instructions that teaches AI models how to build and deploy applications on OBTO. It covers:

- **Platform architecture** — How OBTO stores code as database artifacts (no filesystem)
- **Deployment order** — Backend first, frontend last
- **Collection types** — Pages, JavaScript modules, stylesheets, routes, server scripts
- **The `xe.` pattern** — How backend services call each other
- **MCP tool routing** — Which tool to use for each operation
- **Full-stack examples** — Complete contact form deployment walkthrough

Without this skill file, the AI won't know OBTO's conventions and will produce code that doesn't deploy correctly. With it, the AI becomes an autonomous developer on your OBTO instance.

---

## Supported AI Clients

| Client | MCP Support | Status |
|--------|------------|--------|
| Claude Web | ✅ Native | Fully supported |
| Claude Desktop | ✅ Native | Fully supported |
| Cursor | ✅ Native | Fully supported |
| VS Code (GitHub Copilot) | ✅ Native | Supported |
| AntiGravity | ✅ Native | Fully supported |
| OpenAI Codex | ✅ Via MCP | Supported |

---

## Links

- **Website:** [obto.co](https://www.obto.co)
- **Documentation:** [docs.obto.co](https://docs.obto.co)
- **Terms of Service:** [obto.co/site/ob/terms](https://www.obto.co/site/ob/terms)
- **Privacy Policy:** [obto.co/site/ob/privacy](https://www.obto.co/site/ob/privacy)
- **Responsible Use:** [obto.co/site/ob/responsible-use](https://www.obto.co/site/ob/responsible-use)
- **Contact:** [dev@obto.co](mailto:dev@obto.co)

---

## License

This project is licensed under the [Apache License 2.0](./LICENSE).

© 2026 OBTO Inc. All rights reserved.
