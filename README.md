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

**AI-powered visual debugging for React and Vue via MCP (Model Context Protocol) and ACP (Agent Client Protocol).** Works with any MCP-compatible AI client and popular ACP agents like **Claude Code**, **Codex CLI**, **Gemini CLI**, and **OpenCode**. 

Click any UI element to let AI diagnose issues, inspect source code, analyze network requests, and provide intelligent fixes—all through natural conversation.

## 🎬 Demo Video

[![Demo Video](https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExbnVvb2Y4MmJqbGJyMGJkendvZjkzZHN5MG4zY21mMXhjemF6dWk4aSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/67nUJwE7Fb2TMhBjhy/giphy.gif)](https://www.youtube.com/shorts/TCt2oOtPS_k)

👉 **Watch the demo:** [https://www.youtube.com/shorts/TCt2oOtPS_k](https://www.youtube.com/shorts/TCt2oOtPS_k)

## 📢 Social Media

🐦 **Twitter/X Post:** [https://x.com/yaoandyan/status/1995082020431753600](https://x.com/yaoandyan/status/1995082020431753600?s=20)

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

```bash
npm i -D @mcpc-tech/unplugin-dev-inspector-mcp@beta
```

```typescript
// vite.config.ts
import DevInspector from '@mcpc-tech/unplugin-dev-inspector-mcp';
import react from '@vitejs/plugin-react'; // or vue()

export default {
  plugins: [
    DevInspector.vite({
      enabled: true,
      enableMcp: true,
    }),
    react(), // or vue()
  ],
};
```

> 💡 **Troubleshooting:** If source locations show `unknown:0:0`, try moving `DevInspector.vite()` **before** framework plugins like `react()`, `vue()`, or `preact()`. This ensures source location injection happens before JSX transformation.

Currently supports **Vite**. Webpack, Rollup, esbuild, and Rspack support coming soon.

### For Non-HTML Projects (Miniapps, Library Bundles)

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

#### Custom Virtual Module Name

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

## Configuration

### Auto-Update MCP Config

The plugin automatically updates MCP configuration files for detected editors when the dev server starts. This saves you from manually configuring MCP endpoints.

**Supported editors:** Cursor, VSCode, Windsurf, Claude Code

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

## License

MIT
