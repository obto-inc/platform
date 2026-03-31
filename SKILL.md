---
name: obto-developer
description: >
  Build and deploy full-stack apps on the OBTO platform via MCP tools. OBTO stores all code as MongoDB
  artifacts — no filesystem. Covers collections (pltf_page, pltf_javascript, pltf_stylesheet,
  pltf_script_client, pltf_script_server, pltf_route), deployment tools (obto_upsert_record vs
  obto_create_route), the xe. cross-script pattern, host binding, line-number patching, and
  backend-first deploy order. USE THIS SKILL whenever OBTO MCP tools are connected (obto_upsert_record,
  obto_create_route, obto_fetch_app_graph, obto_semantic_search, obto_patch_artifact), or when the user
  mentions OBTO, deploying to OBTO, or references OBTO collections, hosts, domains, or xe. Even if the
  user just says "build me an app" and OBTO tools are available, use this skill.
---

# OBTO Developer Skill

You are an autonomous Principal Software Engineer operating on the OBTO platform. Your job is to build, debug, and maintain full-stack multi-tenant applications using MCP tools. You call the tools yourself — you never instruct the user to run commands or invoke tools manually.

---

## ⚠️ Five Critical Gotchas

These are the most common mistakes. Internalize them before reading anything else.

### 1. Deployment Order: Backend First, Frontend Last
Always deploy in this sequence:
1. `pltf_script_server` (models, services — the business logic layer)
2. `pltf_route` (API endpoints that reference those services via `xe.`)
3. `pltf_stylesheet` (CSS, if any)
4. `pltf_javascript` (React frontend modules)
5. `pltf_page` (HTML entry point that loads the JS and CSS)

Why: Frontend artifacts reference backend artifacts at runtime. If you deploy a page before its route exists, the app will break on first load. Server scripts must exist before routes can call them via `xe.`.

### 2. The `xe.` Cross-Script Pattern
Server scripts and routes call other server scripts using the `xe.` prefix:
```javascript
const svc = new xe.ContactService();
const result = await svc.save(req.body);
```
- `xe.` dynamically resolves a `pltf_script_server` record by name at runtime.
- The name after `xe.` must exactly match the `name` field of the target server script record.
- Server scripts can chain: `xe.ServiceA` can call `new xe.ServiceB()` internally.
- Routes are the typical entry point: they use `xe.` to reach into the service layer.

### 3. Routes Use `obto_create_route`, NOT `obto_upsert_record`
Every other collection type deploys via `obto_upsert_record`. Routes are the exception — they require `obto_create_route` (or `obto_update_route` for edits). This is because routes carry extra metadata (method, path, router, description) that `obto_upsert_record` doesn't support.

### 4. `pltf_script_client` Has NO Imports
Native frontend components (for the OBTO app shell) cannot use `import` or `export`. All libraries come from window globals (`React`, `antd`, `antdIcons`, `lucidereact`, etc.). The component must end with `return ComponentName;` — not `export default`.

### 5. `host` Is Required for Browser-Facing Collections Only
- **Needs host:** `pltf_page`, `pltf_javascript`, `pltf_stylesheet` — because the platform uses the host header to match browser requests to records.
- **No host:** `pltf_route`, `pltf_script_server`, `pltf_script_client` — these run server-side or are injected by the platform shell.
- All browser-facing records that belong together (a page + its JS + its CSS) must share the same host value.

---

## Platform Overview

OBTO is a distributed, Kubernetes-hosted application platform that stores all application code as database artifacts in MongoDB. There is no traditional filesystem — every component (pages, scripts, routes, stylesheets) lives as a record in a specific collection. The platform uses Vite for frontend module resolution and Express.js for backend routing.

**Key Mental Model:** Think of OBTO like a CMS for code. You don't push files to a server — you upsert records into collections. The platform's runtime reads those records and serves them as if they were files on disk.

### Collections at a Glance

| Collection | What It Stores |
| :--- | :--- |
| `pltf_page` | HTML layout pages (entry points for public websites) |
| `pltf_javascript` | React modules and frontend logic for public apps (ESM) |
| `pltf_stylesheet` | Global CSS stylesheets for public apps |
| `pltf_script_client` | React components for the native OBTO app shell (no imports) |
| `pltf_script_server` | Node.js backend classes and business logic |
| `pltf_route` | Express.js route handlers (API endpoints) |

---

## Core Concepts: Domain, Host & AppName

Every tool call requires scoping parameters. These are not interchangeable:

| Parameter | What It Is | Example | Scope |
| :--- | :--- | :--- | :--- |
| `appName` | Unique identifier for the application. Scopes all records. | `my-shop` | App-level. Every tool call requires it. |
| `domain` | The environment/tenant context. | `staging` | Environment-level. Every tool call requires it. |
| `host` | The hostname that serves browser-facing content. | `my-shop.obto.co` | Only for browser-facing collections. |

**How they relate:** One app (`appName`) exists in one domain (environment). That app can have one or more hosts. Records that share a host are served together as a cohesive website. A `pltf_page` with `host=A` cannot load a `pltf_javascript` with `host=B`.

**Host Determination:**
- If the user specifies a host (e.g., "for myapp.obto.co") → use that host.
- If the user says "build me a website" without specifying → default to `{appName}.obto.co`.
- Only ask the user for host if the app will have multiple separate sites (e.g., admin vs. public).

**Domain Handling:**
- Never hardcode domain as `core` unless explicitly instructed.
- Tools handle the domain at their level.
- Only change domain if the user explicitly requests a different environment.

---

## Request Lifecycle

Understanding how a request flows through the platform is essential for writing correct code.

### Public Website Request (pltf_page + pltf_javascript)
1. Browser requests `https://myapp.obto.co/index`
2. Platform matches the host header against `pltf_page` records → finds page `index` with matching host.
3. Platform returns the HTML content.
4. Browser encounters `<script type="module" src="./App.tsx">` in the HTML.
5. Browser requests `./App.tsx` → platform resolves to a `pltf_javascript` record named `App` with same host.
6. Vite's transform pipeline processes the module (JSX/TSX → JS), resolves imports, and serves it.
7. React mounts to the `#root` div. Page is live.

*Why `.tsx`? OBTO uses `.tsx` as the canonical extension for all React modules. Vite processes `.tsx` by default.*

### API Request (pltf_route + pltf_script_server)
1. Client sends a request to an API endpoint (e.g., `POST /api/contact`).
2. Platform matches the path against `pltf_route` records for the app.
3. Route handler executes as an Express.js handler with `req` and `res`.
4. Route calls a server script via the `xe.` prefix to resolve the `pltf_script_server` class.
5. Server script executes, returns data, route sends the response.

### Native App Request (pltf_script_client)
Native frontend scripts are NOT loaded via HTML script tags. The platform's native app shell injects them into a pre-configured React runtime where all allowed globals are already on the `window` object. The script must return a React component as its final statement.

---

## Component Relationship Map

```text
┌──────────────────── PUBLIC WEBSITE PATH ────────────────────┐
│  Browser Request                                             │
│       │                                                      │
│       ▼                                                      │
│  pltf_page (HTML)  ──── <script src> ───▶ pltf_javascript   │
│       │                    (React Module)                    │
│       │                                                      │
│       └──── <link href> ───────▶ pltf_stylesheet             │
│                                (CSS)                         │
└──────────────────────────────────────────────────────────────┘

┌──────────────────── API / BACKEND PATH ─────────────────────┐
│  Client Request (fetch / form submit)                        │
│       │                                                      │
│       ▼                                                      │
│  pltf_route (Express) ── xe.prefix ──▶ pltf_script_server   │
│       │               (Node.js Class)                        │
│       │                      │                               │
│       │                      └── xe.prefix ─▶ other servers  │
│       ▼                                                      │
│  res.json() / res.send()                                     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────── NATIVE APP PATH ────────────────────────┐
│  Platform App Shell (pre-loaded globals on window)           │
│       │                                                      │
│       ▼                                                      │
│  pltf_script_client (React Component)                        │
│       │                                                      │
│       └── return [ComponentName]  ─▶  mounted into shell     │
└──────────────────────────────────────────────────────────────┘
```

**Binding Rules:**
- **pltf_page ↔ pltf_javascript:** Bound by `<script src>` in the HTML AND by sharing the same `host`.
- **pltf_page ↔ pltf_stylesheet:** Bound by `<link href>` in the HTML AND by sharing the same `host`.
- **pltf_route ↔ pltf_script_server:** Bound by the `xe.` prefix at runtime.
- **pltf_script_server ↔ pltf_script_server:** Server scripts call each other via `xe.`.
- **pltf_script_client:** Standalone — injected by the platform's native app shell.

---

## Collection Reference & Blueprints

### pltf_page — HTML Pages
- **Purpose:** HTML entry point for a public website.
- **Requires host?** Yes.
- **Code Format:** Standard HTML.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>[App Title]</title>
  <link rel="stylesheet" href="./[StyleName].css" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./[ComponentName].tsx"></script>
</body>
</html>
```
⚠️ Do NOT mix module scripts with inline global scripts. Do NOT add a second `<script>` block that manually calls `ReactDOM.render()`. The module handles rendering.

### pltf_javascript — Public Frontend Modules
- **Purpose:** React components for public-facing websites.
- **Requires host?** Yes.
- **Code Format:** Standard ESM. Imports are allowed.
- **Export Pattern:** `export default ComponentName;`

```javascript
import React, { useState } from "react";
import { createRoot } from "react-dom/client";

export default function MyComponent() {
  return (
    <div>Hello OBTO</div>
  );
}

// Mount at the bottom of the file.
const root = createRoot(document.getElementById("root"));
root.render(<MyComponent />);
```
🚫 NEVER attach the component to `window`. Use ES Module exports only.

### pltf_script_client — Native Frontend Components
- **Purpose:** React components for the native OBTO app shell.
- **Requires host?** No.
- **Code Format:** NO import/export statements. All libraries via window globals.
- **Final Statement:** `return ComponentName;`

```javascript
// NO imports. Destructure from window globals.
const { useState, useEffect } = React;
const { Button, Input, Card } = antd;

function MyNativeComponent() {
  const [data, setData] = useState(null);

  return (
    <Card title="My Component">
      {/* your JSX */}
    </Card>
  );
}

// Must end with return statement.
return MyNativeComponent;
```

**Available Window Globals:**

| Category | Globals |
| :--- | :--- |
| Core React | `React`, `ReactDOM`, `createRoot` |
| UI Library | `antd`, `antdIcons`, `lucidereact` |
| State Management | `Provider`, `store`, `RecoilRoot` |
| Charts & Visualization | `Highcharts`, `HighchartsReact`, `antdPlots`, `antv`, `reactFlow` |
| Data & Utilities | `_`, `moment`, `uuidv4`, `XLSX`, `format`, `http`, `cronstrue` |
| Drag & Drop | `Draggable`, `DraggableCore` |
| Date / Timeline | `Timeline`, `TimelineMarkers`, `TodayMarker`, `CustomMarker`, `CursorMarker` |
| Wizards & Steppers | `Stepper`, `Step`, `StepWizard` |
| File & Export | `saveAs`, `print`, `tus` |
| Text & Code | `markdownIt`, `HTMLEncode`, `hljs`, `prettierPluginBabel`, `prettierPluginEstree` |
| Alerts & Progress | `swal`, `NProgress` |
| Other | `CheckboxTree`, `ColumnSelect`, `DailyIframe`, `dco`, `fetchEventSource`, `loadStripe`, `pageService` |

🛑 If a package is not in this list, STOP and inform the user. Do not hallucinate imports.

### pltf_route — Express.js Routes
- **Purpose:** Express.js route handlers (API endpoints).
- **Requires host?** No. But `method`, `path` (no leading `/`), `router`, and `description` are required.
- **Code Format:** CommonJS ONLY. No ES6 exports.
- **Deploy with:** `obto_create_route` (NOT `obto_upsert_record`).

```javascript
// Route name: ContactSubmit
// The exported name MUST match the record name exactly.
module.exports.ContactSubmit = () => {
  return async (req, res) => {
    try {
      const { name, email, message } = req.body;
      const svc = new xe.ContactService();
      const result = await svc.save(req.body);
      res.json({ success: true, id: result.id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
};
```

**URL Construction:** The live URL is `/{router}/{path}`. If `router=api` and `path=v1/contact`, the live URL is `/api/v1/contact`.

**Valid routers:** `api`, `microservice`, `microservicev2`, `site`, `static`, `core`.

### pltf_script_server — Backend Logic
- **Purpose:** Node.js classes with business logic and data access.
- **Requires host?** No.
- **Code Format:** Standard JS classes. `module.exports.ClassName = ClassName`.
- **Cross-Referencing:** Use `xe.` prefix to call other server scripts.

```javascript
class ContactService {
  async save(data) {
    if (!data.email) throw new Error("Email is required");
    const record = { ...data, createdAt: new Date().toISOString(), status: "new" };
    return { id: record.id, status: "saved" };
  }

  async notifyTeam(contactId) {
    const notifier = new xe.NotificationService();
    await notifier.sendEmail({
      to: "team@shop.com",
      subject: "New contact inquiry",
      body: `Contact ID: ${contactId}`
    });
  }
}
module.exports.ContactService = ContactService;
```

#### Database Models (Mongoose)
Server scripts can define MongoDB schemas. Use `ob.require("mongoose")` and handle model redefinition gracefully:

```javascript
const mongoose = ob.require("mongoose");

// Prevent "OverwriteModelError" upon redeployment
try { mongoose.connection.deleteModel("MyModel"); } catch (e) {}

const MyModelSchema = new mongoose.Schema({
  fieldOne: { type: String }
}, { timestamps: true });

module.exports.MyModel = mongoose.model("MyModel", MyModelSchema);
```

### pltf_stylesheet — CSS Stylesheets
- **Purpose:** Global CSS loaded by `pltf_page` via `<link>` tags.
- **Requires host?** Yes.
- **Code Format:** Standard CSS. No preprocessors.

---

## Deployment Quick Reference

| Collection | Tool | appName | domain | host | name | Extra Params |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `pltf_script_server` | `obto_upsert_record` | ✓ | ✓ | ✗ | Class name | — |
| `pltf_route` | `obto_create_route` | ✓ | ✓ | ✗ | Route name | method, path, router, description |
| `pltf_stylesheet` | `obto_upsert_record` | ✓ | ✓ | ✓ | Style name | — |
| `pltf_javascript` | `obto_upsert_record` | ✓ | ✓ | ✓ | Module name | — |
| `pltf_page` | `obto_upsert_record` | ✓ | ✓ | ✓ | Page name | — |
| `pltf_script_client` | `obto_upsert_record` | ✓ | ✓ | ✗ | Component name | — |

**Deploy in this order:** server scripts → routes → stylesheets → javascript → pages.

---

## Standard Operating Procedure (SOP) for Code Changes

Follow this sequence for any modification:

1. **DISCOVER** — Use `obto_semantic_search` to find relevant components.
2. **MAP** — Use `obto_fetch_app_graph` to see dependencies.
3. **FETCH** — Use the specific fetch tool for the artifact type (`obto_fetch_client_script`, `obto_fetch_javascript`, `obto_fetch_server_script`, `obto_fetch_route`, `obto_fetch_page`).
4. **EXECUTE** — Surgical single-line edits → `obto_patch_artifact`. Multi-line or new components → `obto_upsert_record`.
5. **VERIFY** — For backend logic, use `obto_read_runtime_logs`.

---

## MCP Tool Routing

| If You Need To... | Use This Tool |
| :--- | :--- |
| Understand app structure / find a name | `obto_fetch_app_graph` |
| Read a native frontend file | `obto_fetch_client_script` |
| Read a public frontend module | `obto_fetch_javascript` |
| Read a backend file | `obto_fetch_server_script` |
| Read an Express route | `obto_fetch_route` |
| Read an HTML page | `obto_fetch_page` |
| Read a stylesheet | `obto_fetch_stylesheet` |
| Read a client policy | `obto_fetch_client_policy` |
| Read a UI template | `obto_fetch_ui_template` |
| Search codebase by keyword/usage | `obto_semantic_search` |
| Deploy or create any non-route artifact | `obto_upsert_record` |
| Create a route | `obto_create_route` |
| Update a route | `obto_update_route` |
| Edit specific lines in a file | `obto_patch_artifact` |

---

## Patching Rules (Line-Number Based)

The patch tool uses line numbers, not string matching.

### Mandatory Workflow:
1. FETCH the file using the appropriate fetch tool.
2. The response includes `scriptWithLineNumbers` (each line prefixed as `N| code`) and `totalLines`.
3. Identify `startLine` and `endLine` of the block to change.
4. Call `obto_patch_artifact` with `startLine`, `endLine`, `newContent`, and `anchorText`.

### Operation Reference:

| What You Want | How to Express It |
| :--- | :--- |
| Replace single line N | `startLine: N, endLine: N, newContent: "new line"` |
| Replace block N to M | `startLine: N, endLine: M, newContent: "multi\nline\nblock"` |
| Delete lines N through M | `startLine: N, endLine: M, newContent: ""` |
| Insert before line N | `startLine: N, endLine: N-1, newContent: "inserted lines"` |
| Append to end of file | `startLine: totalLines+1, endLine: totalLines, newContent: "appended"` |

### Rules:
- ALWAYS fetch the file immediately before patching. Never reuse line numbers from a previous fetch.
- ALWAYS pass `anchorText` (first 20–30 chars of the start line) to catch stale line numbers.
- `newContent` must be raw code — no line number prefixes.

---

## Agent Discipline

### Tool Usage
- You ARE the developer. Call tools directly via function calling.
- Never instruct the user to run tools, bash commands, or CLI commands.
- Never reference MCP tools in application code — they are for your own use only.

### Anti-Hallucination
- Outputting code in a markdown block does NOT deploy it.
- Never say "I have created the file" unless you actually invoked the deployment tool AND received a successful result.
- If you only drafted the code, say: "Here is the draft. Shall I deploy it?"

### Error Handling
- If a tool returns `isError: true`, read the error, adjust parameters, try once more.
- If the second attempt fails, STOP and report the error.
- Never call the same tool with the same arguments twice.
- If a tool returns "callback timed out" or any network error → STOP immediately. Do not retry.
- If you can't find what you need after 2 search attempts → STOP and ask the user.

### API Testing
To test a route externally (curl/fetch), include these headers:
- `x-access-token`: valid JWT
- `current-domain`: the domain parameter
- `current-appversion`: the appName parameter

---

## Full-Stack Example: Contact Form

This example shows the complete deployment of a contact form — all four layers, in the correct order.

### Step 1: Server Script (`pltf_script_server: ContactService`)
```javascript
class ContactService {
  async save(data) {
    if (!data.email) throw new Error("Email required");
    return { id: "abc123", status: "saved" };
  }
}
module.exports.ContactService = ContactService;
```
Deploy: `obto_upsert_record` → collection: `pltf_script_server`, name: `ContactService`

### Step 2: Route (`pltf_route: ContactSubmit`)
```javascript
module.exports.ContactSubmit = () => {
  return async (req, res) => {
    const svc = new xe.ContactService();
    const result = await svc.save(req.body);
    res.json({ success: true, id: result.id });
  };
};
```
Deploy: `obto_create_route` → name: `ContactSubmit`, method: `POST`, path: `contact`, router: `api`

### Step 3: Frontend Module (`pltf_javascript: ContactPage`)
```javascript
import React, { useState } from "react";
import { createRoot } from "react-dom/client";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState(null);

  const handleSubmit = async () => {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    setStatus(data.success ? "sent" : "error");
  };

  return (
    <div>
      <input placeholder="Name" onChange={e => setForm({...form, name: e.target.value})} />
      <input placeholder="Email" onChange={e => setForm({...form, email: e.target.value})} />
      <textarea placeholder="Message" onChange={e => setForm({...form, message: e.target.value})} />
      <button onClick={handleSubmit}>Send</button>
      {status && <p>{status === "sent" ? "Thank you!" : "Something went wrong."}</p>}
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<ContactPage />);
```
Deploy: `obto_upsert_record` → collection: `pltf_javascript`, name: `ContactPage`, host: `myapp.obto.co`

### Step 4: HTML Page (`pltf_page: contact`)
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contact Us</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./ContactPage.tsx"></script>
</body>
</html>
```
Deploy: `obto_upsert_record` → collection: `pltf_page`, name: `contact`, host: `myapp.obto.co`

**Result:** 4 tool calls, deployed in the correct order. The contact form is live at `https://myapp.obto.co/contact`.
