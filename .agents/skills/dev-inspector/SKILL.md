---
name: dev-inspector
description: Use this skill when the user wants to add DevInspector (dev-inspector-mcp) to their project, integrate MCP for their editor, set up ACP agents, click-to-source in browser, or debug "inspector not showing" / "MCP not connecting" issues. Triggers on phrases like "add dev inspector", "click to component", "setup inspector", "inspector not working", or any mention of unplugin-dev-inspector-mcp.
---

# DevInspector Integration

## Step 1: Analyze the User's Project

Before doing anything, determine the project setup by checking:

1. **Bundler** -- Look for `vite.config.ts`, `next.config.ts`, `webpack.config.js`, or `react-router.config.ts` in the project root.
2. **Framework** -- Check `package.json` dependencies for `react`, `vue`, `svelte`, `solid-js`, `preact`, `next`, `react-router`.
3. **Package manager** -- Check for `pnpm-lock.yaml` (pnpm), `yarn.lock` (yarn), or `package-lock.json` (npm).
4. **App Router vs Pages Router** (Next.js only) -- Check if `app/layout.tsx` or `src/app/layout.tsx` exists (App Router) vs `pages/_app.tsx` (Pages Router).
5. **Existing inspector setup** -- Search for `@mcpc-tech/unplugin-dev-inspector-mcp` in `package.json` or config files. If already configured, skip to troubleshooting.

## Step 2: Install

Use the detected package manager:

```bash
# pnpm
pnpm add -D @mcpc-tech/unplugin-dev-inspector-mcp

# npm
npm i -D @mcpc-tech/unplugin-dev-inspector-mcp

# yarn
yarn add -D @mcpc-tech/unplugin-dev-inspector-mcp
```

Add `--no-optional` if the user only needs MCP (editor mode) and not ACP agents (browser mode).

## Step 3: Run Automated Setup (Preferred)

The setup command auto-detects the bundler, modifies the config, and for Next.js also injects `<DevInspector />` into the root layout.

```bash
npx @mcpc-tech/unplugin-dev-inspector-mcp setup
```

Choose flags based on the analysis from Step 1:

| Scenario | Flag |
|----------|------|
| Non-HTML project (miniapps, SSR) | `--entry src/main.ts` |
| Next.js with non-standard layout | `--entry src/app/layout.tsx` |
| Cloud IDE / Docker / remote dev | `--host 0.0.0.0` |
| Behind reverse proxy or tunnel | `--public-base-url https://your-domain.com` |
| CI or headless environment | `--disable-chrome` |
| Auto-open browser on start | `--auto-open-browser` |
| Restrict to specific agents | `--visible-agents "Claude Code,Gemini CLI"` |
| Preview without writing files | `--dry-run` |
| Specific bundler (when multiple) | `--bundler vite` or `--bundler nextjs` |

If the setup command succeeds, skip to Step 5.

## Step 4: Manual Setup (Fallback)

Only use manual setup if the automated setup fails or the user's config is too custom.

### Vite (React / Vue / Svelte / Solid / Preact)

```ts
// vite.config.ts
import DevInspector from '@mcpc-tech/unplugin-dev-inspector-mcp';
import react from '@vitejs/plugin-react';

export default {
  plugins: [
    DevInspector.vite({ enabled: true }),
    react(),
  ],
};
```

`DevInspector.vite()` must be placed **before** framework plugins.

### Next.js

Two files must be modified:

**next.config.ts:**

```ts
import DevInspector, { turbopackDevInspector } from '@mcpc-tech/unplugin-dev-inspector-mcp';

const nextConfig = {
  webpack: (config) => {
    config.plugins.push(DevInspector.webpack({ enabled: true }));
    return config;
  },
  turbopack: {
    rules: turbopackDevInspector({ enabled: true }),
  },
};
export default nextConfig;
```

**app/layout.tsx** (or `src/app/layout.tsx`):

```tsx
import { DevInspector } from "@mcpc-tech/unplugin-dev-inspector-mcp/next";

// Add <DevInspector /> inside <body>, before {children}
```

Without the `<DevInspector />` component, the inspector will not load. This is the most common Next.js integration mistake.

### React Router v7+ (Remix)

```ts
// vite.config.ts
import { reactRouter } from "@react-router/dev/vite";
import DevInspector from '@mcpc-tech/unplugin-dev-inspector-mcp';

export default defineConfig({
  plugins: [
    DevInspector.vite({ enabled: true, entry: "app/root.tsx" }),
    reactRouter(),
  ],
});
```

### Webpack

```js
const DevInspector = require('@mcpc-tech/unplugin-dev-inspector-mcp');
module.exports = {
  plugins: [DevInspector.webpack({ enabled: true })],
};
```

## Step 5: Verify

Tell the user to start their dev server. They should see a console log like:

```
[dev-inspector] MCP: http://localhost:6137/__mcp__/sse
```

And a floating inspector bar in the browser. If not, see Troubleshooting below.

## Plugin Options Reference

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` in dev | Enable/disable the plugin |
| `port` | `6137` | Standalone server port (env: `DEV_INSPECTOR_PORT`) |
| `host` | `"localhost"` | Bind address. `true` = `0.0.0.0` |
| `autoOpenBrowser` | `false` | Open Chrome DevTools on start |
| `disableChrome` | `true` | Disable Chrome DevTools integration |
| `showInspectorBar` | `true` | Show floating inspector UI |
| `autoInject` | `true` | Auto-inject into HTML |
| `entry` | - | Entry file for manual injection |
| `updateConfig` | `true` | Auto-update editor MCP config |
| `publicBaseUrl` | - | Public URL for proxied environments |
| `visibleAgents` | all | Filter which agents show in UI |
| `defaultAgent` | `"Claude Code"` | Default selected agent |

## ACP Agents

npm-based (pre-install for faster startup):
- Claude Code: `@agentclientprotocol/claude-agent-acp`
- Codex CLI: `@zed-industries/codex-acp`
- CodeBuddy: `@tencent-ai/codebuddy-code`

Native CLI (must be installed separately):
- Gemini CLI: `gemini --experimental-acp`
- Cursor: `cursor agent acp`
- Droid: `droid exec --output-format acp`
- Goose: `goose acp`
- Opencode: `opencode acp`
- Kimi CLI: `kimi --acp`
- GitHub Copilot: `copilot --acp`

## Gotchas

These are the most common failure points. Check these first before digging deeper.

**Next.js App Router: inspector silently not showing** -- The webpack/turbopack plugin alone is NOT enough. `<DevInspector />` component must be added inside `<body>` in `app/layout.tsx` (or `src/app/layout.tsx`). This is the #1 Next.js integration mistake.

**Vite: source locations show `unknown:0:0`** -- `DevInspector.vite()` must be placed **before** all framework plugins (e.g., `react()`, `vue()`). Order matters.

**`ERR_CONNECTION_REFUSED` on inspector.js** -- The standalone server isn't running. Most likely causes: plugin is disabled, port 6137 is already in use. Fix: check plugin is enabled in dev mode, or set a custom port via `port` option or `DEV_INSPECTOR_PORT` env var.

**MCP not connecting in editor after first setup** -- `updateConfig: true` (default) writes the MCP config on first dev server start. Editor must be **restarted** after that first run to pick up the new config. Endpoint: `http://localhost:6137/__mcp__/sse`.

**React Router v7: inspector doesn't find components** -- Must pass `entry: "app/root.tsx"` (or wherever the root component is) to `DevInspector.vite()`. Without it, auto-injection may miss the entry point.

**Cloud IDE / Docker / remote dev: inspector unreachable** -- Default `host: "localhost"` binds only to loopback. Set `host: true` (= `0.0.0.0`) to bind all interfaces, and set `publicBaseUrl` if behind a reverse proxy or tunnel.

**`--no-optional` installs: ACP browser agents missing** -- The `--no-optional` flag skips browser-mode agent dependencies. Only use it when you need MCP (editor mode) only and have confirmed ACP agents aren't needed.
