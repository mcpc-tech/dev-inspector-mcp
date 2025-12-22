<p align="center">
  <img src="./assets/logo.svg" alt="DevInspector Logo" width="50" height="50" />
</p>

# @mcpc-tech/unplugin-dev-inspector-mcp

[![npm version](https://img.shields.io/npm/v/@mcpc-tech/unplugin-dev-inspector-mcp.svg)](https://www.npmjs.com/package/@mcpc-tech/unplugin-dev-inspector-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@mcpc-tech/unplugin-dev-inspector-mcp.svg)](https://www.npmjs.com/package/@mcpc-tech/unplugin-dev-inspector-mcp)

**AI-powered visual debugging for React, Vue, Svelte, SolidJS, Preact & Next.js via MCP and ACP.**

DevInspector connects your web app directly to your AI agent. Click any element to instantly send its source code, style, and network context to the AI for analysis and fixing.

Works with any MCP-compatible AI client. Supports ACP agents: **Claude Code**, **Codex CLI**, **Gemini CLI**, **OpenCode**, and [more](https://agentclientprotocol.com/overview/agents).

## 📑 Table of Contents

- [Demo Video](#-demo-video)
- [Social Media](#-social-media)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
  - [Installation](#installation)
  - [Automated Setup](#-automated-setup-recommended)
  - [Manual Configuration](#manual-configuration)
- [Framework Support](#framework-support)
- [Configuration](#configuration)
  - [Auto-Update MCP Config](#auto-update-mcp-config)
  - [Agent Installation](#agent-installation)
  - [Custom Agents](#custom-agents)
- [What It Does](#what-it-does)
- [Two Workflow Modes](#two-workflow-modes)
- [MCP Tools](#mcp-tools)
- [Custom Inspector Tools](#custom-inspector-tools)
- [MCP Prompts](#mcp-prompts)
- [Architecture](#architecture)

## 🎬 Demo Video

👉 **Watch the demo:** [https://www.youtube.com/shorts/TCt2oOtPS_k](https://www.youtube.com/shorts/TCt2oOtPS_k)

## 📢 Social Media

🐦 **Twittter/X Post:** [https://x.com/yaoandyan/status/1995082020431753600](https://x.com/yaoandyan/status/1995082020431753600?s=20)

![Demo: MCP-powered visual debugging in action](https://media.giphy.com/media/sGCk7b783GiGm5vZGl/giphy.gif)

## Key Features

### 🎯 Visual Context

Click any element to instantly send its source code location, computed styles, and DOM hierarchy to AI. No more explaining "it's the blue button in the header".

### 🛠️ Full DevTools Access

AI can access Chrome DevTools to analyze network requests, console logs, and performance metrics. It sees what you see.

### 🤖 Multi-Agent Workflow

Switch between agents (Claude Code, Goose) and track their debugging progress visually with step-by-step status updates.

## Quick Start

### Installation

```bash
# npm - basic installation
npm i -D @mcpc-tech/unplugin-dev-inspector-mcp

# pnpm - basic installation
pnpm add -D @mcpc-tech/unplugin-dev-inspector-mcp

# yarn - basic installation
yarn add -D @mcpc-tech/unplugin-dev-inspector-mcp
```

> **Note:** If you don't need the ACP agents (Inspector Bar mode), add `--no-optional` to skip installing agent packages:
> ```bash
> npm i -D @mcpc-tech/unplugin-dev-inspector-mcp --no-optional
> pnpm add -D @mcpc-tech/unplugin-dev-inspector-mcp --no-optional
> yarn add -D @mcpc-tech/unplugin-dev-inspector-mcp --no-optional
> ```

### ⚡ Automated Setup (Recommended)

Run the setup command to automatically configure your `vite.config.ts`, `webpack.config.js`, or `next.config.js`:

```bash
npx @mcpc-tech/unplugin-dev-inspector-mcp setup
```

**Options:**

- `--dry-run` - Preview changes without applying them
- `--config <path>` - Specify config file path (auto-detect by default)
- `--bundler <type>` - Specify bundler type: vite, webpack, nextjs
- `--no-backup` - Skip creating backup files
- `--help` - Show help message

**Examples:**

```bash
# Preview changes before applying
npx @mcpc-tech/unplugin-dev-inspector-mcp setup --dry-run

# Setup specific config file
npx @mcpc-tech/unplugin-dev-inspector-mcp setup --config vite.config.ts

# Setup for specific bundler
npx @mcpc-tech/unplugin-dev-inspector-mcp setup --bundler vite
```

This will:

- Detect your bundler configuration
- Add the necessary import
- Add the plugin to your configuration
- Create a backup of your config file

### Manual Configuration

If you prefer to configure it manually:

### Vite

```diff
// vite.config.ts
+import DevInspector from '@mcpc-tech/unplugin-dev-inspector-mcp';
 import react from '@vitejs/plugin-react'; // or vue(), svelte(), solid(), preact()

 export default {
   plugins: [
+    DevInspector.vite({
+      enabled: true,
       showInspectorBar: true, // Default: true. Set to false to hide the UI.
+      autoOpenBrowser: false, // Default: false. Automatically open browser when server starts.
+      // Disable Chrome DevTools integration (useful in CI/headless/cloud environments)
+      // disableChrome: true,
     }),
     react(), // or vue(), svelte(), solid(), preact()
   ],
 };
```

> 📴 **Disable Chrome DevTools integration:** set `disableChrome: true` in plugin options or export `DEV_INSPECTOR_DISABLE_CHROME=1`.

> ⚠️ **Plugin order matters:** Place `DevInspector.vite()` **before** `react()`, `vue()`, `svelte()`, `solid()`, or `preact()`. Otherwise source locations may show `unknown:0:0`.

#### For Non-HTML Projects (Miniapps, Library Bundles)

If your project doesn't use HTML files (e.g., miniapp platforms that only bundle JS):

```typescript
// vite.config.ts
DevInspector.vite({
  enabled: true,
  autoInject: false  // Disable HTML injection
})
```

```typescript
// main.ts or app entry point
import 'virtual:dev-inspector-mcp';  // ← Add this import
```

##### TypeScript Types (Required for `virtual:dev-inspector-mcp`)

If you use TypeScript and import `virtual:dev-inspector-mcp`, make sure your TS config includes the plugin client types:

```jsonc
// tsconfig.json / tsconfig.app.json
{
  "compilerOptions": {
    "types": [
      "vite/client",
      "@mcpc-tech/unplugin-dev-inspector-mcp/client"
    ]
  }
}
```

**✅ Zero Production Impact:** In production builds, `virtual:dev-inspector-mcp` becomes a no-op module. The inspector runtime is guarded by `if (import.meta.env.DEV)`, which bundlers statically replace with `false` during production builds.

##### Custom Virtual Module Name

If `virtual:dev-inspector-mcp` conflicts with your project, you can customize it:

```typescript
// vite.config.ts
DevInspector.vite({
  enabled: true,
  autoInject: false,
  virtualModuleName: 'virtual:my-custom-inspector'  // ← Custom name
})
```

```typescript
// main.ts
import 'virtual:my-custom-inspector';  // ← Use your custom name
```

### Webpack

```diff
// webpack.config.js
+const DevInspector = require('@mcpc-tech/unplugin-dev-inspector-mcp');

module.exports = {
  plugins: [
+    DevInspector.webpack({
+      enabled: true,
+    }),
  ],
};
```

### Next.js

Next.js supports **both Webpack and Turbopack** modes:

```diff
// next.config.ts
+import DevInspector, { turbopackDevInspector } from '@mcpc-tech/unplugin-dev-inspector-mcp';

const nextConfig: NextConfig = {
+  // Webpack configuration (default mode: `next dev`)
+  webpack: (config) => {
+    config.plugins.push(
+      DevInspector.webpack({
+        enabled: true,
+      })
+    );
+    return config;
+  },
+
+  // Turbopack configuration (`next dev --turbopack`)
+  turbopack: {
+    rules: turbopackDevInspector({
+      enabled: true,
+    }),
+  },
};

export default nextConfig;
```

Then add to your root layout:

```tsx
// app/layout.tsx
import { DevInspector } from "@mcpc-tech/unplugin-dev-inspector-mcp/next";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <DevInspector />
        {children}
      </body>
    </html>
  );
}
```

**Running modes:**

- **Webpack mode:** `next dev` (uses webpack configuration)
- **Turbopack mode:** `next dev --turbopack` (uses turbopack configuration, Next.js 16+ default)

## Framework Support

### ✅ Fully Supported

- **React** - `.jsx` and `.tsx` files (Vite, Webpack, Next.js)
- **Vue** - `.vue` single-file components (Vite, Webpack)
- **Svelte** - `.svelte` components (Vite, Webpack)
- **SolidJS** - `.jsx` and `.tsx` files (Vite, Webpack)
- **Preact** - `.jsx` and `.tsx` files (Vite, Webpack)
- **Next.js** - React with Webpack and Turbopack modes

### 🚧 In Progress

- **Angular** - Support coming soon

## Configuration

### Auto-Update MCP Config

The plugin automatically updates MCP configuration files for detected editors when the dev server starts. This saves you from manually configuring MCP endpoints.

**Supported editors:** Cursor, VSCode, Windsurf, Claude Code, Antigravity

```typescript
// vite.config.ts
DevInspector.vite({
  // Auto-detect and update (default: true)
  updateConfig: true,

  // Or specify editors manually
  updateConfig: ['cursor', 'vscode'],

  // Or disable
  updateConfig: false,

  // Server name in MCP config (default: 'dev-inspector')
  updateConfigServerName: 'my-app-inspector',
})
```

**Custom editors:** For non-standard editors, use `customEditors`:

```typescript
DevInspector.vite({
  customEditors: [
    {
      id: 'my-editor',
      name: 'My Editor',
      configPath: '~/.my-editor',        // absolute, ~/relative, or project-relative
      configFileName: 'mcp.json',
      serverUrlKey: 'url',               // default: 'url'
      configFormat: 'mcpServers',        // 'mcpServers' or 'servers' (vscode-style)
    },
  ],
})
```

### Agent Installation

DevInspector supports multiple AI agents via [ACP](https://agentclientprotocol.com). 

**For npm-based agents** (Claude Code, Codex CLI, Cursor Agent, Droid), you can pre-install them as dev dependencies for faster loading.

**For system-level agents**, install globally:

#### Gemini CLI

```bash
npm install -g @google/gemini-cli
```

[Documentation →](https://github.com/google-gemini/gemini-cli)

#### Kimi CLI

```bash
uv tool install --python 3.13 kimi-cli
```

[Documentation →](https://github.com/MoonshotAI/kimi-cli)

#### Goose

```bash
pipx install goose-ai
```

[Documentation →](https://block.github.io/goose/docs/guides/acp-clients)

#### Opencode

```bash
curl -fsSL https://opencode.ai/install | bash
```

[Documentation →](https://github.com/sst/opencode)

#### CodeBuddy Code

```bash
npm install -g @tencent-ai/codebuddy-code
```

[Documentation →](https://copilot.tencent.com/docs/cli/acp)

> **Note:** If you don't pre-install npm-based agents, they will be launched via `npx` on first use (slower startup).

#### Pre-installing npm-based Agents (Recommended)

The recommended way is to install agents during initial setup (see [Installation](#installation) above).

Alternatively, install them later as dev dependencies:

```bash
# npm
npm i -D @zed-industries/claude-code-acp

# pnpm  
pnpm add -D @zed-industries/claude-code-acp

# Or add directly to package.json
```

```json
{
  "devDependencies": {
    "@zed-industries/claude-code-acp": "^0.12.4",
    "@zed-industries/codex-acp": "^0.7.1",
    "@blowmage/cursor-agent-acp": "^0.1.0",
    "@yaonyan/droid-acp": "^0.0.8"
  }
}
```

> **About optionalDependencies:** Agent packages are installed by default. If you don't need them, use `--no-optional` when installing.

**Why install as `devDependencies`?**
- Ensures faster startup (uses local package via `require.resolve` instead of `npx`)
- Won't affect production bundle (tree-shaken out unless imported)
- Standard practice for development tools

### Custom Agents

This plugin uses the [Agent Client Protocol (ACP)](https://agentclientprotocol.com) to connect with AI agents.

⏱️ **Note:** Initial connection may be slow as agents are launched via `npx` (downloads packages on first run).

Default agents: [View configuration →](https://github.com/mcpc-tech/dev-inspector-mcp/blob/main/packages/unplugin-dev-inspector/client/constants/agents.ts)

You can customize available AI agents, filter visible agents, and set a default agent:

```typescript
// vite.config.ts
export default {
  plugins: [
    DevInspector.vite({
      enabled: true,
      
      // Option 1: Only show specific agents (filters merged agents)
      visibleAgents: ['Claude Code', 'Gemini CLI', 'Goose'],
      
      // Option 2: Add custom agents (merges with defaults)
      agents: [
        {
          name: "Claude Code", // Matches default - auto-fills icon and env
          command: "npx",
          args: ["-y", "@zed-industries/claude-code-acp"],
        },
        {
          name: "My Custom Agent",
          command: "my-agent-cli",
          args: ["--mode", "acp"],
          env: [{ key: "MY_API_KEY", required: true }],
          meta: { icon: "https://example.com/icon.svg" }
        }
      ],
      
      // Option 3: Combine both - add custom agents and filter visibility
      agents: [
        {
          name: "My Custom Agent",
          command: "my-agent-cli",
          args: ["--mode", "acp"],
          env: [{ key: "MY_API_KEY", required: true }],
          meta: { icon: "https://example.com/icon.svg" }
        }
      ],
      visibleAgents: ['Claude Code', 'My Custom Agent'], // Only show these
      
      // Set default agent to show on startup
      defaultAgent: "Claude Code"
    }),
  ],
};
```

**Key Features:**

- **`agents`**: Merges your custom agents with defaults. Agents with the **same name** as [default agents](https://agentclientprotocol.com/overview/agents) automatically inherit missing properties (icons, env)
- **`visibleAgents`**: Filters which agents appear in the UI (applies after merging). Great for limiting options to only what your team uses
- **`defaultAgent`**: Sets which agent is selected on startup
- If no custom agents provided, defaults are: Claude Code, Codex CLI, Gemini CLI, Kimi CLI, Goose, Opencode, Cursor Agent, Droid, CodeBuddy Code

## What It Does

**Click element → Describe issue → AI analyzes → Get fix**

1. Click any UI element to capture context (source, styles, DOM)
2. Describe what's wrong or ask a question about the element
3. AI diagnoses using Chrome DevTools integration
4. Get intelligent solutions through natural conversation

**Examples:**

- "Why is this button not clickable?" → AI checks `pointer-events`, z-index, overlays
- "This API call is failing" → AI analyzes network requests, timing, responses
- "Where is this component?" → Jump to source file and line number

## Two Workflow Modes

DevInspector offers two ways to interact with your AI, depending on your preference:

### 1. Editor Mode

**Best for:** Code-heavy tasks, refactoring, and maintaining flow.

- **How it works:** You use your IDE's AI assistant (Cursor, Windsurf, Copilot).
- **The Flow:** Click an element in the browser -> The context (source, props, styles) is sent to your Editor via MCP -> You ask your Editor to fix it.
- **Why:** Keeps you in your coding environment.

### 2. Inspector Bar Mode (Recommended)

**Best for:** Quick fixes, visual tweaks, or if you don't use an AI editor.

- **How it works:** You use the floating "Inspector Bar" directly in the browser.
- **The Flow:** Click "Ask AI" in the browser -> Select an agent (e.g., Claude Code, Custom Script) -> The agent runs in your terminal but interacts with the browser overlay.
- **Why:** No context switching. Great for "what is this?" questions or network debugging.

## MCP Tools

### `capture_element_context`

Activates visual selector. Returns source location, DOM hierarchy, styles, dimensions, and user notes.

### `list_inspections`

Shows all inspections with ID, element details, notes, and status (pending/in-progress/completed/failed).

### `update_inspection_status`

Updates inspection status with optional progress steps.

**Parameters:** `status`, `message` (required for completed/failed), `progress`, `inspectionId` (optional)

### `execute_page_script`

Executes JavaScript in browser context. Access to window, document, React/Vue instances, localStorage.

### `chrome_devtools`

Agentic tool for Chrome DevTools access. Provides network inspection, console logs, performance metrics, element interaction, and more.

## Custom Inspector Tools

You can register your own custom tools to be used by the AI agent. These tools run directly in the browser context, giving the AI access to your application's state, logic, or any browser APIs.

### `registerInspectorTool`

Use this function to register a tool. It handles the MCP schema definition and implementation in one place.

```typescript
// main.ts or any entry file
import { registerInspectorTool } from 'virtual:dev-inspector-mcp';

registerInspectorTool({
  name: "get_user_state",
  description: "Get current user session and preferences",
  inputSchema: {
    type: "object",
    properties: {
      includeToken: {
        type: "boolean",
        description: "Whether to include the auth token"
      }
    }
  },
  implementation: (args) => {
    // This runs in the browser!
    const user = window.useUserStore?.getState();

    if (args.includeToken) {
      return { user, token: localStorage.getItem('token') };
    }
    return { user };
  }
});
```

These custom tools are automatically discovered and made available to the connected AI agent along with the built-in inspector tools.

## MCP Prompts

### `capture_element`

Capture and analyze UI element context.

### `view_inspections`

View all pending, in-progress, and completed inspections.

### `launch_chrome_devtools`

Opens Chrome with DevTools API. Unlocks network analysis, console logs, performance metrics.

**Parameter:** `url` (defaults to dev server)

💡 Optional if Chrome is already open. Use when you need to launch a new Chrome instance.

### `get_network_requests`

List network requests or get details of a specific one. Always refreshes the list first.

**Parameter:** `reqid` (optional) - If provided, get details for that request. If omitted, just list all requests.

### `get_console_messages`

List console messages or get details of a specific one. Always refreshes the list first.

**Parameter:** `msgid` (optional) - If provided, get details for that message. If omitted, just list all messages.

## Architecture

For a deep dive into how the MCP context, CMCP library, and Puppet binding mechanism work together, see the [Architecture Documentation](./docs/architecture/mcp-cmcp-puppet-architecture.md).

**Key concepts:**

- **Hub-and-spoke model**: Vite dev server acts as central hub managing multiple client connections
- **CMCP bidirectional execution**: Server defines tool schemas, browser client provides implementations
- **Puppet binding**: Enables Chrome DevTools ↔ Inspector message passthrough
- **Dynamic rebinding**: Automatic connection recovery after browser refresh

## License

MIT
