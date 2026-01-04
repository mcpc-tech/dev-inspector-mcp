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
      visibleAgents: ['Claude Code']
    }),
    react(),
  ],
  });
