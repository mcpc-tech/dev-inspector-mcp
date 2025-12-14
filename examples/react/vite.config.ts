import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import DevInspector from "@mcpc-tech/unplugin-dev-inspector-mcp";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    DevInspector.vite({
      enabled: true,
      autoOpenBrowser: true,
      visibleAgents: ['Claude Code']
    }),
  ],
});
