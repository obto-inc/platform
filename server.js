#!/usr/bin/env node
/**
 * OBTO MCP bootstrap server (stdio).
 *
 * OBTO is a hosted multi-tenant app platform exposed as a remote MCP server
 * at https://app.obto.co/ms/mcp (OAuth-protected). This small stdio server is
 * the unauthenticated front door: it introspects cleanly, explains the
 * platform, and hands an agent everything it needs to connect to the real
 * hosted endpoint. Zero dependencies; newline-delimited JSON-RPC per the MCP
 * stdio transport.
 */

'use strict';

const SERVER_NAME = 'obto';
const SERVER_VERSION = '1.0.0';
const HOSTED_ENDPOINT = 'https://app.obto.co/ms/mcp';
const PROTOCOL_FALLBACK = '2025-03-26';

const PLATFORM_INFO = [
  'OBTO — the MCP-native app platform.',
  '',
  'OBTO is a hosted multi-tenant platform where AI agents build and deploy',
  'production applications: pages, API routes, server scripts, databases,',
  'scheduled jobs, logs — all provisioned and served by the platform, with a',
  'live URL per app.',
  '',
  `Hosted MCP endpoint (Streamable HTTP + OAuth): ${HOSTED_ENDPOINT}`,
  'Sign-in: Google OAuth; a workspace (tenant domain) is auto-provisioned on',
  'first sign-in.',
  '',
  'This stdio server is the unauthenticated bootstrap. The full tool surface',
  '(app scaffolding, artifact writes, data queries, memory, media uploads,',
  'usage receipts, and more) lives on the hosted endpoint above.',
].join('\n');

const CONNECT_INSTRUCTIONS = [
  'Connecting to the OBTO hosted MCP server:',
  '',
  `1. Add a remote MCP server with URL ${HOSTED_ENDPOINT} in any client that`,
  '   supports Streamable HTTP with OAuth (Claude, Cursor, VS Code, ...).',
  '2. Complete the Google sign-in when the client opens the OAuth flow.',
  '   A workspace (tenant domain) is auto-provisioned on first sign-in.',
  '3. First call in every conversation: obto_whoami — it returns your domain,',
  '   your apps, and a directory of platform guide resources.',
  '4. Everything is stateless: every app-scoped call carries its own appName',
  '   and domain explicitly. No hidden session state.',
].join('\n');

const GETTING_STARTED = [
  'OBTO getting started:',
  '',
  '1. Connect: add the remote MCP server ' + HOSTED_ENDPOINT + ' to your',
  '   client and sign in with Google. Your workspace is created on the spot.',
  '2. Orient: call obto_whoami. Read obto://guide/quickstart from the',
  '   resource directory it returns.',
  '3. Build: describe the app you want. The platform guides (blueprints,',
  '   deployment checklist, build loop) show the exact artifact shapes.',
  '4. Ship: scaffold with obto_scaffold_app, deploy artifacts with',
  '   obto_upsert_record, wire routes, and smoke-test the live URL.',
  '',
  'Docs and platform doctrine are served as MCP resources by the hosted',
  'endpoint itself — the platform is self-describing.',
].join('\n');

const TOOLS = [
  {
    name: 'obto_server_info',
    description:
      'What OBTO is, what the platform does, and where the full hosted MCP endpoint lives.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'obto_connect',
    description:
      'Step-by-step instructions for connecting an MCP client to the hosted OBTO endpoint (OAuth).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

const PROMPTS = [
  {
    name: 'obto_getting_started',
    description: 'Canonical OBTO onboarding walkthrough: connect, orient, build, ship.',
    arguments: [],
  },
];

function textResult(text) {
  return { content: [{ type: 'text', text }], isError: false };
}

function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;

  switch (method) {
    case 'initialize':
      return {
        protocolVersion: (params && params.protocolVersion) || PROTOCOL_FALLBACK,
        capabilities: { tools: {}, prompts: {}, resources: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          'OBTO bootstrap server. Call obto_server_info to learn about the platform; ' +
          'the full tool surface lives on the OAuth-protected hosted endpoint ' +
          HOSTED_ENDPOINT + '.',
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      const name = params && params.name;
      if (name === 'obto_server_info') return textResult(PLATFORM_INFO);
      if (name === 'obto_connect') return textResult(CONNECT_INSTRUCTIONS);
      throw rpcError(-32602, 'Unknown tool: ' + name);
    }
    case 'prompts/list':
      return { prompts: PROMPTS };
    case 'prompts/get': {
      const name = params && params.name;
      if (name !== 'obto_getting_started') throw rpcError(-32602, 'Unknown prompt: ' + name);
      return {
        description: PROMPTS[0].description,
        messages: [{ role: 'user', content: { type: 'text', text: GETTING_STARTED } }],
      };
    }
    case 'resources/list':
      return { resources: [] };
    case 'resources/templates/list':
      return { resourceTemplates: [] };
    default:
      if (!isRequest) return undefined; // notifications: ignore
      throw rpcError(-32601, 'Method not found: ' + method);
  }
}

function rpcError(code, message) {
  const e = new Error(message);
  e.rpcCode = code;
  return e;
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    const isRequest = msg.id !== undefined && msg.id !== null;
    try {
      const result = handle(msg);
      if (isRequest) write({ jsonrpc: '2.0', id: msg.id, result: result === undefined ? {} : result });
    } catch (e) {
      if (isRequest) {
        write({
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: e.rpcCode || -32603, message: e.message || 'Internal error' },
        });
      }
    }
  }
});

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

process.stdin.on('end', () => process.exit(0));