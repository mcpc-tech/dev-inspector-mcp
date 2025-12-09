---
title: Inspect Web Mcp
emoji: 😻
colorFrom: purple
colorTo: red
sdk: gradio
sdk_version: 5.49.1
app_file: app.py
pinned: false
short_description: AI-powered web debugging with visual element inspection
tags:
  - building-mcp-track-creative
  - mcp-in-action-track-creative
---

# @mcpc-tech/unplugin-dev-inspector-mcp

[![npm version](https://img.shields.io/npm/v/@mcpc-tech/unplugin-dev-inspector-mcp.svg)](https://www.npmjs.com/package/@mcpc-tech/unplugin-dev-inspector-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@mcpc-tech/unplugin-dev-inspector-mcp.svg)](https://www.npmjs.com/package/@mcpc-tech/unplugin-dev-inspector-mcp)

**AI-powered visual debugging for React & Vue via MCP and ACP.**

DevInspector connects your web app directly to your AI agent. Click any element to instantly send its source code, style, and network context to the AI for analysis and fixing.

Works with any MCP-compatible AI client. Supports ACP agents: **Claude Code**, **Codex CLI**, **Gemini CLI**, **OpenCode**, and [more](https://agentclientprotocol.com/overview/agents).

## 📑 Table of Contents

- [Demo Video](#-demo-video)
- [Key Features](#-key-features)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [How It Works](#-what-it-does)
- [Workflow Modes](#-two-workflow-modes)
- [MCP Tools](#-mcp-tools)
- [Architecture](#-architecture)

## 🎬 Demo Video

[![Demo Video](https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExbnVvb2Y4MmJqbGJyMGJkendvZjkzZHN5MG4zY21mMXhjemF6dWk4aSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/67nUJwE7Fb2TMhBjhy/giphy.gif)](https://www.youtube.com/shorts/TCt2oOtPS_k)

👉 **Watch the demo:** [https://www.youtube.com/shorts/TCt2oOtPS_k](https://www.youtube.com/shorts/TCt2oOtPS_k)

## 📢 Social Media

🐦 **Twittter/X Post:** [https://x.com/yaoandyan/status/1995082020431753600](https://x.com/yaoandyan/status/1995082020431753600?s=20)

## 👥 Team

- [yaonyan](https://huggingface.co/zpharnoex) - Project Creator

## 🤝 Sponsors & Integrations

This project uses the following sponsor APIs and platforms:

- **Anthropic** - Claude API for MCP integration testing and AI-powered debugging capabilities
- **Gradio** - `@gradio/client` for connecting to Gradio-powered APIs in the demo app

---

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
# npm
npm i -D @mcpc-tech/unplugin-dev-inspector-mcp

# pnpm
pnpm add -D @mcpc-tech/unplugin-dev-inspector-mcp

# yarn
yarn add -D @mcpc-tech/unplugin-dev-inspector-mcp
```

Add DevInspector to your project:

### Vite

```diff
// vite.config.ts
+import DevInspector from '@mcpc-tech/unplugin-dev-inspector-mcp';
 import react from '@vitejs/plugin-react'; // or vue()

 export default {
   plugins: [
+    DevInspector.vite({
+      enabled: true,
+      enableMcp: true,
+    }),
     react(), // or vue()
   ],
 };
```

> ⚠️ **Plugin order matters:** Place `DevInspector.vite()` **before** `react()`, `vue()`, or `preact()`. Otherwise source locations may show `unknown:0:0`.

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

**✅ Zero Production Impact:** This import is automatically removed in production builds via tree-shaking. The entire dev-inspector code is wrapped in `if (import.meta.env.DEV)` guards, which bundlers statically replace with `false` during production builds.

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
+      enableMcp: true,
+    }),
  ],
};
```

### Next.js

```diff
// next.config.ts
+import DevInspector from '@mcpc-tech/unplugin-dev-inspector-mcp';

const nextConfig: NextConfig = {
+  webpack: (config) => {
+    config.plugins.push(
+      DevInspector.webpack({
+        enabled: true,
+      })
+    );
+    return config;
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

> 💡 **Note:** Webpack and Next.js use a standalone server on port 8888. Run `next dev --webpack` for Webpack mode (Next.js 16+ defaults to Turbopack).


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

### Custom Agents

This plugin uses the [Agent Client Protocol (ACP)](https://agentclientprotocol.com) to connect with AI agents. 

⏱️ **Note:** Initial connection may be slow as agents are launched via `npx` (downloads packages on first run).

Default agents: [View configuration →](https://github.com/mcpc-tech/dev-inspector-mcp/blob/main/packages/unplugin-dev-inspector/client/constants/agents.ts)


You can customize available AI agents and set a default agent:

```typescript
// vite.config.ts
export default {
  plugins: [
    DevInspector.vite({
      enabled: true,
      enableMcp: true,
      // Custom agents (will be merged with default properties)
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
      // Set default agent to show on startup
      defaultAgent: "Claude Code"
    }),
  ],
};
```

**Key Features:**
- Custom agents with the **same name** as [default agents](https://agentclientprotocol.com/overview/agents) automatically inherit missing properties (icons, env)
- You can override just the command/args while keeping default icons
- If no custom agents provided, defaults are: Claude Code, Codex CLI, Gemini CLI, Kimi CLI, Goose, OpenCode


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
