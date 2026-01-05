import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import DevInspector from "@mcpc-tech/unplugin-dev-inspector-mcp";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    DevInspector.vite({
      enabled: true,
      // disableChrome: true,
      // autoOpenBrowser: true,
      // Only allow these specific default prompts
      // defaultPrompts: ['capture_element', 'view_inspections', 'get_network_requests'],
      visibleAgents: ['Claude Code'],
      prompts: [
        { 
          name: 'Code-Review', 
          title: 'Review Code', 
          description: 'Review this code for bugs',
          template: 'Please review the selected code for potential bugs, performance issues, and best practices.'
        },
        {
          name: 'Code-Optimization', 
          title: 'Optimize Code', 
          description: 'Optimize this code for performance',
          template: 'Please optimize the selected code for performance.'
        }
      ]
    }),
    react(),
  ],
  });
