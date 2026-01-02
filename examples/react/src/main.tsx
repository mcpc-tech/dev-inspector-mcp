import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { registerInspectorTool } from 'virtual:dev-inspector-mcp'

// Example: Register a custom tool for inspecting React component state
registerInspectorTool({
  name: "get_react_version",
  description: "Get the current React version running in the app",
  inputSchema: {
    type: "object",
    properties: {},
  },
  implementation: () => {
    const version = StrictMode.toString().includes('18') ? '18.x' : 'React version detected';
    return {
      success: true,
      version,
      message: `React version: ${version}`
    };
  }
});

// Example: Register a custom alert tool
registerInspectorTool({
  name: "show_alert",
  description: "Show a browser alert with a custom message",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "Message to display in the alert"
      },
      title: {
        type: "string",
        description: "Optional title for the alert"
      }
    },
    required: ["message"]
  },
  implementation: (args: Record<string, unknown>) => {
    const msg = args.message as string;
    const title = args.title as string | undefined;
    const fullMessage = title ? `${title}\n\n${msg}` : msg;

    alert(fullMessage);
    console.log('[Custom Tool] Alert shown:', fullMessage);

    return {
      success: true,
      displayed: fullMessage,
      timestamp: new Date().toISOString()
    };
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
